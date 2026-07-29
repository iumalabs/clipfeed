import "./env.d.ts";
import { assertEquals } from "@std/assert";
import { app } from "./index.ts";
import { FakeD1 } from "./testing/fake_d1.ts";
import { insertPendingArticle, markArticleFailed } from "./articles/db.ts";
import { FakeQueue } from "./testing/fake_queue.ts";
import { recordAgentRun } from "./agent/agent-run-tracker.ts";

const TEAM_DOMAIN = "test-team.cloudflareaccess.com";
const AUD = "test-aud-tag";
const JWKS_CACHE_KEY = `access:jwks:${TEAM_DOMAIN}`;

// Meets validateSummary's content bar (>=120 char tldrs, 3-6 bullets each
// 20-220 chars and not duplicating the tldr, 1-6 tags) — see summarize.ts.
const VALID_SUMMARY = {
  title_ru: "Компания подняла цену подписки на 60% с 1 сентября",
  title_en: "Company Raises Subscription Price 60% Starting September 1",
  tldr_ru:
    "Компания повышает стоимость подписки с $5 до $8 в месяц начиная с 1 сентября, ссылаясь на рост расходов на серверы и трафик. Изменение затронет около 2 миллионов подписчиков сервиса, а годовые подписчики получат отсрочку до продления плана.",
  tldr_en:
    "The company is raising its subscription price from $5 to $8 a month starting September 1, citing rising server and bandwidth costs. The change affects roughly 2 million subscribers, though annual-plan subscribers get a grace period until renewal.",
  body_ru: [
    "Компания объявила об изменении во вторник, уточнив, что новый тариф вступит в силу с 1 сентября. Рост стоимости составляет почти 60% по сравнению с текущей ценой. Затронутыми окажутся примерно 2 миллиона подписчиков сервиса, при этом клиенты, уже оформившие годовой план, не почувствуют изменения сразу.",
    "В компании ссылаются на растущие расходы на серверную инфраструктуру и сетевой трафик как на основную причину решения. Руководство отмечало, что откладывало повышение более года, опасаясь навредить клиентам из малого бизнеса, но в итоге пришло к выводу, что дальнейшая отсрочка невозможна из-за продолжающегося роста издержек.",
  ],
  body_en: [
    "The company announced the change on Tuesday, confirming the new rate takes effect September 1. The increase amounts to nearly 60% over the current price. Roughly 2 million subscribers are affected, though customers already on an annual plan won't see the new rate right away, since their existing terms carry over until renewal.",
    "Executives point to climbing server infrastructure and network costs as the primary driver behind the decision. Leadership has said it held off on the increase for over a year out of concern for small-business customers, but ultimately concluded further delay wasn't sustainable given the pace of rising expenses.",
  ],
  bullets_ru: [
    "Те, кто уже на годовом плане, сохранят старую цену до момента продления плана.",
    "Компания откладывала повышение цены более года из опасений навредить малому бизнесу.",
    "Решение было принято только после того, как расходы на инфраструктуру продолжили расти.",
    "Ни один из конкурентов пока не объявлял о похожем шаге.",
  ],
  bullets_en: [
    "Price rises from $5 to $8 per month, a nearly 60% increase for new payments.",
    "Existing annual-plan subscribers keep their price until their plan renews.",
    "The company delayed the increase for over a year and a half before acting.",
    "No competitor has announced a comparable price change so far this year.",
  ],
  tags: ["technology"],
  lang_original: "en",
};

// Long enough that extraction clears pipeline.ts's MIN_EXTRACTED_TEXT_CHARS
// (300) guard.
const ARTICLE_HTML = "<html><head><title>Example</title></head><body><article><h1>Example</h1>" +
  "<p>Hello world, this is the first paragraph of example content, with enough extra words to " +
  "comfortably clear the minimum extraction length used by the pipeline's insufficient-text " +
  "guard in tests.</p>" +
  "<p>Here is a second paragraph with more detail to summarize, padded a little further so the " +
  "combined extracted text safely stays well above that threshold even after Readability trims " +
  "whitespace.</p></article></body></html>";

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

function makeEnv(overrides: Partial<Env> = {}): Env {
  const kv = new Map<string, string>();
  return {
    DB: new FakeD1(),
    CACHE: {
      get(key: string): Promise<string | null> {
        return Promise.resolve(kv.get(key) ?? null);
      },
      put(key: string, value: string): Promise<void> {
        kv.set(key, value);
        return Promise.resolve();
      },
      delete(key: string): Promise<void> {
        kv.delete(key);
        return Promise.resolve();
      },
      list(
        options?: { prefix?: string },
      ): Promise<{ keys: { name: string }[]; list_complete: boolean }> {
        const prefix = options?.prefix ?? "";
        const keys = [...kv.keys()].filter((k) => k.startsWith(prefix)).map((name) => ({ name }));
        return Promise.resolve({ keys, list_complete: true });
      },
    },
    ASSETS: { fetch: () => Promise.resolve(new Response("<html>spa shell</html>")) },
    AI: { run: () => Promise.reject(new Error("AI.run should not be called in these tests")) },
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
    DIGEST_HOUR_UTC: "6",
    ANTHROPIC_API_KEY: "test-key",
    // Off by default in this shared fixture (unlike production's "true"
    // default) so the many tests here that POST an article without
    // stubbing fetch don't trigger a real network robots.txt lookup — see
    // the dedicated robots.txt tests further down, which explicitly set
    // this back to "true" and stub/seed accordingly.
    ROBOTS_RESPECT: "false",
    ...overrides,
  };
}

async function makeOwnerContext(
  overrides: Partial<Env> = {},
): Promise<{ env: Env; authHeaders: Record<string, string> }> {
  const { publicKey, privateKey } = await generateKeyPair();
  const jwk = await exportJwk(publicKey, "kid-1");
  const env = makeEnv({ ACCESS_TEAM_DOMAIN: TEAM_DOMAIN, ACCESS_AUD: AUD, ...overrides });
  await env.CACHE.put(JWKS_CACHE_KEY, JSON.stringify({ keys: [jwk] }));
  const token = await signJwt(privateKey, "kid-1");
  return { env, authHeaders: { "Cf-Access-Jwt-Assertion": token } };
}

function makeExecutionContext() {
  const pending: Promise<unknown>[] = [];
  return {
    ctx: {
      props: {},
      waitUntil(promise: Promise<unknown>): void {
        pending.push(promise);
      },
      passThroughOnException(): void {},
    },
    settle: () => Promise.all(pending),
  };
}

function stubFetch(opts: { anthropicStatus?: number } = {}): () => void {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = ((input: string | URL | Request) => {
    const url = input.toString();
    if (url.startsWith("https://api.anthropic.com")) {
      return Promise.resolve(
        new Response(
          JSON.stringify({ content: [{ type: "text", text: JSON.stringify(VALID_SUMMARY) }] }),
          { status: opts.anthropicStatus ?? 200 },
        ),
      );
    }
    return Promise.resolve(
      new Response(ARTICLE_HTML, { status: 200, headers: { "content-type": "text/html" } }),
    );
  }) as typeof fetch;
  return () => {
    globalThis.fetch = originalFetch;
  };
}

// --- Public reads: reachable with zero auth, in every Access state ---

Deno.test("public reads: /api/health, /api/config, /api/articles, /api/articles/:id all 200 w/o auth (Access unconfigured)", async () => {
  const env = makeEnv();
  const ctx = makeExecutionContext().ctx;

  assertEquals((await app.request("/api/health", {}, env, ctx)).status, 200);
  assertEquals((await app.request("/api/config", {}, env, ctx)).status, 200);
  assertEquals((await app.request("/api/articles", {}, env, ctx)).status, 200);
  assertEquals((await app.request("/api/articles/does-not-exist", {}, env, ctx)).status, 404); // reached the handler
  assertEquals((await app.request("/api/search?q=widget", {}, env, ctx)).status, 200);
});

Deno.test("public reads: still 200 w/o auth even when Access IS configured", async () => {
  const { env } = await makeOwnerContext();
  const ctx = makeExecutionContext().ctx;

  assertEquals((await app.request("/api/health", {}, env, ctx)).status, 200);
  assertEquals((await app.request("/api/articles", {}, env, ctx)).status, 200);
});

// --- Task 51: GET /api/articles/counts + GET /api/admin/articles/counts —
// COUNT-only companions for the SPA's lazy-loaded "Earlier" section header
// and sidebar total. See db.ts's getArticleCounts. ---

