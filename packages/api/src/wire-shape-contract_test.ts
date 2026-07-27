// Task 50 Part C: structural contract tests for the wire shapes the SPA
// depends on (ArticleListItem/admin list item, PublicArticle, SummaryJson,
// SearchResultItem). Runs against the REAL Hono app + REAL toPublicListItem/
// toPublicArticle/buildListQuery/searchArticles code (a FakeD1, not a real
// D1 binding — the same "real routing/handler code, in-memory storage"
// convention already used throughout this test suite, e.g.
// public-admin-routes_test.ts), so this is fast and needs no browser — it
// runs in the ordinary `deno task test` job.
//
// The field lists it checks against (packages/shared/src/wire-shape-keys.ts)
// are compile-time-checked against their source interfaces, not a hand-list
// — see that file's own doc comment. This is the structural fix for the
// exact class of drift that hit LIST_COLUMNS three times (Tasks 34, 40, 49):
// a column silently missing from a real HTTP response fails HERE, at compile
// *and* test time, instead of showing up later as a quietly-broken SPA
// feature.
import "./env.d.ts";
import { assertEquals } from "@std/assert";
import { app } from "./index.ts";
import { FakeD1 } from "./testing/fake_d1.ts";
import { insertPendingArticle, markArticleReady } from "./articles/db.ts";
import {
  ARTICLE_LIST_ITEM_KEYS,
  PUBLIC_ARTICLE_KEYS,
  SEARCH_RESULT_ITEM_KEYS,
  SUMMARY_JSON_KEYS,
} from "../../shared/src/wire-shape-keys.ts";
import type { SummaryJson } from "@clipfeed/shared/types";

const TEAM_DOMAIN = "test-team.cloudflareaccess.com";
const AUD = "test-aud-tag";
const JWKS_CACHE_KEY = `access:jwks:${TEAM_DOMAIN}`;

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlEncodeString(s: string): string {
  return base64UrlEncode(new TextEncoder().encode(s));
}

async function generateKeyPair(): Promise<CryptoKeyPair> {
  return await crypto.subtle.generateKey(
    {
      name: "RSASSA-PKCS1-v1_5",
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256",
    },
    true,
    ["sign", "verify"],
  ) as CryptoKeyPair;
}

async function exportJwk(publicKey: CryptoKey, kid: string): Promise<Record<string, unknown>> {
  const jwk = await crypto.subtle.exportKey("jwk", publicKey) as Record<string, unknown>;
  return { ...jwk, kid, alg: "RS256", use: "sig" };
}

async function signJwt(privateKey: CryptoKey, kid: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT", kid };
  const payload = {
    sub: "owner-1",
    email: "owner@example.com",
    aud: [AUD],
    iss: `https://${TEAM_DOMAIN}`,
    iat: now - 10,
    exp: now + 3600,
    nbf: now - 10,
  };
  const headerB64 = base64UrlEncodeString(JSON.stringify(header));
  const payloadB64 = base64UrlEncodeString(JSON.stringify(payload));
  const signingInput = `${headerB64}.${payloadB64}`;
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    privateKey,
    new TextEncoder().encode(signingInput),
  );
  return `${signingInput}.${base64UrlEncode(new Uint8Array(signature))}`;
}

function makeEnv(): Env {
  const kv = new Map<string, string>();
  return {
    DB: new FakeD1(),
    CACHE: {
      get: (key: string) => Promise.resolve(kv.get(key) ?? null),
      put: (key: string, value: string) => {
        kv.set(key, value);
        return Promise.resolve();
      },
      delete: (key: string) => {
        kv.delete(key);
        return Promise.resolve();
      },
      list: () => Promise.resolve({ keys: [], list_complete: true }),
    },
    ASSETS: { fetch: () => Promise.resolve(new Response("<html>spa shell</html>")) },
    AI: { run: () => Promise.reject(new Error("AI.run should not be called in this test")) },
    SUMMARY_MODEL: "test-model",
    WORKERS_AI_MODEL: "test-workers-ai-model",
    DAILY_SUMMARY_LIMIT: 50,
    PENDING_TIMEOUT_MIN: 10,
    QUEUE_WAIT_TIMEOUT_MIN: 30,
    PUBLIC_BASE_URL: "",
    INTEREST_TOPICS: "testing",
    AGENT_HOUR_UTC: "5",
    AGENT_DAILY_PICKS: "10",
    SUMMARY_BODY_TARGET_CHARS: "1200",
  };
}

function makeExecutionContext() {
  return {
    props: {},
    waitUntil(): void {},
    passThroughOnException(): void {},
  };
}

async function makeOwnerContext(): Promise<{ env: Env; authHeaders: Record<string, string> }> {
  const { publicKey, privateKey } = await generateKeyPair();
  const jwk = await exportJwk(publicKey, "kid-1");
  const env = makeEnv();
  env.ACCESS_TEAM_DOMAIN = TEAM_DOMAIN;
  env.ACCESS_AUD = AUD;
  await env.CACHE.put(JWKS_CACHE_KEY, JSON.stringify({ keys: [jwk] }));
  const token = await signJwt(privateKey, "kid-1");
  return { env, authHeaders: { "Cf-Access-Jwt-Assertion": token } };
}

