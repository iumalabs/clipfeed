import "../env.d.ts";
import { assertEquals } from "@std/assert";
import {
  checkRobots,
  crawlDelaySeconds,
  isPathAllowed,
  isRobotsRespectEnabled,
  NO_RULES,
  parseRobotsTxt,
  selectGroup,
} from "./robots.ts";
import { FakeKv } from "../testing/fake_kv.ts";

// --- parseRobotsTxt / selectGroup / isPathAllowed / crawlDelaySeconds ---

Deno.test("parseRobotsTxt: consecutive User-agent lines share one group until a directive closes it", () => {
  const parsed = parseRobotsTxt(
    "User-agent: a\nUser-agent: b\nDisallow: /private\nUser-agent: a\nDisallow: /again",
  );
  assertEquals(parsed.groups.length, 2);
  assertEquals(parsed.groups[0].agents, ["a", "b"]);
  assertEquals(parsed.groups[0].rules, [{ directive: "disallow", pattern: "/private" }]);
  // A later User-agent line re-naming an already-seen agent starts a
  // genuinely NEW, separately-evaluated group.
  assertEquals(parsed.groups[1].agents, ["a"]);
  assertEquals(parsed.groups[1].rules, [{ directive: "disallow", pattern: "/again" }]);
});

Deno.test("parseRobotsTxt: ignores comments, blank lines, and directives before any User-agent", () => {
  const parsed = parseRobotsTxt(
    "# a comment\nDisallow: /orphan\n\nUser-agent: *\nDisallow: /admin # trailing comment\n",
  );
  assertEquals(parsed.groups.length, 1);
  assertEquals(parsed.groups[0].rules, [{ directive: "disallow", pattern: "/admin" }]);
});

Deno.test("parseRobotsTxt: empty/unparseable text yields NO_RULES", () => {
  assertEquals(parseRobotsTxt(""), NO_RULES);
  assertEquals(parseRobotsTxt("not a robots file at all, just prose"), NO_RULES);
});

Deno.test("selectGroup: exact token match wins over the universal group", () => {
  const parsed = parseRobotsTxt("User-agent: gptbot\nDisallow: /\nUser-agent: *\nAllow: /");
  const group = selectGroup(parsed, "GPTBot");
  assertEquals(group?.agents, ["gptbot"]);
});

Deno.test("selectGroup: falls back to the universal '*' group when no token is given or nothing matches", () => {
  const parsed = parseRobotsTxt("User-agent: gptbot\nDisallow: /\nUser-agent: *\nAllow: /");
  assertEquals(selectGroup(parsed)?.agents, ["*"]);
  assertEquals(selectGroup(parsed, "some-other-bot")?.agents, ["*"]);
});

Deno.test("selectGroup: no matching group and no '*' group returns null (unrestricted)", () => {
  const parsed = parseRobotsTxt("User-agent: gptbot\nDisallow: /");
  assertEquals(selectGroup(parsed, "totally-unrelated"), null);
});

Deno.test("isPathAllowed: longest matching pattern wins regardless of directive order", () => {
  const parsed = parseRobotsTxt("User-agent: *\nDisallow: /\nAllow: /public/");
  const group = selectGroup(parsed);
  assertEquals(isPathAllowed(group, "/public/page"), true);
  assertEquals(isPathAllowed(group, "/private/page"), false);
});

Deno.test("isPathAllowed: an exact-length tie between Allow and Disallow favors Allow", () => {
  const parsed = parseRobotsTxt("User-agent: *\nDisallow: /x\nAllow: /x");
  assertEquals(isPathAllowed(selectGroup(parsed), "/x"), true);
});

Deno.test("isPathAllowed: '*' wildcard matches any sequence", () => {
  const parsed = parseRobotsTxt("User-agent: *\nDisallow: /search*query=");
  const group = selectGroup(parsed);
  assertEquals(isPathAllowed(group, "/search/results?query=x"), false);
  assertEquals(isPathAllowed(group, "/search/results"), true);
});

Deno.test("isPathAllowed: trailing '$' anchors the match to the end of the path", () => {
  const parsed = parseRobotsTxt("User-agent: *\nDisallow: /file.pdf$");
  const group = selectGroup(parsed);
  assertEquals(isPathAllowed(group, "/file.pdf"), false);
  assertEquals(isPathAllowed(group, "/file.pdf.html"), true);
});

Deno.test("isPathAllowed: an empty Disallow value disallows nothing", () => {
  const parsed = parseRobotsTxt("User-agent: *\nDisallow:");
  assertEquals(isPathAllowed(selectGroup(parsed), "/anything"), true);
});

Deno.test("isPathAllowed: no matching group at all means allowed", () => {
  assertEquals(isPathAllowed(null, "/anything"), true);
});