const COUNTS_BOUNDARIES =
  "today_start=2026-01-03T00:00:00.000Z&yesterday_start=2026-01-02T00:00:00.000Z";

Deno.test("GET /api/articles/counts: 400 when today_start/yesterday_start are missing, no auth required to reach the handler", async () => {
  const env = makeEnv();
  const ctx = makeExecutionContext().ctx;
  const res = await app.request("/api/articles/counts", {}, env, ctx);
  assertEquals(res.status, 400);
});

Deno.test("GET /api/articles/counts: 400 when yesterday_start is not strictly before today_start", async () => {
  const env = makeEnv();
  const ctx = makeExecutionContext().ctx;
  const res = await app.request(
    "/api/articles/counts?today_start=2026-01-02T00:00:00.000Z&yesterday_start=2026-01-02T00:00:00.000Z",
    {},
    env,
    ctx,
  );
  assertEquals(res.status, 400);
});

Deno.test("GET /api/articles/counts: visitor sees only 'ready' totals; GET /api/admin/articles/counts (owner, default status) sees every status", async () => {
  const { env, authHeaders } = await makeOwnerContext();
  const ctx = makeExecutionContext().ctx;

  await insertPendingArticle(env.DB, {
    id: "cnt-ready",
    url: "https://example.com/cnt-ready",
    title: "cnt-ready",
    source: "example.com",
    tags: [],
    added_via: "manual",
    added_at: "2026-01-03T10:00:00.000Z",
  });
  const db = env.DB as unknown as FakeD1;
  db.rows.find((r) => r.id === "cnt-ready")!.status = "ready";

  await insertPendingArticle(env.DB, {
    id: "cnt-pending",
    url: "https://example.com/cnt-pending",
    title: "cnt-pending",
    source: "example.com",
    tags: [],
    added_via: "manual",
    added_at: "2026-01-03T11:00:00.000Z",
  });

  await insertPendingArticle(env.DB, {
    id: "cnt-failed",
    url: "https://example.com/cnt-failed",
    title: "cnt-failed",
    source: "example.com",
    tags: [],
    added_via: "manual",
    added_at: "2026-01-03T12:00:00.000Z",
  });
  await markArticleFailed(env.DB, "cnt-failed", "boom");

  const visitorRes = await app.request(`/api/articles/counts?${COUNTS_BOUNDARIES}`, {}, env, ctx);
  assertEquals(visitorRes.status, 200);
  const visitorBody = await visitorRes.json();
  assertEquals(visitorBody, { today: 1, yesterday: 0, earlier: 0, total: 1 });

  const ownerRes = await app.request(
    `/api/admin/articles/counts?${COUNTS_BOUNDARIES}`,
    { headers: authHeaders },
    env,
    ctx,
  );
  assertEquals(ownerRes.status, 200);
  const ownerBody = await ownerRes.json();
  assertEquals(ownerBody, { today: 3, yesterday: 0, earlier: 0, total: 3 });
});

Deno.test("GET /api/admin/articles/counts: 401 without auth, even with valid boundaries", async () => {
  const { env } = await makeOwnerContext();
  const ctx = makeExecutionContext().ctx;
  const res = await app.request(`/api/admin/articles/counts?${COUNTS_BOUNDARIES}`, {}, env, ctx);
  assertEquals(res.status, 401);
});

Deno.test("GET /api/articles/counts: counts respect the tag filter, same as GET /api/articles", async () => {
  const { env } = await makeOwnerContext();
  const ctx = makeExecutionContext().ctx;

  await insertPendingArticle(env.DB, {
    id: "cnt-tag-a",
    url: "https://example.com/cnt-tag-a",
    title: "cnt-tag-a",
    source: "example.com",
    tags: ["news"],
    added_via: "manual",
    added_at: "2026-01-03T10:00:00.000Z",
  });
  const db = env.DB as unknown as FakeD1;
  db.rows.find((r) => r.id === "cnt-tag-a")!.status = "ready";

  await insertPendingArticle(env.DB, {
    id: "cnt-tag-b",
    url: "https://example.com/cnt-tag-b",
    title: "cnt-tag-b",
    source: "example.com",
    tags: ["tech"],
    added_via: "manual",
    added_at: "2026-01-03T11:00:00.000Z",
  });
  db.rows.find((r) => r.id === "cnt-tag-b")!.status = "ready";

  const unfiltered = await (
    await app.request(`/api/articles/counts?${COUNTS_BOUNDARIES}`, {}, env, ctx)
  ).json();
  assertEquals(unfiltered.total, 2);

  const filtered = await (
    await app.request(`/api/articles/counts?${COUNTS_BOUNDARIES}&tag=news`, {}, env, ctx)
  ).json();
  assertEquals(filtered.total, 1);
});

// --- GET /api/admin/articles vs GET /api/articles: owner sees the real
// error, a visitor never does (see articles_test.ts's dedicated privacy
// regression test for the incident this fixes) ---

Deno.test("GET /api/admin/articles: 200 for the owner, includes the real error field; GET /api/articles excludes the failed row entirely (Task 41 Part D)", async () => {
  const { env, authHeaders } = await makeOwnerContext();
  const ctx = makeExecutionContext().ctx;

  await insertPendingArticle(env.DB, {
    id: "al1",
    url: "https://example.com/al1",
    title: "al1",
    source: "example.com",
    tags: [],
    added_via: "manual",
    added_at: "2026-01-01T00:00:00.000Z",
  });
  await markArticleFailed(env.DB, "al1", "internal: fetch: upstream responded 500");

  const adminRes = await app.request("/api/admin/articles", { headers: authHeaders }, env, ctx);
  assertEquals(adminRes.status, 200);
  const adminBody = await adminRes.json();
  const adminItem = adminBody.items.find((i: { id: string }) => i.id === "al1");
  assertEquals(adminItem.error, "internal: fetch: upstream responded 500");
  assertEquals("full_text" in adminItem, false);

  // Task 41 Part D: a public visitor never sees a failed article at all —
  // internal pipeline state, not something a public feed should expose (a
  // failed card was making the public feed look broken).
  const publicRes = await app.request("/api/articles", {}, env, ctx);
  const publicBody = await publicRes.json();
  const publicItem = publicBody.items.find((i: { id: string }) => i.id === "al1");
  assertEquals(publicItem, undefined);
});

Deno.test("GET /api/articles: a pending article is excluded too (Task 41 Part D) — a visitor never sees in-progress pipeline state", async () => {
  const { env } = await makeOwnerContext();
  const ctx = makeExecutionContext().ctx;

  await insertPendingArticle(env.DB, {
    id: "pend1",
    url: "https://example.com/pend1",
    title: "pend1",
    source: "example.com",
    tags: [],
    added_via: "manual",
    added_at: new Date().toISOString(),
  });

  const publicRes = await app.request("/api/articles", {}, env, ctx);
  const publicBody = await publicRes.json();
  assertEquals(publicBody.items.find((i: { id: string }) => i.id === "pend1"), undefined);
});

Deno.test("GET /api/admin/articles: status= param filters to just that status; default (omitted) still returns every status", async () => {
  const { env, authHeaders } = await makeOwnerContext();
  const ctx = makeExecutionContext().ctx;

  await insertPendingArticle(env.DB, {
    id: "s-pending",
    url: "https://example.com/s-pending",
    title: "s-pending",
    source: "example.com",
    tags: [],
    added_via: "manual",
    added_at: new Date().toISOString(),
  });
  await insertPendingArticle(env.DB, {
    id: "s-failed",
    url: "https://example.com/s-failed",
    title: "s-failed",
    source: "example.com",
    tags: [],
    added_via: "manual",
    added_at: new Date().toISOString(),
  });
  await markArticleFailed(env.DB, "s-failed", "boom");

  const pendingOnly = await (
    await app.request("/api/admin/articles?status=pending", { headers: authHeaders }, env, ctx)
  ).json();
  const pendingIds = pendingOnly.items.map((i: { id: string }) => i.id);
  assertEquals(pendingIds.includes("s-pending"), true);
  assertEquals(pendingIds.includes("s-failed"), false);

  const failedOnly = await (
    await app.request("/api/admin/articles?status=failed", { headers: authHeaders }, env, ctx)
  ).json();
  const failedIds = failedOnly.items.map((i: { id: string }) => i.id);
  assertEquals(failedIds.includes("s-failed"), true);
  assertEquals(failedIds.includes("s-pending"), false);

  const all = await (
    await app.request("/api/admin/articles", { headers: authHeaders }, env, ctx)
  ).json();
  const allIds = all.items.map((i: { id: string }) => i.id);
  assertEquals(allIds.includes("s-pending"), true);
  assertEquals(allIds.includes("s-failed"), true);
});