// Every field a SummaryJson can carry (including the lazily-populated _en
// ones) — so the contract check below has something to assert against for
// every key in SUMMARY_JSON_KEYS.
const FULL_SUMMARY_JSON: SummaryJson = {
  title_ru: "Заголовок",
  title_en: "Title",
  tldr_ru: "Краткое содержание.",
  tldr_en: "TLDR.",
  body_ru: ["Абзац."],
  body_en: ["Paragraph."],
  bullets_ru: ["Пункт."],
  bullets_en: ["Point."],
  tags: ["testing"],
  lang_original: "ru",
};

async function seedReadyArticle(env: Env, id: string): Promise<void> {
  await insertPendingArticle(env.DB, {
    id,
    url: `https://example.com/${id}`,
    title: "Original title",
    source: "example.com",
    tags: ["testing"],
    added_via: "manual",
    added_at: "2026-01-01T00:00:00.000Z",
  });
  await markArticleReady(env.DB, id, {
    full_text: "Full extracted text.",
    title: FULL_SUMMARY_JSON.title_ru,
    author: null,
    lang_original: "ru",
    summary_ru: FULL_SUMMARY_JSON.tldr_ru,
    summary_json: FULL_SUMMARY_JSON,
    tags: ["testing"],
  });
}

function assertHasAllKeys(obj: object, keys: readonly string[], label: string): void {
  const objKeys = new Set(Object.keys(obj));
  for (const key of keys) {
    assertEquals(objKeys.has(key), true, `${label} is missing field "${key}"`);
  }
}

Deno.test("wire contract: GET /api/admin/articles item contains every ArticleListItem field", async () => {
  const { env, authHeaders } = await makeOwnerContext();
  await seedReadyArticle(env, "contract-admin-list");
  const res = await app.request(
    "/api/admin/articles",
    { headers: authHeaders },
    env,
    makeExecutionContext(),
  );
  assertEquals(res.status, 200);
  const body = await res.json() as { items: object[] };
  assertEquals(body.items.length > 0, true);
  assertHasAllKeys(body.items[0], ARTICLE_LIST_ITEM_KEYS, "GET /api/admin/articles item");
});

Deno.test("wire contract: GET /api/admin/articles/:id contains every ArticleListItem field (plus full_text)", async () => {
  const { env, authHeaders } = await makeOwnerContext();
  await seedReadyArticle(env, "contract-admin-detail");
  const res = await app.request(
    "/api/admin/articles/contract-admin-detail",
    { headers: authHeaders },
    env,
    makeExecutionContext(),
  );
  assertEquals(res.status, 200);
  const body = await res.json() as object;
  assertHasAllKeys(body, ARTICLE_LIST_ITEM_KEYS, "GET /api/admin/articles/:id");
});

Deno.test("wire contract: GET /api/articles item contains every PublicArticle field", async () => {
  const env = makeEnv();
  await seedReadyArticle(env, "contract-public-list");
  const res = await app.request("/api/articles", {}, env, makeExecutionContext());
  assertEquals(res.status, 200);
  const body = await res.json() as { items: object[] };
  assertEquals(body.items.length > 0, true);
  assertHasAllKeys(body.items[0], PUBLIC_ARTICLE_KEYS, "GET /api/articles item");
});

Deno.test("wire contract: GET /api/articles/:id contains every PublicArticle field", async () => {
  const env = makeEnv();
  await seedReadyArticle(env, "contract-public-detail");
  const res = await app.request(
    "/api/articles/contract-public-detail",
    {},
    env,
    makeExecutionContext(),
  );
  assertEquals(res.status, 200);
  const body = await res.json() as object;
  assertHasAllKeys(body, PUBLIC_ARTICLE_KEYS, "GET /api/articles/:id");
});

Deno.test("wire contract: GET /api/search item contains every SearchResultItem field, nested article is a full PublicArticle", async () => {
  const env = makeEnv();
  await seedReadyArticle(env, "contract-search-hit");
  const res = await app.request(
    "/api/search?q=Заголовок",
    {},
    env,
    makeExecutionContext(),
  );
  assertEquals(res.status, 200);
  const body = await res.json() as { items: object[] };
  assertEquals(body.items.length > 0, true);
  assertHasAllKeys(body.items[0], SEARCH_RESULT_ITEM_KEYS, "GET /api/search item");
  assertHasAllKeys(
    (body.items[0] as { article: object }).article,
    PUBLIC_ARTICLE_KEYS,
    "GET /api/search item.article",
  );
});

Deno.test("wire contract: a stored summary_json round-trips with every SummaryJson field intact", async () => {
  const { env, authHeaders } = await makeOwnerContext();
  await seedReadyArticle(env, "contract-summary-json");
  const res = await app.request(
    "/api/admin/articles/contract-summary-json",
    { headers: authHeaders },
    env,
    makeExecutionContext(),
  );
  const body = await res.json() as { summary_json: object };
  assertHasAllKeys(body.summary_json, SUMMARY_JSON_KEYS, "stored summary_json");
});
