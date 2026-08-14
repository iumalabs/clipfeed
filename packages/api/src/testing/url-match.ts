// Test-only helper for fetch-stub dispatchers: matches a request's exact
// hostname instead of doing a raw substring check on the URL string (e.g.
// `url.includes("api.anthropic.com")` or `url.startsWith("https://api.
// anthropic.com")`), which CodeQL flags as incomplete URL substring
// sanitization — a URL like "https://evil.com/api.anthropic.com" or
// "https://api.anthropic.com.evil.com" would also match a substring check,
// even though nothing in this codebase's tests is attacker-controlled.
// Parsing with `new URL()` and comparing `hostname` exactly is both the
// CodeQL-clean fix and the actually-correct one — see the commit that
// established this pattern for the original single-use case
// (`articles_test.ts`'s `isAnthropicUrl`).
export function matchesHost(input: string | URL | Request, hostname: string): boolean {
  try {
    const url = input instanceof Request ? new URL(input.url) : new URL(input);
    return url.hostname === hostname;
  } catch {
    return false;
  }
}