Deno.test("GET /api/articles?status=pending: the public route ignores the status param and stays ready-only regardless", async () => {
  const { env } = await makeOwnerContext();
  const ctx = makeExecutionContext().ctx;

  await insertPendingArticle(env.DB, {
    id: "ignore-status",
    url: "https://example.com/ignore-status",
    title: "ignore-status",
    source: "example.com",
    tags: [],
    added_via: "manual",
    added_at: new Date().toISOString(),
  });

  const res = await app.request("/api/articles?status=pending", {}, env, ctx);
  const body = await res.json();
  assertEquals(body.items.find((i: { id: string }) => i.id === "ignore-status"), undefined);
});

// --- Admin routes: 401 without a token, both configured and unconfigured ---

Deno.test("admin routes: 401 auth_not_configured on every mutating route when Access isn't set up", async () => {
  const env = makeEnv();
  const ctx = makeExecutionContext().ctx;
  const cases: Array<[string, string]> = [
    ["GET", "/api/admin/me"],
    ["GET", "/api/admin/articles"],
    ["GET", "/api/admin/articles/some-id"],
    ["POST", "/api/admin/articles"],
    ["PATCH", "/api/admin/articles/some-id"],
    ["DELETE", "/api/admin/articles/some-id"],
    ["DELETE", "/api/admin/articles/some-id/image"],
    ["POST", "/api/admin/articles/some-id/retry"],
    ["POST", "/api/admin/articles/some-id/resummarize"],
    ["POST", "/api/admin/articles/some-id/translate"],
    ["POST", "/api/admin/articles/some-id/reverify"],
    ["POST", "/api/admin/agent/run"],
    ["GET", "/api/admin/health-report"],
    ["POST", "/api/admin/heal/revalidate-failed"],
    ["POST", "/api/admin/tags/normalize"],
    ["GET", "/api/admin/search?q=widget"],
    ["POST", "/api/admin/embeddings/backfill"],
    ["POST", "/api/admin/articles/backfill-published"],
    ["GET", "/api/admin/curation/blocked"],
    ["DELETE", "/api/admin/curation/autoblock"],
  ];
  for (const [method, path] of cases) {
    const res = await app.request(path, { method }, env, ctx);
    assertEquals(res.status, 401, `${method} ${path}`);
    const body = await res.json();
    assertEquals(body.error, "auth_not_configured", `${method} ${path}`);
  }
});

Deno.test("admin routes: 401 unauthorized on every mutating route when configured but no token is sent", async () => {
  const { env } = await makeOwnerContext();
  const ctx = makeExecutionContext().ctx;
  const cases: Array<[string, string]> = [
    ["GET", "/api/admin/me"],
    ["GET", "/api/admin/articles"],
    ["GET", "/api/admin/articles/some-id"],
    ["POST", "/api/admin/articles"],
    ["PATCH", "/api/admin/articles/some-id"],
    ["DELETE", "/api/admin/articles/some-id"],
    ["DELETE", "/api/admin/articles/some-id/image"],
    ["POST", "/api/admin/articles/some-id/retry"],
    ["POST", "/api/admin/articles/some-id/resummarize"],
    ["POST", "/api/admin/articles/some-id/translate"],
    ["POST", "/api/admin/articles/some-id/reverify"],
    ["POST", "/api/admin/agent/run"],
    ["GET", "/api/admin/health-report"],
    ["POST", "/api/admin/heal/revalidate-failed"],
    ["POST", "/api/admin/tags/normalize"],
    ["GET", "/api/admin/search?q=widget"],
    ["POST", "/api/admin/embeddings/backfill"],
    ["POST", "/api/admin/articles/backfill-published"],
    ["GET", "/api/admin/curation/blocked"],
    ["DELETE", "/api/admin/curation/autoblock"],
  ];
  for (const [method, path] of cases) {
    const res = await app.request(path, { method }, env, ctx);
    assertEquals(res.status, 401, `${method} ${path}`);
    const body = await res.json();
    assertEquals(body.error, "unauthorized", `${method} ${path}`);
  }
});

Deno.test("GET /api/admin/health-report: 200 for the owner, returns the self-healing summary", async () => {
  const { env, authHeaders } = await makeOwnerContext();
  const ctx = makeExecutionContext().ctx;

  await insertPendingArticle(env.DB, {
    id: "h1",
    url: "https://example.com/h1",
    title: "h1",
    source: "example.com",
    tags: [],
    added_via: "agent",
    added_at: "2026-01-01T00:00:00.000Z",
  });
  await markArticleFailed(env.DB, "h1", "daily-limit"); // transient

  await insertPendingArticle(env.DB, {
    id: "h2",
    url: "https://thin.example.com/h2",
    title: "h2",
    source: "thin.example.com",
    tags: [],
    added_via: "manual",
    added_at: "2026-01-02T00:00:00.000Z",
  });
  await markArticleFailed(env.DB, "h2", "extraction: insufficient text (3 chars)"); // permanent

  await env.CACHE.put("thinhost:learned.example.com", "3");
  const today = new Date().toISOString().slice(0, 10);
  await env.CACHE.put(`llm_calls:${today}`, "7");
  await env.CACHE.put(`faithfulness_calls:${today}`, "4");

  const res = await app.request("/api/admin/health-report", { headers: authHeaders }, env, ctx);
  assertEquals(res.status, 200);
  const body = await res.json();

  assertEquals(body.failed_by_class.transient, 1);
  assertEquals(body.failed_by_class.permanent, 1);
  assertEquals(body.heal_attempts_totals.transient, 0);
  assertEquals(body.learned_thinhosts, [{ host: "learned.example.com", count: 3 }]);
  assertEquals(body.last_agent_run.last_added_at, "2026-01-01T00:00:00.000Z");
  assertEquals(body.llm_calls, { used: 7, limit: env.DAILY_SUMMARY_LIMIT });
  // h1/h2 never had a faithfulness check run — both land in the null bucket.
  assertEquals(body.faithfulness, { pass: 0, weak: 0, fail: 0, null: 2, judge_calls_today: 4 });

  // Task 33 §8: the curation section — config blocklist (from the real
  // committed blocklist.json), auto-learned entries, per-source stats, and
  // preferred-but-blocked conflicts, all in one response.
  assertEquals(body.curation.blocked.config.includes("wsj.com"), true);
  assertEquals(body.curation.sources, []); // no agent-added rows in this test

  // Task 36 Part B §4: no agent run yet today in this test.
  assertEquals(body.agent_runs_today, []);
});

Deno.test("GET /api/admin/health-report: includes today's agent run history (Task 36 Part B)", async () => {
  const { env, authHeaders } = await makeOwnerContext();
  const ctx = makeExecutionContext().ctx;

  await recordAgentRun(env.CACHE, {
    startedAt: "2026-01-01T05:00:48.000Z",
    picks: 10,
    trigger: "scheduled",
  });
  await recordAgentRun(env.CACHE, {
    startedAt: "2026-01-01T08:47:33.000Z",
    picks: 10,
    trigger: "manual",
  });

  const res = await app.request("/api/admin/health-report", { headers: authHeaders }, env, ctx);
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.agent_runs_today, [
    { startedAt: "2026-01-01T05:00:48.000Z", picks: 10, trigger: "scheduled" },
    { startedAt: "2026-01-01T08:47:33.000Z", picks: 10, trigger: "manual" },
  ]);
});

// --- Task 33: GET /api/admin/curation/blocked, DELETE .../autoblock ---

Deno.test("GET /api/admin/curation/blocked: 200 for the owner, includes config blocklist + auto entries + conflicts", async () => {
  const { env, authHeaders } = await makeOwnerContext();
  const ctx = makeExecutionContext().ctx;

  // "phoronix.com" is both a real preferredDomains entry (curation.json)
  // AND, here, deliberately also autoblocked — a live conflict.
  await env.CACHE.put(
    "autoblock:phoronix.com",
    JSON.stringify({
      firstSeen: "2026-01-01T00:00:00.000Z",
      score: 5,
      lastReason: "page has no substantive article text",
    }),
  );

  const res = await app.request("/api/admin/curation/blocked", { headers: authHeaders }, env, ctx);
  assertEquals(res.status, 200);
  const body = await res.json();

  assertEquals(body.config.includes("wsj.com"), true);
  assertEquals(body.auto.length, 1);
  assertEquals(body.auto[0].domain, "phoronix.com");
  assertEquals(body.auto[0].score, 5);
  assertEquals(body.conflicts, [{ domain: "phoronix.com", layer: "auto" }]);
});