Deno.test("crawlDelaySeconds: parses a valid Crawl-delay for the selected group", () => {
  const parsed = parseRobotsTxt("User-agent: *\nCrawl-delay: 5");
  assertEquals(crawlDelaySeconds(selectGroup(parsed)), 5);
});

Deno.test("crawlDelaySeconds: null when absent, or when there's no group at all", () => {
  const parsed = parseRobotsTxt("User-agent: *\nDisallow: /x");
  assertEquals(crawlDelaySeconds(selectGroup(parsed)), null);
  assertEquals(crawlDelaySeconds(null), null);
});

Deno.test("isRobotsRespectEnabled: only the literal 'false' disables it", () => {
  assertEquals(isRobotsRespectEnabled(undefined), true);
  assertEquals(isRobotsRespectEnabled(""), true);
  assertEquals(isRobotsRespectEnabled("true"), true);
  assertEquals(isRobotsRespectEnabled("garbage"), true);
  assertEquals(isRobotsRespectEnabled("false"), false);
  assertEquals(isRobotsRespectEnabled("FALSE"), false);
  assertEquals(isRobotsRespectEnabled(" false "), false);
});

// --- checkRobots: KV cache + lenient-default failure handling ---

Deno.test("checkRobots: a cached robots.txt is parsed and evaluated without any network fetch", async () => {
  const kv = new FakeKv();
  await kv.put("robots:blocked.example", "User-agent: *\nDisallow: /private");
  const allowed = await checkRobots(kv, "blocked.example", "/public/page");
  const disallowed = await checkRobots(kv, "blocked.example", "/private/page");
  assertEquals(allowed.allowed, true);
  assertEquals(disallowed.allowed, false);
});

Deno.test("checkRobots: an empty-string cache entry is the 'no robots.txt found' sentinel — fully allowed", async () => {
  const kv = new FakeKv();
  await kv.put("robots:no-file.example", "");
  const result = await checkRobots(kv, "no-file.example", "/anything");
  assertEquals(result.allowed, true);
});

Deno.test("checkRobots: a KV read failure is treated as fully allowed, never thrown", async () => {
  const kv = new FakeKv();
  kv.get = () => Promise.reject(new Error("KV is down"));
  const result = await checkRobots(kv, "example.com", "/anything");
  assertEquals(result.allowed, true);
});

Deno.test("checkRobots: caching the raw text (not the parsed structure) means a later parser change needs no cache bust — verified by re-parsing what was cached", async () => {
  const kv = new FakeKv();
  await kv.put("robots:example.com", "User-agent: *\nCrawl-delay: 3\nDisallow: /x");
  const result = await checkRobots(kv, "example.com", "/x");
  assertEquals(result.allowed, false);
  assertEquals(result.crawlDelaySeconds, 3);
});

// --- checkRobots: cache MISS -> real fetch path (network stubbed, same
// convention as images_test.ts's stubImageFetch) ---

function stubRobotsFetch(respond: (url: string) => Response) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch =
    ((input: RequestInfo | URL) => Promise.resolve(respond(input.toString()))) as typeof fetch;
  return () => {
    globalThis.fetch = originalFetch;
  };
}

Deno.test("checkRobots: missing robots.txt (404) is treated as fully allowed and cached as the empty-string sentinel", async () => {
  const kv = new FakeKv();
  const restore = stubRobotsFetch(() => new Response("not found", { status: 404 }));
  try {
    const result = await checkRobots(kv, "no-robots.example", "/anything");
    assertEquals(result.allowed, true);
    assertEquals(await kv.get("robots:no-robots.example"), "");
  } finally {
    restore();
  }
});

Deno.test("checkRobots: a network error fetching robots.txt is treated as fully allowed", async () => {
  const kv = new FakeKv();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (() => Promise.reject(new Error("network down"))) as typeof fetch;
  try {
    const result = await checkRobots(kv, "unreachable.example", "/anything");
    assertEquals(result.allowed, true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("checkRobots: a fresh successful fetch is parsed, evaluated, and cached with a 24h TTL", async () => {
  const kv = new FakeKv();
  const restore = stubRobotsFetch(() => new Response("User-agent: *\nDisallow: /private"));
  try {
    const result = await checkRobots(kv, "fresh.example", "/private/page");
    assertEquals(result.allowed, false);
    assertEquals(await kv.get("robots:fresh.example"), "User-agent: *\nDisallow: /private");
    assertEquals(kv.ttls.get("robots:fresh.example"), 24 * 60 * 60);
  } finally {
    restore();
  }
});

Deno.test("checkRobots: unparseable fetched content yields NO_RULES, which is fully allowed", async () => {
  const kv = new FakeKv();
  const restore = stubRobotsFetch(() => new Response("just some prose, not a robots file"));
  try {
    const result = await checkRobots(kv, "unparseable.example", "/anything");
    assertEquals(result.allowed, true);
  } finally {
    restore();
  }
});
