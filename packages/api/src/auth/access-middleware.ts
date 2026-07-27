import "../env.d.ts";
import type { Context, MiddlewareHandler } from "hono";
import { verifyAccessJwt } from "./access.ts";

export type AppEnv = {
  Bindings: Env;
  Variables: {
    accessSub?: string;
    accessEmail?: string | null;
  };
};

const ACCESS_JWT_HEADER = "Cf-Access-Jwt-Assertion";
const ACCESS_COOKIE_NAME = "CF_Authorization";

// Task 50: LOCAL-ONLY test bypass for Playwright E2E owner-mode flows — real
// Cloudflare Access can't run against a local `wrangler dev`, so a fake
// identity is injected instead, gated behind TWO independent conditions that
// must both hold, neither of which a real request (browser, extension,
// Access itself) would ever satisfy by accident:
//   1. env.E2E_TEST_MODE is the exact string "true" — not "1"/"TRUE"/any
//      other truthy-looking value, so a typo'd or loosely-truthy override
//      can't silently enable this. wrangler.toml's committed [vars] NEVER
//      sets this key at all (see wrangler.toml — absent, not "false"), so a
//      real `wrangler deploy` has no way to have it set unless someone
//      deliberately passes `--var E2E_TEST_MODE:true` on the deploy command
//      itself — a conspicuous, deliberate act, never an accidental default.
//   2. The request ALSO carries the E2E_TEST_HEADER below with the exact
//      expected value — something only the Playwright harness's own fixture
//      sends (see e2e/fixtures/owner.ts), never a real Access-authenticated
//      browser or the extension.
// Both conditions are re-checked on every single request; there is no
// one-time toggle, cached state, or session this can leak into.
//
// !!! E2E_TEST_MODE MUST NEVER BE SET IN A PRODUCTION DEPLOYMENT !!! Setting
// it (via `--var`, a secret, or a wrangler.toml edit) on any environment a
// real visitor can reach makes every request that also sends the test
// header authenticate as the owner, bypassing Access entirely.
const E2E_TEST_HEADER = "X-E2E-Test-Owner";
const E2E_TEST_HEADER_VALUE = "clipfeed-e2e";
const E2E_TEST_SUB = "e2e-test-owner";
const E2E_TEST_EMAIL = "e2e-test-owner@localhost";

function e2eTestModeBypass(c: Context<AppEnv>): boolean {
  return c.env.E2E_TEST_MODE === "true" && c.req.header(E2E_TEST_HEADER) === E2E_TEST_HEADER_VALUE;
}

interface AccessConfig {
  teamDomain: string;
  aud: string;
}

function readConfig(env: Env): AccessConfig | null {
  const teamDomain = (env.ACCESS_TEAM_DOMAIN ?? "").trim();
  const aud = (env.ACCESS_AUD ?? "").trim();
  if (!teamDomain || !aud) return null;
  return { teamDomain, aud };
}

function extractToken(c: Context<AppEnv>): string | null {
  const header = c.req.header(ACCESS_JWT_HEADER);
  if (header) return header;

  const cookieHeader = c.req.header("Cookie");
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(";")) {
    const [rawName, ...rawValue] = part.trim().split("=");
    if (rawName === ACCESS_COOKIE_NAME) {
      return decodeURIComponent(rawValue.join("="));
    }
  }
  return null;
}

function logAuthFailure(reason: string, path: string): void {
  // Structured, reason-category only — never log token contents.
  console.warn(JSON.stringify({ event: "access_auth_failed", reason, path }));
}

// Gates every route it's mounted on behind a verified Cloudflare Access
// JWT — in this app, that's /api/admin/* only (see index.ts). Public reads
// (the feed, article details, static assets) never pass through this
// middleware at all.
//
// Unlike a typical "open until configured" bootstrap default, this FAILS
// CLOSED when ACCESS_TEAM_DOMAIN/ACCESS_AUD aren't both set: under the
// public-read/owner-write model, an unconfigured instance must never
// silently let mutation routes through open just because nobody's gotten
// around to setting up Access yet.
export function accessAuth(): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    if (e2eTestModeBypass(c)) {
      c.set("accessSub", E2E_TEST_SUB);
      c.set("accessEmail", E2E_TEST_EMAIL);
      return next();
    }

    const config = readConfig(c.env);
    if (!config) {
      logAuthFailure("auth_not_configured", c.req.path);
      return c.json({ error: "auth_not_configured" }, 401);
    }

    const token = extractToken(c);
    if (!token) {
      logAuthFailure("missing_token", c.req.path);
      return c.json({ error: "unauthorized" }, 401);
    }

    const result = await verifyAccessJwt(token, config.teamDomain, config.aud, c.env.CACHE);
    if (!result.ok) {
      logAuthFailure(result.reason, c.req.path);
      return c.json({ error: "unauthorized" }, 401);
    }

    c.set("accessSub", result.claims.sub);
    c.set("accessEmail", result.claims.email ?? null);
    return next();
  };
}