Deno.test("DELETE /api/admin/curation/autoblock: clears the entry, normalizes free-form input, 400 on an invalid hostname", async () => {
  const { env, authHeaders } = await makeOwnerContext();
  const ctx = makeExecutionContext().ctx;
  await env.CACHE.put(
    "autoblock:flaky.example",
    JSON.stringify({ firstSeen: "2026-01-01T00:00:00.000Z", score: 3, lastReason: "x" }),
  );
  await env.CACHE.put("autostat:flaky.example", "3");

  const res = await app.request(
    "/api/admin/curation/autoblock",
    {
      method: "DELETE",
      headers: { ...authHeaders, "Content-Type": "application/json" },
      body: JSON.stringify({ domain: "https://www.Flaky.example/some/path" }),
    },
    env,
    ctx,
  );
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body, {
    domain: "flaky.example",
    cleared: true,
    note: "config-file blocklist entries require editing blocklist.json in your fork",
  });
  assertEquals(await env.CACHE.get("autoblock:flaky.example"), null);
  assertEquals(await env.CACHE.get("autostat:flaky.example"), null);

  const badRes = await app.request(
    "/api/admin/curation/autoblock",
    {
      method: "DELETE",
      headers: { ...authHeaders, "Content-Type": "application/json" },
      body: JSON.stringify({ domain: "not a hostname" }),
    },
    env,
    ctx,
  );
  assertEquals(badRes.status, 400);
});

// Task 33 §2: manual/extension/telegram adds are NEVER blocked (owner
// intent overrides), but the 202 carries an advisory warning.
Deno.test("POST /api/admin/articles: a blocked domain still saves (202), but the response carries {warning:'blocked_domain'}", async () => {
  const { env, authHeaders } = await makeOwnerContext();
  const ctx = makeExecutionContext().ctx;

  // wsj.com is in the real, committed blocklist.json.
  const res = await app.request(
    "/api/admin/articles",
    {
      method: "POST",
      headers: { ...authHeaders, "Content-Type": "application/json" },
      body: JSON.stringify({ url: "https://www.wsj.com/articles/some-story" }),
    },
    env,
    ctx,
  );
  assertEquals(res.status, 202);
  const body = await res.json();
  assertEquals(body.status, "pending");
  assertEquals(body.warning, "blocked_domain");
});

// --- Task 48 §1.3: robots.txt gate on POST /api/admin/articles ---

Deno.test("POST /api/admin/articles: a host whose robots.txt disallows a generic fetch gets 409 {error: 'robots_disallowed'}", async () => {
  const { env, authHeaders } = await makeOwnerContext({ ROBOTS_RESPECT: "true" });
  const ctx = makeExecutionContext().ctx;
  await env.CACHE.put("robots:blocked.example", "User-agent: *\nDisallow: /");

  const res = await app.request(
    "/api/admin/articles",
    {
      method: "POST",
      headers: { ...authHeaders, "Content-Type": "application/json" },
      body: JSON.stringify({ url: "https://blocked.example/some-story" }),
    },
    env,
    ctx,
  );
  assertEquals(res.status, 409);
  const body = await res.json();
  assertEquals(body, { error: "robots_disallowed", host: "blocked.example" });
});

Deno.test("POST /api/admin/articles?force=1: bypasses the robots.txt gate and saves anyway", async () => {
  const { env, authHeaders } = await makeOwnerContext({ ROBOTS_RESPECT: "true" });
  const ctx = makeExecutionContext().ctx;
  await env.CACHE.put("robots:blocked.example", "User-agent: *\nDisallow: /");

  const res = await app.request(
    "/api/admin/articles?force=1",
    {
      method: "POST",
      headers: { ...authHeaders, "Content-Type": "application/json" },
      body: JSON.stringify({ url: "https://blocked.example/some-story" }),
    },
    env,
    ctx,
  );
  assertEquals(res.status, 202);
  const body = await res.json();
  assertEquals(body.status, "pending");
});

Deno.test("POST /api/admin/articles: a host whose robots.txt allows the path saves normally (202)", async () => {
  const { env, authHeaders } = await makeOwnerContext({ ROBOTS_RESPECT: "true" });
  const ctx = makeExecutionContext().ctx;
  await env.CACHE.put("robots:allowed.example", "User-agent: *\nAllow: /");

  const res = await app.request(
    "/api/admin/articles",
    {
      method: "POST",
      headers: { ...authHeaders, "Content-Type": "application/json" },
      body: JSON.stringify({ url: "https://allowed.example/some-story" }),
    },
    env,
    ctx,
  );
  assertEquals(res.status, 202);
});

Deno.test("POST /api/admin/articles: the extension path (html supplied) never consults robots.txt at all, even on a fully-disallowed host", async () => {
  const { env, authHeaders } = await makeOwnerContext({ ROBOTS_RESPECT: "true" });
  const ctx = makeExecutionContext().ctx;
  await env.CACHE.put("robots:blocked.example", "User-agent: *\nDisallow: /");

  const res = await app.request(
    "/api/admin/articles",
    {
      method: "POST",
      headers: { ...authHeaders, "Content-Type": "application/json" },
      body: JSON.stringify({
        url: "https://blocked.example/some-story",
        html: ARTICLE_HTML,
        added_via: "extension",
      }),
    },
    env,
    ctx,
  );
  // 202, not 409 — no server-side fetch happens for this path either way,
  // so there's nothing for robots.txt to gate.
  assertEquals(res.status, 202);
});

// --- Task 62: POST /api/admin/articles/backfill-published ---

async function seedReadyArticle(
  env: Env,
  id: string,
  url: string,
  overrides: Record<string, unknown> = {},
): Promise<void> {
  await insertPendingArticle(env.DB, {
    id,
    url,
    title: id,
    source: "example.com",
    tags: [],
    added_via: "manual",
    added_at: "2026-01-01T00:00:00.000Z",
  });
  const db = env.DB as unknown as FakeD1;
  const row = db.rows.find((r) => r.id === id)!;
  row.status = "ready";
  Object.assign(row, overrides);
}

function stubBackfillFetch(
  responses: Record<string, { status: number; html?: string } | "throw">,
): () => void {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = ((input: string | URL | Request) => {
    const url = input.toString();
    const entry = responses[url];
    if (entry === undefined) throw new Error(`unexpected fetch in backfill test: ${url}`);
    if (entry === "throw") return Promise.reject(new Error("network down"));
    return Promise.resolve(
      new Response(entry.html ?? "", {
        status: entry.status,
        headers: { "content-type": "text/html" },
      }),
    );
  }) as typeof fetch;
  return () => {
    globalThis.fetch = originalFetch;
  };
}

Deno.test("POST /api/admin/articles/backfill-published: finds a JSON-LD date, marks the row filled and checked", async () => {
  const { env, authHeaders } = await makeOwnerContext({ ROBOTS_RESPECT: "false" });
  const ctx = makeExecutionContext().ctx;
  await seedReadyArticle(env, "bf-dated", "https://example.com/bf-dated");

  const restore = stubBackfillFetch({
    "https://example.com/bf-dated": {
      status: 200,
      html:
        `<html><head><script type="application/ld+json">{"@type":"Article","datePublished":"2026-06-01T00:00:00.000Z"}</script></head><body><article><p>${
          "content ".repeat(50)
        }</p></article></body></html>`,
    },
  });
  try {
    const res = await app.request(
      "/api/admin/articles/backfill-published",
      { method: "POST", headers: authHeaders },
      env,
      ctx,
    );
    assertEquals(res.status, 200);
    const body = await res.json();
    assertEquals(body, { processed: 1, remaining: 0, filled: 1, notFound: 0 });

    const db = env.DB as unknown as FakeD1;
    const row = db.rows.find((r) => r.id === "bf-dated")!;
    assertEquals(row.published_at, "2026-06-01T00:00:00.000Z");
    assertEquals(
      row.published_at_checked_at !== null && row.published_at_checked_at !== undefined,
      true,
    );
  } finally {
    restore();
  }
});

