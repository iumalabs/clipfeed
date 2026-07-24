import "../env.d.ts";
import { fetchRobotsTxt } from "./ssrf.ts";

// Task 48: minimal robots.txt parser + KV-cached evaluator, gating
// server-side article/image fetches. See docs/robots-audit.md for why the
// User-Agent itself is deliberately unchanged (a plain browser string, see
// ssrf.ts's BROWSER_HEADERS) — we never declare a distinct bot identity, so
// group selection below always falls through to the universal
// `User-agent: *` group in practice. `selectGroup`'s `token` parameter
// exists for completeness/testability, not because any call site passes one
// today.

export interface RobotsRule {
  directive: "allow" | "disallow";
  pattern: string;
}

export interface RobotsGroup {
  agents: string[]; // lowercase
  rules: RobotsRule[];
  crawlDelaySeconds: number | null;
}

export interface ParsedRobots {
  groups: RobotsGroup[];
}

export const NO_RULES: ParsedRobots = { groups: [] };

// Real-world robots.txt files are lenient about stray whitespace/comments
// and about a directive line appearing before any `User-agent:` (ignored —
// there's no group to attach it to). Consecutive `User-agent:` lines form
// ONE group sharing the same rules; the first Allow/Disallow/Crawl-delay
// line after them closes that group, so a LATER `User-agent:` line
// (even re-naming an already-seen agent) starts a genuinely new, separately
// evaluated group — matches real files that repeat an agent across
// multiple blocks.
export function parseRobotsTxt(text: string): ParsedRobots {
  const groups: RobotsGroup[] = [];
  let current: RobotsGroup | null = null;
  let sawRuleSinceLastAgent = false;

  for (const rawLine of text.split(/\r\n|\r|\n/)) {
    const line = rawLine.split("#", 1)[0].trim();
    if (!line) continue;
    const colon = line.indexOf(":");
    if (colon === -1) continue;
    const key = line.slice(0, colon).trim().toLowerCase();
    const value = line.slice(colon + 1).trim();

    if (key === "user-agent") {
      if (current && sawRuleSinceLastAgent) current = null;
      if (!current) {
        current = { agents: [], rules: [], crawlDelaySeconds: null };
        groups.push(current);
        sawRuleSinceLastAgent = false;
      }
      current.agents.push(value.toLowerCase());
    } else if (key === "allow" || key === "disallow") {
      if (!current) continue;
      current.rules.push({ directive: key, pattern: value });
      sawRuleSinceLastAgent = true;
    } else if (key === "crawl-delay") {
      if (!current) continue;
      const seconds = Number(value);
      if (Number.isFinite(seconds) && seconds >= 0) current.crawlDelaySeconds = seconds;
      sawRuleSinceLastAgent = true;
    }
    // sitemap/host/other directives: not relevant to a fetch decision.
  }

  return groups.length > 0 ? { groups } : NO_RULES;
}

// Exact match first, then a substring match (the robots.txt spec's own
// matching rule: a declared agent name is a prefix/substring of the
// crawler's real product token), else the universal group. Returns null
// when nothing matches at all (no rules restrict the fetch).
export function selectGroup(parsed: ParsedRobots, token?: string): RobotsGroup | null {
  if (token) {
    const lower = token.toLowerCase();
    const exact = parsed.groups.find((g) => g.agents.includes(lower));
    if (exact) return exact;
    const substring = parsed.groups.find((g) =>
      g.agents.some((a) => a !== "*" && lower.includes(a))
    );
    if (substring) return substring;
  }
  return parsed.groups.find((g) => g.agents.includes("*")) ?? null;
}

function escapeRegexChar(ch: string): string {
  return /[.*+?^${}()|[\]\\]/.test(ch) ? `\\${ch}` : ch;
}

// `*` matches any sequence; a trailing `$` anchors the match to the end of
// the path. An empty pattern (bare `Disallow:`) means "disallow nothing",
// per spec — never matches.
function patternToRegex(pattern: string): RegExp {
  const endAnchored = pattern.endsWith("$");
  const body = endAnchored ? pattern.slice(0, -1) : pattern;
  const source = body.split("*").map((part) => [...part].map(escapeRegexChar).join("")).join(
    ".*",
  );
  return new RegExp(`^${source}${endAnchored ? "$" : ""}`);
}

function isPathMatch(path: string, pattern: string): boolean {
  if (pattern === "") return false;
  return patternToRegex(pattern).test(path);
}

