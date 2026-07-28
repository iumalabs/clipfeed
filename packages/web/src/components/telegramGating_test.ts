import { assertEquals } from "@std/assert";
import { Header } from "./Header.tsx";
import { Footer } from "./Footer.tsx";
import { TelegramBanner } from "./TelegramBanner.tsx";
import { dictionaries } from "../i18n/i18n.ts";

// Task 56.5: Header, Footer, and TelegramBanner all take the same
// telegramChannelUrl prop from a single App.tsx fetch — this test proves
// they gate on it identically (all present when set, all absent when
// null) by calling the Preact component functions directly and walking
// the returned vnode tree. No DOM/browser needed — h() just builds plain
// objects — so this stays a pure-logic Deno test, consistent with this
// repo's convention of no component-level DOM test harness.

// deno-lint-ignore no-explicit-any
type VNode = any;

function findVNode(node: VNode, predicate: (n: VNode) => boolean): VNode | null {
  if (node === null || node === undefined || typeof node !== "object") return null;
  if (predicate(node)) return node;
  const children = node.props?.children;
  const list = Array.isArray(children) ? children : [children];
  for (const child of list) {
    const found = findVNode(child, predicate);
    if (found) return found;
  }
  return null;
}

const dict = dictionaries.ru;

const baseHeaderProps = {
  dict,
  lang: "ru" as const,
  onLogoClick: () => {},
  onLangChange: () => {},
  theme: "light" as const,
  onThemeToggle: () => {},
  searchValue: "",
  onSearchChange: () => {},
  onSearchClear: () => {},
  searchMode: "keyword" as const,
  onSearchModeChange: () => {},
  onAddClick: () => {},
  isOwner: false,
  repoUrl: null,
  onFiltersClick: () => {},
  activeFilterCount: 0,
};

Deno.test("Header: renders the Telegram icon when telegramChannelUrl is set", () => {
  const vnode = Header({ ...baseHeaderProps, telegramChannelUrl: "https://t.me/example" });
  const link = findVNode(vnode, (n) => n.type === "a" && n.props?.href === "https://t.me/example");
  assertEquals(link !== null, true);
});

Deno.test("Header: omits the Telegram icon when telegramChannelUrl is null", () => {
  const vnode = Header({ ...baseHeaderProps, telegramChannelUrl: null });
  const link = findVNode(
    vnode,
    (n) =>
      n.type === "a" && typeof n.props?.["aria-label"] === "string" &&
      /telegram/i.test(n.props["aria-label"]),
  );
  assertEquals(link, null);
});

Deno.test("Footer: renders the Telegram link when telegramChannelUrl is set", () => {
  const vnode = Footer({ dict, repoUrl: null, telegramChannelUrl: "https://t.me/example" });
  const link = findVNode(vnode, (n) => n.type === "a" && n.props?.href === "https://t.me/example");
  assertEquals(link !== null, true);
});

Deno.test("Footer: omits the Telegram link when telegramChannelUrl is null", () => {
  const vnode = Footer({ dict, repoUrl: null, telegramChannelUrl: null });
  const link = findVNode(vnode, (n) => n.props?.href === "https://t.me/example");
  assertEquals(link, null);
});

Deno.test("TelegramBanner: renders when telegramChannelUrl is set", () => {
  const vnode = TelegramBanner({ dict, telegramChannelUrl: "https://t.me/example" });
  assertEquals(vnode !== null, true);
});

Deno.test("TelegramBanner: renders null when telegramChannelUrl is null", () => {
  const vnode = TelegramBanner({ dict, telegramChannelUrl: null });
  assertEquals(vnode, null);
});

// Task 57: the banner's second, explicit "open in browser" path — must be
// derived from and gated on the exact same telegramChannelUrl as the
// primary link (see lib/api/telegramConfig.ts's deriveTelegramWebPreviewUrl).
Deno.test("TelegramBanner: renders both the primary and web-preview links when telegramChannelUrl is set", () => {
  const vnode = TelegramBanner({ dict, telegramChannelUrl: "https://t.me/example" });
  const primary = findVNode(
    vnode,
    (n) => n.type === "a" && n.props?.href === "https://t.me/example",
  );
  const fallback = findVNode(
    vnode,
    (n) => n.type === "a" && n.props?.href === "https://t.me/s/example",
  );
  assertEquals(primary !== null, true);
  assertEquals(fallback !== null, true);
});

Deno.test("TelegramBanner: omits both links when telegramChannelUrl is null", () => {
  const vnode = TelegramBanner({ dict, telegramChannelUrl: null });
  assertEquals(vnode, null);
});