Deno.test("POST /api/admin/articles/backfill-published: no date on the page -> notFound, checked, published_at stays null", async () => {
  const { env, authHeaders } = await makeOwnerContext({ ROBOTS_RESPECT: "false" });
  const ctx = makeExecutionContext().ctx;
  await seedReadyArticle(env, "bf-undated", "https://example.com/bf-undated");

  const restore = stubBackfillFetch({
    "https://example.com/bf-undated": {
      status: 200,
      html: `<html><body><article><p>${"content ".repeat(50)}</p></article></body></html>`,
    },
  });
  try {
    const res = await app.request(
      "/api/admin/articles/backfill-published",
      { method: "POST", headers: authHeaders },
      env,
      ctx,
    );
    const body = await res.json();
    assertEquals(body, { processed: 1, remaining: 0, filled: 0, notFound: 1 });

    const db = env.DB as unknown as FakeD1;
    const row = db.rows.find((r) => r.id === "bf-undated")!;
    assertEquals(row.published_at, null);
    assertEquals(
      row.published_at_checked_at !== null && row.published_at_checked_at !== undefined,
      true,
    );
  } finally {
    restore();
  }
});

Deno.test("POST /api/admin/articles/backfill-published: a re-fetch failure is counted, not thrown, and the row is still marked checked", async () => {
  const { env, authHeaders } = await makeOwnerContext({ ROBOTS_RESPECT: "false" });
  const ctx = makeExecutionContext().ctx;
  await seedReadyArticle(env, "bf-fail", "https://example.com/bf-fail");

  const restore = stubBackfillFetch({ "https://example.com/bf-fail": "throw" });
  try {
    const res = await app.request(
      "/api/admin/articles/backfill-published",
      { method: "POST", headers: authHeaders },
      env,
      ctx,
    );
    assertEquals(res.status, 200);
    const body = await res.json();
    assertEquals(body, { processed: 1, remaining: 0, filled: 0, notFound: 1 });

    const db = env.DB as unknown as FakeD1;
    const row = db.rows.find((r) => r.id === "bf-fail")!;
    assertEquals(row.published_at, null);
    assertEquals(
      row.published_at_checked_at !== null && row.published_at_checked_at !== undefined,
      true,
    );
  } finally {
    restore();
  }
});

Deno.test("POST /api/admin/articles/backfill-published: a robots-disallowed host is skipped without ever being fetched", async () => {
  const { env, authHeaders } = await makeOwnerContext({ ROBOTS_RESPECT: "true" });
  const ctx = makeExecutionContext().ctx;
  await seedReadyArticle(env, "bf-blocked", "https://blocked.example/bf-blocked");
  await env.CACHE.put("robots:blocked.example", "User-agent: *\nDisallow: /");

  // No responses registered — a fetch to this URL would throw "unexpected
  // fetch", proving the robots gate short-circuits before any request.
  const restore = stubBackfillFetch({});
  try {
    const res = await app.request(
      "/api/admin/articles/backfill-published",
      { method: "POST", headers: authHeaders },
      env,
      ctx,
    );
    assertEquals(res.status, 200);
    const body = await res.json();
    assertEquals(body, { processed: 1, remaining: 0, filled: 0, notFound: 1 });

    const db = env.DB as unknown as FakeD1;
    const row = db.rows.find((r) => r.id === "bf-blocked")!;
    assertEquals(row.published_at, null);
    assertEquals(
      row.published_at_checked_at !== null && row.published_at_checked_at !== undefined,
      true,
    );
  } finally {
    restore();
  }
});

Deno.test("POST /api/admin/articles/backfill-published: idempotent — a row already checked is never re-selected", async () => {
  const { env, authHeaders } = await makeOwnerContext({ ROBOTS_RESPECT: "false" });
  const ctx = makeExecutionContext().ctx;
  await seedReadyArticle(env, "bf-already-checked", "https://example.com/bf-already-checked", {
    published_at_checked_at: "2026-01-05T00:00:00.000Z",
    published_at: null,
  });

  // No responses registered — a fetch attempt would throw, proving the
  // already-checked row is excluded from the candidate query entirely.
  const restore = stubBackfillFetch({});
  try {
    const res = await app.request(
      "/api/admin/articles/backfill-published",
      { method: "POST", headers: authHeaders },
      env,
      ctx,
    );
    const body = await res.json();
    assertEquals(body, { processed: 0, remaining: 0, filled: 0, notFound: 0 });
  } finally {
    restore();
  }
});

// --- Task 48 Part 3: DELETE /api/admin/articles/:id/image ---

function makeFakeR2Bucket(): { bucket: R2Bucket; deletedKeys: string[] } {
  const objects = new Map<string, Uint8Array>();
  const deletedKeys: string[] = [];
  const bucket = {
    get(key: string) {
      const bytes = objects.get(key);
      if (!bytes) return Promise.resolve(null);
      return Promise.resolve({ body: bytes } as unknown);
    },
    put(key: string, value: Uint8Array) {
      objects.set(key, value);
      return Promise.resolve({} as unknown);
    },
    delete(key: string) {
      deletedKeys.push(key);
      objects.delete(key);
      return Promise.resolve();
    },
  } as unknown as R2Bucket;
  return { bucket, deletedKeys };
}

Deno.test("DELETE /api/admin/articles/:id/image: 401 without auth, 401 auth_not_configured when Access isn't set up", async () => {
  const unconfigured = makeEnv();
  const unconfiguredCtx = makeExecutionContext().ctx;
  const noConfigRes = await app.request(
    "/api/admin/articles/some-id/image",
    { method: "DELETE" },
    unconfigured,
    unconfiguredCtx,
  );
  assertEquals(noConfigRes.status, 401);
  assertEquals((await noConfigRes.json()).error, "auth_not_configured");

  const { env } = await makeOwnerContext();
  const ctx = makeExecutionContext().ctx;
  const noTokenRes = await app.request(
    "/api/admin/articles/some-id/image",
    { method: "DELETE" },
    env,
    ctx,
  );
  assertEquals(noTokenRes.status, 401);
  assertEquals((await noTokenRes.json()).error, "unauthorized");
});

Deno.test("DELETE /api/admin/articles/:id/image: 404 for a missing article, and for an article with no image", async () => {
  const { env, authHeaders } = await makeOwnerContext();
  const ctx = makeExecutionContext().ctx;

  const missingRes = await app.request(
    "/api/admin/articles/does-not-exist/image",
    { method: "DELETE", headers: authHeaders },
    env,
    ctx,
  );
  assertEquals(missingRes.status, 404);

  await insertPendingArticle(env.DB, {
    id: "img-none",
    url: "https://example.com/img-none",
    title: "img-none",
    source: "example.com",
    tags: [],
    added_via: "manual",
    added_at: "2026-01-01T00:00:00.000Z",
  });
  const noImageRes = await app.request(
    "/api/admin/articles/img-none/image",
    { method: "DELETE", headers: authHeaders },
    env,
    ctx,
  );
  assertEquals(noImageRes.status, 404);
});

Deno.test("DELETE /api/admin/articles/:id/image: 204, purges the R2 object, and clears image_key/source/dimensions without touching the rest of the article", async () => {
  const { bucket, deletedKeys } = makeFakeR2Bucket();
  const { env, authHeaders } = await makeOwnerContext({ IMAGES: bucket });
  const ctx = makeExecutionContext().ctx;

  await insertPendingArticle(env.DB, {
    id: "img-present",
    url: "https://example.com/img-present",
    title: "img-present",
    source: "example.com",
    tags: [],
    added_via: "manual",
    added_at: "2026-01-01T00:00:00.000Z",
  });
  const db = env.DB as unknown as FakeD1;
  const row = db.rows.find((r) => r.id === "img-present")!;
  row.status = "ready";
  row.image_key = "articles/img-present.jpg";
  row.image_source_url = "https://example.com/photo.jpg";
  row.image_width = 800;
  row.image_height = 600;

  const res = await app.request(
    "/api/admin/articles/img-present/image",
    { method: "DELETE", headers: authHeaders },
    env,
    ctx,
  );
  assertEquals(res.status, 204);
  assertEquals(deletedKeys, ["articles/img-present.jpg"]);

  const after = db.rows.find((r) => r.id === "img-present")!;
  assertEquals(after.image_key, null);
  assertEquals(after.image_source_url, null);
  assertEquals(after.image_width, null);
  assertEquals(after.image_height, null);
  assertEquals(after.status, "ready"); // untouched
  assertEquals(after.url, "https://example.com/img-present"); // untouched
});

