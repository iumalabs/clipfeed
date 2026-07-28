import { useEffect, useRef, useState } from "preact/hooks";
import type { Dictionary } from "../i18n/i18n.ts";
import { filterFacetsByLabel, splitTopFacets } from "../lib/feed/facetDisclosure.ts";
import {
  ActiveFilterChips,
  type SourceFacet,
  SourcePills,
  type TagFacet,
  TopicPills,
} from "./Sidebar.tsx";

// Task 54: caps how many tag/source pills show before the sheet needs its
// own "show all" — see facetDisclosure.ts's doc comment for why this exists
// at all (avoiding recreating the "wall of pills" problem one tap deeper).
const TOP_N = 15;

// Swipe-down-to-dismiss threshold, in CSS px of vertical finger travel —
// generous enough that an ordinary attempt to scroll the pill lists (a
// mostly-horizontal or short vertical drag) never accidentally triggers it.
const SWIPE_DISMISS_PX = 80;

export interface FilterSheetProps {
  dict: Dictionary;
  open: boolean;
  onClose: () => void;
  tags: TagFacet[];
  activeTag: string | null;
  onTagClick: (tag: string | null) => void;
  onClearAll: () => void;
  sources: SourceFacet[];
  activeSource: string | null;
  onSourceClick: (source: string | null) => void;
  totalCount: number;
  archivedView: boolean;
  onArchiveToggle: () => void;
  isOwner: boolean;
}

function focusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(
    container.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    ),
  );
}

export function FilterSheet(
  {
    dict,
    open,
    onClose,
    tags,
    activeTag,
    onTagClick,
    onClearAll,
    sources,
    activeSource,
    onSourceClick,
    totalCount,
    archivedView,
    onArchiveToggle,
    isOwner,
  }: FilterSheetProps,
) {
  const [searchValue, setSearchValue] = useState("");
  const [tagsExpanded, setTagsExpanded] = useState(false);
  const [sourcesExpanded, setSourcesExpanded] = useState(false);
  const sheetRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const touchStartYRef = useRef<number | null>(null);

  // A fresh open should never carry over a stale search/expansion from the
  // previous time the sheet was shown.
  useEffect(() => {
    if (!open) return;
    setSearchValue("");
    setTagsExpanded(false);
    setSourcesExpanded(false);
    searchInputRef.current?.focus();
  }, [open]);

  // Body scroll lock while the sheet is open — restores whatever inline
  // value was there before (normally none) rather than assuming "".
  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  // Escape-to-close plus a same-container Tab focus trap — Tab/Shift+Tab at
  // either end of the sheet's focusable elements wraps around instead of
  // escaping to the page behind the (dimmed, still-present) backdrop.
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (e.key !== "Tab" || !sheetRef.current) return;
      const focusable = focusableElements(sheetRef.current);
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  // While actively searching, show every match regardless of the top-N cap
  // — narrowing the list down further would fight the point of searching.
  const searching = searchValue.trim() !== "";
  const filteredTags = filterFacetsByLabel(tags, searchValue, (f) => f.tag);
  const filteredSources = filterFacetsByLabel(sources, searchValue, (f) => f.source);
  const tagsView = searching
    ? { visible: filteredTags, hiddenCount: 0 }
    : splitTopFacets(filteredTags, TOP_N, tagsExpanded);
  const sourcesView = searching
    ? { visible: filteredSources, hiddenCount: 0 }
    : splitTopFacets(filteredSources, TOP_N, sourcesExpanded);

  // Picking a tag/source "applies it AND closes the sheet" per spec; clearing
  // one via its active-filter chip does not — that's a "keep browsing filters"
  // action, not a conclusive pick.
  const applyTag = (tag: string | null) => {
    onTagClick(tag);
    onClose();
  };
  const applySource = (source: string | null) => {
    onSourceClick(source);
    onClose();
  };
  const applyClearAll = () => {
    onClearAll();
    onClose();
  };
  const applyArchiveToggle = () => {
    onArchiveToggle();
    onClose();
  };

  const handleTouchStart = (e: TouchEvent) => {
    touchStartYRef.current = e.touches[0]?.clientY ?? null;
  };
  const handleTouchMove = (e: TouchEvent) => {
    if (touchStartYRef.current === null) return;
    const currentY = e.touches[0]?.clientY;
    if (currentY === undefined) return;
    if (currentY - touchStartYRef.current > SWIPE_DISMISS_PX) {
      touchStartYRef.current = null;
      onClose();
    }
  };
  const handleTouchEnd = () => {
    touchStartYRef.current = null;
  };

  return (
    <div
      class="filter-sheet-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={sheetRef}
        class="filter-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="filter-sheet-title"
      >
        <div
          class="filter-sheet-handle"
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        />

        <div class="filter-sheet-header">
          <h2 class="filter-sheet-title" id="filter-sheet-title">{dict.filtersSheetTitle}</h2>
          <button
            type="button"
            class="icon-button"
            aria-label={dict.filtersSheetCloseAria}
            onClick={onClose}
          >
            ✕
          </button>
        </div>

        <ActiveFilterChips
          activeTag={activeTag}
          activeSource={activeSource}
          onClearTag={() => onTagClick(null)}
          onClearSource={() => onSourceClick(null)}
          clearTagAria={dict.clearTagFilterAria}
          clearSourceAria={dict.clearSourceFilterAria}
        />

        <input
          ref={searchInputRef}
          type="search"
          class="filter-sheet-search"
          placeholder={dict.filtersSearchPlaceholder}
          value={searchValue}
          onInput={(e) => setSearchValue((e.target as HTMLInputElement).value)}
          aria-label={dict.filtersSearchPlaceholder}
        />

        <div class="filter-sheet-section">
          <h3 class="sidebar-heading">{dict.filtersTagsHeading}</h3>
          <TopicPills
            dict={dict}
            tags={tagsView.visible}
            activeTag={activeTag}
            onTagClick={applyTag}
            onClearAll={applyClearAll}
          />
          {tagsView.hiddenCount > 0 && (
            <button
              type="button"
              class="filter-sheet-showall"
              onClick={() => setTagsExpanded(true)}
            >
              {dict.filtersShowAllLabel} ({tagsView.hiddenCount})
            </button>
          )}
        </div>

        <div class="filter-sheet-section">
          <h3 class="sidebar-heading">{dict.sidebarSourcesHeading}</h3>
          <div class="pill-group" role="group">
            <SourcePills
              sources={sourcesView.visible}
              activeSource={activeSource}
              onSourceClick={applySource}
            />
          </div>
          {sourcesView.hiddenCount > 0 && (
            <button
              type="button"
              class="filter-sheet-showall"
              onClick={() => setSourcesExpanded(true)}
            >
              {dict.filtersShowAllLabel} ({sourcesView.hiddenCount})
            </button>
          )}
        </div>

        <div class="filter-sheet-section stat-card">
          <div class="stat-value">{totalCount}</div>
          <div class="stat-label">{dict.sidebarTotalArticles}</div>
        </div>

        {isOwner && (
          <button type="button" class="archive-link" onClick={applyArchiveToggle}>
            {archivedView ? dict.sidebarBackToFeed : dict.sidebarArchiveLink}
          </button>
        )}
      </div>
    </div>
  );
}
