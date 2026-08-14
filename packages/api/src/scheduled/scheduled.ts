import "../env.d.ts";
import { runAgentJob } from "../agent/agent.ts";
import { hasRunAtHourToday } from "../agent/agent-run-tracker.ts";
import { runHealingJob } from "../pipeline/healing.ts";
import { runPublishJob } from "../telegram/telegram-publish.ts";

// [vars] string, not a number — an empty or invalid value disables the
// agent job entirely, same "safe default = off" pattern as the rest of
// this app's optional integrations (Access, Turnstile, Telegram).
export function parseHour(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  const n = Number(trimmed);
  if (!Number.isInteger(n) || n < 0 || n > 23) return null;
  return n;
}

// Cron trigger (wrangler.toml [triggers] crons = ["*/30 * * * *"]) fires
// every 30 minutes; the scraping agent dispatch is gated by UTC hour
// (AGENT_HOUR_UTC and, optionally, a second run at AGENT_HOUR_UTC_2) and is
// idempotency-checked PER HOUR (see agent-run-tracker.ts's
// hasRunAtHourToday) so the twice-an-hour ticks don't double-run either
// slot, while still letting the two configured hours each fire once —
// the old fixed-time morning digest that used to dispatch here
// (DIGEST_HOUR_UTC) was retired in favor of the Telegram drip publish job
// (see telegram-publish.ts's runPublishJob), which runs on EVERY tick and
// gates itself internally via its own start/end window + PUBLISH_ENABLED,
// rather than a single dispatch hour — one post per tick across a window,
// not one job at one hour. The healing sweep (see healing.ts) also has no
// hour config — it runs on every tick too, last.
export async function handleScheduled(
  env: Env,
  scheduledTimeMs: number,
  ctx?: ExecutionContext,
): Promise<void> {
  const currentHour = new Date(scheduledTimeMs).getUTCHours();
  const now = new Date(scheduledTimeMs);

  const agentHours = [parseHour(env.AGENT_HOUR_UTC), parseHour(env.AGENT_HOUR_UTC_2 ?? "")]
    .filter((hour): hour is number => hour !== null);

  if (agentHours.includes(currentHour)) {
    // Run-level idempotency — if the agent already ran at THIS hour today
    // (a prior tick this same hour, or a manual trigger during this hour —
    // see agent-run-tracker.ts), skip rather than doubling this slot's
    // picks. A run recorded at the OTHER configured hour never blocks this
    // one. Manual triggers (POST /api/admin/agent/run, /scrape)
    // deliberately do NOT check this: owner intent always wins there, they
    // just get a warning first (see index.ts/telegram-webhook.ts).
    if (await hasRunAtHourToday(env.CACHE, currentHour, now)) {
      console.log(JSON.stringify({
        event: "agent_run_skipped",
        reason: "already_ran_this_hour",
        hour: currentHour,
      }));
    } else {
      await runAgentJob(env, undefined, "scheduled");
    }
  }
  await runPublishJob(env, scheduledTimeMs);
  await runHealingJob(env, ctx);
}