// Longest-matching pattern wins; an exact-length tie goes to Allow (the
// spec's own tie-break, favoring the more permissive rule). No matching
// group, or no rule in the group matching this path, both mean "allowed".
export function isPathAllowed(group: RobotsGroup | null, path: string): boolean {
  if (!group) return true;
  let bestLength = -1;
  let bestAllow = true;
  for (const rule of group.rules) {
    if (!isPathMatch(path, rule.pattern)) continue;
    const isAllow = rule.directive === "allow";
    if (rule.pattern.length > bestLength) {
      bestLength = rule.pattern.length;
      bestAllow = isAllow;
    } else if (rule.pattern.length === bestLength && isAllow) {
      bestAllow = true;
    }
  }
  return bestLength === -1 ? true : bestAllow;
}

export function crawlDelaySeconds(group: RobotsGroup | null): number | null {
  return group?.crawlDelaySeconds ?? null;
}

// Only the literal "false" disables — same convention as FAITHFULNESS_CHECK/
// IMAGES_ENABLED: a missing/garbage value fails open (the gate stays on)
// rather than silently disabling a safety feature the owner didn't mean to
// touch.
export function isRobotsRespectEnabled(raw: string | undefined): boolean {
  return (raw ?? "true").trim().toLowerCase() !== "false";
}

const ROBOTS_CACHE_TTL_SECONDS = 24 * 60 * 60;

function robotsCacheKey(host: string): string {
  return `robots:${host}`;
}

export interface RobotsCheckResult {
  allowed: boolean;
  crawlDelaySeconds: number | null;
}

// Task 48 §1: the one function every entry path calls before a
// server-side article fetch. Loads the host's robots.txt — from the KV
// cache (24h TTL) when present, otherwise fetches it fresh and caches the
// raw text (an empty string sentinel means "no robots.txt found," so a
// later parser fix doesn't need a cache bust to take effect). ANY failure
// along the way — non-200/unreachable/timeout (fetchRobotsTxt already
// folds all of these into a null return), unparseable content, or a KV
// error — is treated as fully ALLOWED, the standard lenient default:
// robots.txt is an opt-in signal, and a failure on our own infrastructure
// must never silently block ingestion the way a real Disallow would.
export async function checkRobots(
  cache: KVNamespace,
  host: string,
  path: string,
): Promise<RobotsCheckResult> {
  let parsed: ParsedRobots;
  try {
    const cached = await cache.get(robotsCacheKey(host));
    if (cached !== null) {
      parsed = cached === "" ? NO_RULES : parseRobotsTxt(cached);
    } else {
      const text = await fetchRobotsTxt(host);
      if (text === null) {
        console.warn(JSON.stringify({ event: "robots_fetch_failed", host }));
        parsed = NO_RULES;
      } else {
        parsed = parseRobotsTxt(text);
      }
      await cache.put(robotsCacheKey(host), text ?? "", {
        expirationTtl: ROBOTS_CACHE_TTL_SECONDS,
      }).catch(() => {});
    }
  } catch (err) {
    console.warn(JSON.stringify({
      event: "robots_check_failed",
      host,
      error: err instanceof Error ? err.message : String(err),
    }));
    parsed = NO_RULES;
  }

  const group = selectGroup(parsed);
  return { allowed: isPathAllowed(group, path), crawlDelaySeconds: crawlDelaySeconds(group) };
}

// The one function every entry path calls: parses `targetUrl`, honors the
// ROBOTS_RESPECT toggle (disabled skips the KV/network round-trip entirely
// and returns fully-allowed), and returns the host alongside the verdict so
// a caller can log it (e.g. agent-pool.ts's pool_dropped_robots).
export async function robotsAllowsUrl(
  cache: KVNamespace,
  respectEnabled: boolean,
  targetUrl: string,
): Promise<RobotsCheckResult & { host: string }> {
  const url = new URL(targetUrl);
  if (!respectEnabled) {
    return { allowed: true, crawlDelaySeconds: null, host: url.hostname };
  }
  const result = await checkRobots(cache, url.hostname, url.pathname + url.search);
  return { ...result, host: url.hostname };
}

// Task 48 §1.2: "the queue is sequential so a simple await suffices, no
// per-host scheduler" — a Crawl-delay is honored inline, right where the
// check happens, rather than via a rate-limiter. In practice this is a
// no-op for every host this project's own audit found (see
// docs/robots-audit.md), kept for spec completeness and testability.
export async function honorCrawlDelay(seconds: number | null): Promise<void> {
  if (!seconds) return;
  await new Promise((resolve) => setTimeout(resolve, seconds * 1000));
}