Deno.test("DELETE /api/admin/articles/:id/image: a second call after success 404s (idempotent-friendly, not a silent second 204)", async () => {
  const { bucket } = makeFakeR2Bucket();
  const { env, authHeaders } = await makeOwnerContext({ IMAGES: bucket });
  const ctx = makeExecutionContext().ctx;

  await insertPendingArticle(env.DB, {
    id: "img-twice",
    url: "https://example.com/img-twice",
    title: "img-twice",
    source: "example.com",
    tags: [],
    added_via: "manual",
    added_at: "2026-01-01T00:00:00.000Z",
  });
  const db = env.DB as unknown as FakeD1;
  db.rows.find((r) => r.id === "img-twice")!.image_key = "articles/img-twice.jpg";

  const first = await app.request(
    "/api/admin/articles/img-twice/image",
    { method: "DELETE", headers: authHeaders },
    env,
    ctx,
  );
  assertEquals(first.status, 204);

  const second = await app.request(
    "/api/admin/articles/img-twice/image",
    { method: "DELETE", headers: authHeaders },
    env,
    ctx,
  );
  assertEquals(second.status, 404);
});

// --- Task 48 Part 2: GET /bot (public, no auth) ---

Deno.test("GET /bot: 200, no auth required, mentions robots.txt compliance and omits the contact section when CONTACT_EMAIL is unset", async () => {
  const env = makeEnv({ AGENT_DAILY_PICKS: "7", ROBOTS_RESPECT: "true", CONTACT_EMAIL: "" });
  const ctx = makeExecutionContext().ctx;

  const res = await app.request("/bot", {}, env, ctx);
  assertEquals(res.status, 200);
  const html = await res.text();
  assertEquals(html.includes("ClipFeed"), true);
  assertEquals(html.includes("7"), true);
  assertEquals(html.includes("honors"), true);
  assertEquals(html.includes("mailto:"), false);
});

Deno.test("GET /bot: includes a mailto: contact link when CONTACT_EMAIL is set", async () => {
  const env = makeEnv({ CONTACT_EMAIL: "owner@example.com" });
  const ctx = makeExecutionContext().ctx;

  const res = await app.request("/bot", {}, env, ctx);
  const html = await res.text();
  assertEquals(html.includes("mailto:owner@example.com"), true);
});

Deno.test("GET /bot: says robots.txt is NOT honored when ROBOTS_RESPECT=false", async () => {
  const env = makeEnv({ ROBOTS_RESPECT: "false" });
  const ctx = makeExecutionContext().ctx;

  const res = await app.request("/bot", {}, env, ctx);
  const html = await res.text();
  assertEquals(html.includes("disabled robots.txt checking"), true);
});

Deno.test("POST /api/admin/articles: a non-blocked domain saves with no warning field at all", async () => {
  const { env, authHeaders } = await makeOwnerContext();
  const ctx = makeExecutionContext().ctx;

  const res = await app.request(
    "/api/admin/articles",
    {
      method: "POST",
      headers: { ...authHeaders, "Content-Type": "application/json" },
      body: JSON.stringify({ url: "https://example.com/some-story" }),
    },
    env,
    ctx,
  );
  assertEquals(res.status, 202);
  const body = await res.json();
  assertEquals("warning" in body, false);
});

// --- POST /api/admin/articles/:id/reverify (Task 23) ---

Deno.test("POST /api/admin/articles/:id/reverify: 404 for a missing id", async () => {
  const { env, authHeaders } = await makeOwnerContext();
  const ctx = makeExecutionContext().ctx;
  const res = await app.request(
    "/api/admin/articles/does-not-exist/reverify",
    { method: "POST", headers: authHeaders },
    env,
    ctx,
  );
  assertEquals(res.status, 404);
});

Deno.test("POST /api/admin/articles/:id/reverify: 409 for an article with no stored summary yet", async () => {
  const { env, authHeaders } = await makeOwnerContext();
  const ctx = makeExecutionContext().ctx;
  await insertPendingArticle(env.DB, {
    id: "rv-pending",
    url: "https://example.com/rv-pending",
    title: "rv-pending",
    source: "example.com",
    tags: [],
    added_via: "manual",
    added_at: "2026-01-01T00:00:00.000Z",
  });
  const res = await app.request(
    "/api/admin/articles/rv-pending/reverify",
    { method: "POST", headers: authHeaders },
    env,
    ctx,
  );
  assertEquals(res.status, 409);
});

Deno.test("POST /api/admin/articles/:id/reverify: 202 for a ready article, re-runs the judge and writes only the faithfulness columns", async () => {
  const { env, authHeaders } = await makeOwnerContext({
    AI: {
      run: () =>
        Promise.resolve({
          response: JSON.stringify({
            claims: [{ i: 1, verdict: "supported", evidence: "x" }],
            notes: "",
          }),
        }),
    },
  });
  const ctx = makeExecutionContext();

  const stopFetch = stubFetch();
  try {
    await app.request(
      "/api/admin/articles",
      {
        method: "POST",
        headers: { "content-type": "application/json", ...authHeaders },
        body: JSON.stringify({ url: "https://example.com/rv-ready" }),
      },
      env,
      ctx.ctx,
    );
    await ctx.settle();
  } finally {
    stopFetch();
  }

  const rowsOf = () => (env.DB as unknown as { rows: Record<string, unknown>[] }).rows;
  const readyId = rowsOf().find((r) => r.url === "https://example.com/rv-ready")!.id as string;
  const beforeSummaryJson = rowsOf().find((r) => r.id === readyId)!.summary_json;

  const res = await app.request(
    `/api/admin/articles/${readyId}/reverify`,
    { method: "POST", headers: authHeaders },
    env,
    ctx.ctx,
  );
  assertEquals(res.status, 202);
  await ctx.settle();

  const row = rowsOf().find((r) => r.id === readyId)!;
  assertEquals(row.faithfulness_verdict, "pass");
  assertEquals(row.status, "ready"); // reverify never changes status
  assertEquals(row.summary_json, beforeSummaryJson); // nor the summary itself
});

Deno.test("POST /api/admin/articles/:id/reverify: 401 without auth even for an existing article (covered by the auth-matrix test above, spot-checked here too)", async () => {
  const { env } = await makeOwnerContext();
  const ctx = makeExecutionContext().ctx;
  await insertPendingArticle(env.DB, {
    id: "rv-noauth",
    url: "https://example.com/rv-noauth",
    title: "rv-noauth",
    source: "example.com",
    tags: [],
    added_via: "manual",
    added_at: "2026-01-01T00:00:00.000Z",
  });
  const res = await app.request(
    "/api/admin/articles/rv-noauth/reverify",
    { method: "POST" },
    env,
    ctx,
  );
  assertEquals(res.status, 401);
});

// --- POST /api/admin/articles/:id/translate (Task 35 Part A §3) ---

Deno.test("POST /api/admin/articles/:id/translate: 404 for a missing id", async () => {
  const { env, authHeaders } = await makeOwnerContext();
  const ctx = makeExecutionContext().ctx;
  const res = await app.request(
    "/api/admin/articles/does-not-exist/translate",
    { method: "POST", headers: authHeaders },
    env,
    ctx,
  );
  assertEquals(res.status, 404);
});

Deno.test("POST /api/admin/articles/:id/translate: 409 for a pending article (not ready yet)", async () => {
  const { env, authHeaders } = await makeOwnerContext();
  const ctx = makeExecutionContext().ctx;
  await insertPendingArticle(env.DB, {
    id: "tr-pending",
    url: "https://example.com/tr-pending",
    title: "tr-pending",
    source: "example.com",
    tags: [],
    added_via: "manual",
    added_at: "2026-01-01T00:00:00.000Z",
  });
  const res = await app.request(
    "/api/admin/articles/tr-pending/translate",
    { method: "POST", headers: authHeaders },
    env,
    ctx,
  );
  assertEquals(res.status, 409);
});

