// Task 48 Part 2: GET /bot — a small, static transparency page explaining
// what this instance's fetcher does, for any webmaster/crawler-operator who
// lands on it (e.g. after checking their own server logs). Pure HTML
// builder kept separate from the route (see index.ts) so it's testable
// without a Hono context.

export interface BotPageConfig {
  // AGENT_DAILY_PICKS, parsed — how many new articles a fork's own agent
  // run saves per day (see agent/ranking.ts's parseAgentDailyPicks). Stated
  // as a rough daily volume, not a live count, since the exact number
  // varies with PUBLISH_MAX_PER_DAY/agent runs and isn't worth a DB query
  // on every request to this static page.
  dailyPicks: number;
  // Whether this instance currently honors robots.txt (ROBOTS_RESPECT) —
  // reflected live rather than assumed, since a fork can disable it.
  robotsRespected: boolean;
  // CONTACT_EMAIL, when set — the removal-request section is omitted
  // entirely when this is null (never a hardcoded owner-specific default).
  contactEmail: string | null;
  // REPO_URL, when set — linked as an alternative removal path (open an
  // issue) alongside the mailto:, same optional-link convention as the
  // header/footer's GitHub icon (see GET /api/config).
  repoUrl: string | null;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function buildBotPageHtml(config: BotPageConfig): string {
  const robotsLine = config.robotsRespected
    ? "This instance checks and honors each source's robots.txt before fetching an article — a page a site disallows to bots is never fetched."
    : "This instance's owner has disabled robots.txt checking for this deployment.";

  const contactSection = config.contactEmail
    ? `<p>To request removal of a specific article (or its image), email
<a href="mailto:${escapeHtml(config.contactEmail)}">${escapeHtml(config.contactEmail)}</a> with the
article's link. Removals are typically handled within a few days.</p>`
    : "";

  const issueSection = config.repoUrl
    ? `<p>You can also open an issue on the
<a href="${escapeHtml(config.repoUrl)}">source repository</a>.</p>`
    : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>About this bot — ClipFeed</title>
<link rel="icon" href="/favicon-32.png">
<style>
  body { font: 16px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; max-width: 640px; margin: 40px auto; padding: 0 20px; color: #1a1a1a; }
  h1 { font-size: 1.4rem; }
  a { color: #2563eb; }
</style>
</head>
<body>
<h1>What is this?</h1>
<p>ClipFeed is a personal news-reading feed. It reads a small, fixed list of publisher-provided
RSS feeds (and Hacker News) chosen by its owner, and fetches the linked article pages to produce a
short summary.</p>
<p>${escapeHtml(robotsLine)}</p>
<h1>What gets published</h1>
<p>ClipFeed publishes a short SUMMARY of each article, with attribution and a link back to the
original — never the article's full text. Roughly ${config.dailyPicks} new articles are added per
day.</p>
<h1>Removal requests</h1>
${contactSection}
${issueSection}
</body>
</html>
`;
}