Deno.test("POST /api/admin/articles/:id/translate: 202 for a ready article, generates EN fields from full_text and merges them without touching RU content", async () => {
  const { env, authHeaders } = await makeOwnerContext();
  const ctx = makeExecutionContext();

  const stopFetch = stubFetch();
  let created: { id: string };
  try {
    created = await (
      await app.request(
        "/api/admin/articles",
        {
          method: "POST",
          headers: { "content-type": "application/json", ...authHeaders },
          body: JSON.stringify({ url: "https://example.com/tr-ready" }),
        },
        env,
        ctx.ctx,
      )
    ).json();
    await ctx.settle();
  } finally {
    stopFetch();
  }

  const beforeReady = await (
    await app.request(`/api/admin/articles/${created.id}`, { headers: authHeaders }, env, ctx.ctx)
  ).json();
  assertEquals(beforeReady.status, "ready");
  assertEquals(beforeReady.en_generated_at, null);
  assertEquals(beforeReady.summary_json.title_en, undefined);

  // A second stub, so a failure to skip re-fetching would be visible: this
  // one serves different HTML than the first, but generateEnglishFields
  // reads the ALREADY-STORED full_text (see runEnglishTranslation), never
  // re-fetching the article's URL — so the EN fields below being the
  // stubbed VALID_SUMMARY's EN content, not derived from this HTML, proves
  // the generation path used the stored text.
  let anthropicCallCount = 0;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = ((input: string | URL | Request) => {
    const urlText = typeof input === "string"
      ? input
      : input instanceof URL
      ? input.toString()
      : input.url;

    let parsed: URL;
    try {
      parsed = new URL(urlText);
    } catch {
      throw new Error("translate must not re-fetch the article's own URL");
    }

    if (parsed.protocol === "https:" && parsed.hostname === "api.anthropic.com") {
      anthropicCallCount += 1;
      return Promise.resolve(
        new Response(
          JSON.stringify({ content: [{ type: "text", text: JSON.stringify(VALID_SUMMARY) }] }),
          { status: 200 },
        ),
      );
    }
    throw new Error("translate must not re-fetch the article's own URL");
  }) as typeof fetch;

  try {
    const res = await app.request(
      `/api/admin/articles/${created.id}/translate`,
      { method: "POST", headers: authHeaders },
      env,
      ctx.ctx,
    );
    assertEquals(res.status, 202);
    const body = await res.json();
    assertEquals(body.status, "pending");
    await ctx.settle();
  } finally {
    globalThis.fetch = originalFetch;
  }

  assertEquals(anthropicCallCount, 1);

  const translated = await (
    await app.request(`/api/admin/articles/${created.id}`, { headers: authHeaders }, env, ctx.ctx)
  ).json();
  assertEquals(typeof translated.en_generated_at, "string");
  assertEquals(translated.summary_json.title_en, VALID_SUMMARY.title_en);
  assertEquals(translated.summary_json.tldr_en, VALID_SUMMARY.tldr_en);
  // RU content and status are untouched by the translate job.
  assertEquals(translated.summary_json.title_ru, beforeReady.summary_json.title_ru);
  assertEquals(translated.status, "ready");
});

Deno.test("POST /api/admin/articles/:id/translate: idempotent — a second call after en_generated_at is set is a 200 no-op, no new queue job", async () => {
  const jobs = new FakeQueue();
  const { env, authHeaders } = await makeOwnerContext({ JOBS: jobs });
  const ctx = makeExecutionContext().ctx;

  await insertPendingArticle(env.DB, {
    id: "tr-done",
    url: "https://example.com/tr-done",
    title: "tr-done",
    source: "example.com",
    tags: [],
    added_via: "manual",
    added_at: "2026-01-01T00:00:00.000Z",
  });
  const db = env.DB as unknown as FakeD1;
  const row = db.rows.find((r) => r.id === "tr-done")!;
  row.status = "ready";
  row.full_text = "Enough stored text to translate from.";
  row.summary_json = JSON.stringify({ title_ru: "Заголовок", tags: [], lang_original: "en" });
  row.en_generated_at = "2026-01-01T12:00:00.000Z";

  const res = await app.request(
    "/api/admin/articles/tr-done/translate",
    { method: "POST", headers: authHeaders },
    env,
    ctx,
  );
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.status, "already-translated");
  assertEquals(jobs.sent.length, 0);
});

Deno.test("POST /api/admin/articles/:id/translate: 401 without auth even for an existing article (covered by the auth-matrix test above, spot-checked here too)", async () => {
  const { env } = await makeOwnerContext();
  const ctx = makeExecutionContext().ctx;
  await insertPendingArticle(env.DB, {
    id: "tr-noauth",
    url: "https://example.com/tr-noauth",
    title: "tr-noauth",
    source: "example.com",
    tags: [],
    added_via: "manual",
    added_at: "2026-01-01T00:00:00.000Z",
  });
  const res = await app.request(
    "/api/admin/articles/tr-noauth/translate",
    { method: "POST" },
    env,
    ctx,
  );
  assertEquals(res.status, 401);
});

Deno.test("POST /api/admin/heal/revalidate-failed: re-enqueues every summary-validation failure regardless of heal_attempts, resets the count first", async () => {
  const jobs = new FakeQueue();
  const { env, authHeaders } = await makeOwnerContext({ JOBS: jobs });
  const ctx = makeExecutionContext().ctx;

  // Already at its heal cap (unknown class -> cap 1) — the normal healing
  // sweep would never retry this again, but the rescue endpoint ignores
  // the cap entirely for exactly this failure shape.
  await insertPendingArticle(env.DB, {
    id: "sv1",
    url: "https://example.com/sv1",
    title: "sv1",
    source: "example.com",
    tags: [],
    added_via: "manual",
    added_at: "2026-01-01T00:00:00.000Z",
  });
  await markArticleFailed(
    env.DB,
    "sv1",
    "internal: summarize: summary validation: body_en[0] must be between 300 and 700 characters (got 737)",
  );
  const rowsOf = () => (env.DB as unknown as { rows: Record<string, unknown>[] }).rows;
  rowsOf().find((r) => r.id === "sv1")!.heal_attempts = 1;

  // A different failure shape — must be left alone.
  await insertPendingArticle(env.DB, {
    id: "other-fail",
    url: "https://example.com/other-fail",
    title: "other-fail",
    source: "example.com",
    tags: [],
    added_via: "manual",
    added_at: "2026-01-01T00:00:00.000Z",
  });
  await markArticleFailed(env.DB, "other-fail", "daily-limit");

  const res = await app.request(
    "/api/admin/heal/revalidate-failed",
    { method: "POST", headers: authHeaders },
    env,
    ctx,
  );
  assertEquals(res.status, 202);
  const body = await res.json();
  assertEquals(body.count, 1);

  // queueMessageId is generated per-enqueue (see queue.ts's
  // enqueueArticleJob) — assert the fields that matter, not the random id.
  assertEquals(jobs.sent.length, 1);
  assertEquals(jobs.sent[0].kind, "process");
  assertEquals(jobs.sent[0].articleId, "sv1");
  assertEquals(typeof jobs.sent[0].queueMessageId, "string");
  const sv1 = rowsOf().find((r) => r.id === "sv1")!;
  assertEquals(sv1.heal_attempts, 0);
  assertEquals(sv1.status, "pending");
});

Deno.test("POST /api/admin/heal/revalidate-failed: no-op (count 0) when there's nothing to rescue", async () => {
  const jobs = new FakeQueue();
  const { env, authHeaders } = await makeOwnerContext({ JOBS: jobs });
  const ctx = makeExecutionContext().ctx;

  const res = await app.request(
    "/api/admin/heal/revalidate-failed",
    { method: "POST", headers: authHeaders },
    env,
    ctx,
  );
  assertEquals(res.status, 202);
  assertEquals(await res.json(), { count: 0 });
  assertEquals(jobs.sent, []);
});

Deno.test("POST /api/admin/tags/normalize: backfills existing rows, returns {updated: n}, idempotent second run", async () => {
  const { env, authHeaders } = await makeOwnerContext();
  const ctx = makeExecutionContext().ctx;

  await insertPendingArticle(env.DB, {
    id: "tn1",
    url: "https://example.com/tn1",
    title: "tn1",
    source: "example.com",
    tags: [], // normalized on insert already — bypass that by writing raw below
    added_via: "manual",
    added_at: "2026-01-01T00:00:00.000Z",
  });
  const rowsOf = () => (env.DB as unknown as { rows: Record<string, unknown>[] }).rows;
  rowsOf().find((r) => r.id === "tn1")!.tags = JSON.stringify(["ИИ", "ai", "таймаут"]);

  const first = await app.request(
    "/api/admin/tags/normalize",
    { method: "POST", headers: authHeaders },
    env,
    ctx,
  );
  assertEquals(first.status, 200);
  assertEquals(await first.json(), { updated: 1 });
  assertEquals(JSON.parse(rowsOf().find((r) => r.id === "tn1")!.tags as string), ["ai"]);

  const second = await app.request(
    "/api/admin/tags/normalize",
    { method: "POST", headers: authHeaders },
    env,
    ctx,
  );
  assertEquals(await second.json(), { updated: 0 });
});

Deno.test("POST /api/admin/agent/run: 202 for the owner, runs the agent job via waitUntil", async () => {
  const originalFetch = globalThis.fetch;
  // All six real sources.json URLs fail — the job still completes cleanly
  // with zero picks, since fetchAllCandidates isolates per-source errors.
  globalThis.fetch = (() => Promise.resolve(new Response("nope", { status: 500 }))) as typeof fetch;
  try {
    const { env, authHeaders } = await makeOwnerContext();
    const { ctx, settle } = makeExecutionContext();

    const res = await app.request(
      "/api/admin/agent/run",
      { method: "POST", headers: authHeaders },
      env,
      ctx,
    );
    assertEquals(res.status, 202);
    const body = await res.json();
    assertEquals(body.ok, true);

    await settle();
    // No candidates -> no rows written; the important assertion is that
    // waitUntil resolved without throwing.
    const db = env.DB as unknown as FakeD1;
    assertEquals(db.rows.filter((r) => r.added_via === "agent").length, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("POST /api/admin/agent/run: when the agent already ran today, response carries a warning naming the prior run, and the job still runs (Task 36 Part B)", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (() => Promise.resolve(new Response("nope", { status: 500 }))) as typeof fetch;
  try {
    const { env, authHeaders } = await makeOwnerContext();
    const { ctx, settle } = makeExecutionContext();

    await recordAgentRun(env.CACHE, {
      startedAt: "2026-01-01T05:00:48.000Z",
      picks: 10,
      trigger: "scheduled",
    });

    const res = await app.request(
      "/api/admin/agent/run",
      { method: "POST", headers: authHeaders },
      env,
      ctx,
    );
    assertEquals(res.status, 202);
    const body = await res.json();
    assertEquals(body.ok, true);
    assertEquals(typeof body.warning, "string");
    assertEquals(body.warning.includes("10 статей"), true);

    await settle();
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("POST /api/admin/agent/run?force=1: suppresses the warning even when the agent already ran today", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (() => Promise.resolve(new Response("nope", { status: 500 }))) as typeof fetch;
  try {
    const { env, authHeaders } = await makeOwnerContext();
    const { ctx, settle } = makeExecutionContext();

    await recordAgentRun(env.CACHE, {
      startedAt: "2026-01-01T05:00:48.000Z",
      picks: 10,
      trigger: "scheduled",
    });

    const res = await app.request(
      "/api/admin/agent/run?force=1",
      { method: "POST", headers: authHeaders },
      env,
      ctx,
    );
    assertEquals(res.status, 202);
    const body = await res.json();
    assertEquals(body.ok, true);
    assertEquals("warning" in body, false);

    await settle();
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("admin routes: 401 unauthorized with a bad token", async () => {
  const { env } = await makeOwnerContext();
  const ctx = makeExecutionContext().ctx;
  const res = await app.request(
    "/api/admin/articles/some-id",
    { headers: { "Cf-Access-Jwt-Assertion": "not-a-real-jwt" } },
    env,
    ctx,
  );
  assertEquals(res.status, 401);
});

// --- GET /api/admin/me: both modes ---

Deno.test("GET /api/admin/me: 200 with sub/email when authenticated", async () => {
  const { env, authHeaders } = await makeOwnerContext();
  const ctx = makeExecutionContext().ctx;
  const res = await app.request("/api/admin/me", { headers: authHeaders }, env, ctx);
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.sub, "owner-1");
  assertEquals(body.email, "owner@example.com");
});

Deno.test("GET /api/admin/me: 401 when not authenticated", async () => {
  const { env } = await makeOwnerContext();
  const ctx = makeExecutionContext().ctx;
  const res = await app.request("/api/admin/me", {}, env, ctx);
  assertEquals(res.status, 401);
});

// --- Public vs admin data hygiene on the same article ---

Deno.test("public GET /api/articles/:id: 404 for a failed article (Task 41 Part D — a visitor must not learn it exists but failed)", async () => {
  const { env, authHeaders } = await makeOwnerContext({ DAILY_SUMMARY_LIMIT: 0 });
  const { ctx, settle } = makeExecutionContext();
  const restoreFetch = stubFetch();

  try {
    const created = await (
      await app.request(
        "/api/admin/articles",
        {
          method: "POST",
          headers: { "content-type": "application/json", ...authHeaders },
          body: JSON.stringify({ url: "https://example.com/hygiene-failed" }),
        },
        env,
        ctx,
      )
    ).json();
    await settle();

    const publicRes = await app.request(`/api/articles/${created.id}`, {}, env, ctx);
    assertEquals(publicRes.status, 404);
    const publicBody = await publicRes.json();
    assertEquals(JSON.stringify(publicBody).includes("daily-limit"), false);

    const adminRes = await app.request(
      `/api/admin/articles/${created.id}`,
      { headers: authHeaders },
      env,
      ctx,
    );
    const adminArticle = await adminRes.json();
    assertEquals(adminArticle.error, "daily-limit");
    assertEquals(adminArticle.status, "failed");
  } finally {
    restoreFetch();
  }
});

Deno.test("public GET /api/articles/:id: 404 for a ready but archived article (Task 55 — an archived row must be exactly as invisible to a visitor by direct id as it already is in the normal feed)", async () => {
  const { env, authHeaders } = await makeOwnerContext();
  const { ctx, settle } = makeExecutionContext();
  const restoreFetch = stubFetch();

  try {
    const created = await (
      await app.request(
        "/api/admin/articles",
        {
          method: "POST",
          headers: { "content-type": "application/json", ...authHeaders },
          body: JSON.stringify({ url: "https://example.com/hygiene-archived" }),
        },
        env,
        ctx,
      )
    ).json();
    await settle();

    await app.request(
      `/api/admin/articles/${created.id}`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json", ...authHeaders },
        body: JSON.stringify({ archived: true }),
      },
      env,
      ctx,
    );

    const publicRes = await app.request(`/api/articles/${created.id}`, {}, env, ctx);
    assertEquals(publicRes.status, 404);

    const adminRes = await app.request(
      `/api/admin/articles/${created.id}`,
      { headers: authHeaders },
      env,
      ctx,
    );
    const adminArticle = await adminRes.json();
    assertEquals(adminArticle.status, "ready");
    assertEquals(adminArticle.archived, true);
  } finally {
    restoreFetch();
  }
});

Deno.test("public GET /api/articles/:id: has_error is false and full_text/error are absent for a ready article", async () => {
  const { env, authHeaders } = await makeOwnerContext();
  const { ctx, settle } = makeExecutionContext();
  const restoreFetch = stubFetch();

  try {
    const created = await (
      await app.request(
        "/api/admin/articles",
        {
          method: "POST",
          headers: { "content-type": "application/json", ...authHeaders },
          body: JSON.stringify({ url: "https://example.com/hygiene-ready" }),
        },
        env,
        ctx,
      )
    ).json();
    await settle();

    const publicRes = await app.request(`/api/articles/${created.id}`, {}, env, ctx);
    const publicArticle = await publicRes.json();
    assertEquals("full_text" in publicArticle, false);
    assertEquals("error" in publicArticle, false);
    assertEquals(publicArticle.has_error, false);
    assertEquals(publicArticle.status, "ready");

    const adminRes = await app.request(
      `/api/admin/articles/${created.id}`,
      { headers: authHeaders },
      env,
      ctx,
    );
    const adminArticle = await adminRes.json();
    assertEquals(typeof adminArticle.full_text, "string");
    assertEquals(adminArticle.full_text.length > 0, true);
    assertEquals(adminArticle.error, null);
  } finally {
    restoreFetch();
  }
});

Deno.test("GET /api/admin/articles/:id: 404 for a missing id (not confused with 401)", async () => {
  const { env, authHeaders } = await makeOwnerContext();
  const ctx = makeExecutionContext().ctx;
  const res = await app.request(
    "/api/admin/articles/does-not-exist",
    { headers: authHeaders },
    env,
    ctx,
  );
  assertEquals(res.status, 404);
});
