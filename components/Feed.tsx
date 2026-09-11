"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  FIELDS,
  fieldById,
  fieldForCategory,
  type Paper,
} from "@/lib/arxiv";
import { topicById, topicsForField } from "@/lib/topics";
import { useUser, userInitial } from "@/lib/auth/useUser";
import { accountsEnabled } from "@/lib/supabase/config";
import { useSaved } from "@/lib/useSaved";
import { recommend, similarTo } from "@/lib/recommender";
import { rankNeural } from "@/lib/neuralRecommender";
import { PaperCard } from "@/components/PaperCard";
import { CategoryBar } from "@/components/CategoryBar";
import { ChipRow } from "@/components/ChipRow";
import { SavedDrawer } from "@/components/SavedDrawer";
import { SkeletonCard } from "@/components/SkeletonCard";

const PER_PAGE = 12;
type Mode = "field" | "foryou" | "similar";

const STALE_NOTICE =
  "arXiv is rate limiting us right now, so these are cached results.";

// Fetch one page of a field from our API route. The route queues and caches
// arXiv calls, so calling this freely from the client is safe; on a 429 it
// returns whatever it cached before, flagged as stale.
async function fetchField(field: string, q = "", start = 0, max = PER_PAGE) {
  const params = new URLSearchParams({ field, q, start: String(start), max: String(max) });
  try {
    const res = await fetch(`/api/papers?${params}`);
    const data = await res.json();
    return {
      papers: (data.papers ?? []) as Paper[],
      error: (data.error as string | undefined) ?? (data.stale ? STALE_NOTICE : undefined),
    };
  } catch {
    return { papers: [] as Paper[], error: "Could not reach the server. Check your connection and try again." };
  }
}

function dedupe(papers: Paper[]) {
  const seen = new Set<string>();
  return papers.filter((p) => (seen.has(p.id) ? false : (seen.add(p.id), true)));
}

export function Feed() {
  const [mode, setMode] = useState<Mode>("field");
  const [fieldId, setFieldId] = useState("ai-ml");
  const [seed, setSeed] = useState<Paper | null>(null);

  const [query, setQuery] = useState("");
  const [searchInput, setSearchInput] = useState("");
  // A selected topic replaces the search: its arXiv query is what gets sent.
  const [topicId, setTopicId] = useState<string | null>(null);
  const activeTopic = topicId ? topicById(topicId) : undefined;
  const effectiveQuery = activeTopic ? activeTopic.query : query;
  const [papers, setPapers] = useState<Paper[]>([]);
  const [start, setStart] = useState(0);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0); // bumped by "Try again"
  const [drawerOpen, setDrawerOpen] = useState(false);

  const field = fieldById(fieldId);
  const fieldTopics = topicsForField(fieldId);
  const { saved, isSaved, toggle, remove } = useSaved();
  const { user } = useUser();
  const sentinel = useRef<HTMLDivElement | null>(null);
  const feedRef = useRef<HTMLDivElement | null>(null);
  // Mirrors `loading` for the IntersectionObserver callback, which otherwise
  // reads a stale value from the render it was created in.
  const loadingRef = useRef(false);
  loadingRef.current = loading;
  const drawerOpenRef = useRef(false);
  drawerOpenRef.current = drawerOpen;

  // The header is fixed and its height changes (topics row, "Similar to"
  // row). It is measured into the --header-h variable on the feed, which
  // globals.css uses for the feed padding, the snap offset, and card height.
  const headerRef = useRef<HTMLDivElement | null>(null);
  const [headerH, setHeaderH] = useState(112);
  useEffect(() => {
    const el = headerRef.current;
    if (!el) return;
    const measure = () => setHeaderH(Math.round(el.getBoundingClientRect().height));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Which fields to draw the "For You" candidate pool from: the ones you've
  // saved from most, or a sensible default before you've saved anything.
  const poolFields = useCallback(() => {
    const counts = new Map<string, number>();
    for (const p of saved) {
      const f = fieldForCategory(p.primaryCategory).id;
      counts.set(f, (counts.get(f) ?? 0) + 1);
    }
    const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id);
    const picks = top.length ? top.slice(0, 3) : FIELDS.slice(0, 3).map((f) => f.id);
    return picks;
  }, [saved]);

  // --- loaders, one per mode ---

  const loadField = useCallback(
    async (reset: boolean) => {
      const from = reset ? 0 : start;
      const { papers: incoming, error: err } = await fetchField(fieldId, effectiveQuery, from, PER_PAGE);
      if (err) setError(err);
      // arXiv pages can overlap when new papers land between requests, so
      // appended pages are de-duplicated by id.
      setPapers((prev) => (reset ? incoming : dedupe([...prev, ...incoming])));
      setStart(from + PER_PAGE);
      if (incoming.length < PER_PAGE) setDone(true);
    },
    [fieldId, effectiveQuery, start],
  );

  // These requests are serialised and cached by the API route, so fanning
  // out here does not burst arXiv.
  const loadForYou = useCallback(async () => {
    const results = await Promise.all(poolFields().map((f) => fetchField(f, "", 0, 20)));
    const pool = dedupe(results.flatMap((r) => r.papers));
    const err = results.find((r) => r.error)?.error;
    if (err) setError(err);
    else if (!pool.length) setError("Could not load recommendations. Try again.");
    // Neural service when configured and reachable, local TF-IDF otherwise.
    const ranked = (await rankNeural(saved, pool)) ?? recommend(saved, pool);
    setPapers(ranked.map((s) => s.paper));
    setDone(true);
  }, [poolFields, saved]);

  const loadSimilar = useCallback(async (s: Paper) => {
    const f = fieldForCategory(s.primaryCategory).id;
    const { papers: pool, error: err } = await fetchField(f, "", 0, 30);
    if (err) setError(err);
    const candidates = dedupe(pool);
    const ranked = (await rankNeural([s], candidates)) ?? similarTo(s, candidates);
    setPapers(ranked.map((x) => x.paper));
    setDone(true);
  }, []);

  // Reset + load whenever the mode/field/query/seed changes.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      setPapers([]);
      setStart(0);
      setDone(false);
      try {
        if (cancelled) return;
        if (mode === "foryou") await loadForYou();
        else if (mode === "similar" && seed) await loadSimilar(seed);
        else await loadField(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, fieldId, effectiveQuery, seed, attempt]);

  // Arrow keys move one card at a time. Native arrow scrolling only moves a
  // few pixels and the snap pulls it straight back, so we handle it here.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
      if (drawerOpenRef.current) return; // the drawer owns the keyboard while open
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) return;
      const feed = feedRef.current;
      if (!feed) return;

      // Cards snap to the top of the feed's padding box, which is the header
      // height below the scrollport's top, so positions are offset by it.
      const pad = parseFloat(getComputedStyle(feed).paddingTop) || 0;
      const tops = Array.from(feed.querySelectorAll<HTMLElement>(":scope > .snap-card:not(.snap-off)")).map(
        (c) => c.offsetTop - pad,
      );
      const here = feed.scrollTop;
      const next =
        e.key === "ArrowDown"
          ? tops.find((t) => t > here + 1)
          : tops.reverse().find((t) => t < here - 1);
      if (next === undefined) return;

      e.preventDefault();
      const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      feed.scrollTo({ top: next, behavior: reduceMotion ? "auto" : "smooth" });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Infinite scroll (field mode only). It only ever appends: the first page is
  // the reset effect's job, so nothing is observed until papers exist. Before
  // that the end-of-feed card sits in view and the observer would fire at
  // mount, which in WebKit raced the first load and doubled page one.
  useEffect(() => {
    if (mode !== "field" || !sentinel.current || done || papers.length === 0) return;
    // The feed is the scroll container, so it must be the observer's root:
    // with the viewport as root, the sentinel is clipped away as soon as it is
    // scrolled out of the feed and no rootMargin can bring it back. The margin
    // of 150% starts the next page about one and a half cards before the end.
    const io = new IntersectionObserver(
      async (entries) => {
        if (entries[0].isIntersecting && !loadingRef.current) {
          setLoading(true);
          await loadField(false);
          setLoading(false);
        }
      },
      { root: feedRef.current, rootMargin: "150% 0px" },
    );
    io.observe(sentinel.current);
    return () => io.disconnect();
  }, [mode, loadField, loading, done, papers.length]);

  const goField = (id: string) => {
    setSeed(null);
    setTopicId(null);
    setFieldId(id);
    setMode("field");
  };
  // Tapping a topic (in the topics row or on a card) searches that topic in
  // its own field. Tapping the active topic again clears it.
  const goTopic = (id: string) => {
    const topic = topicById(id);
    if (!topic) return;
    if (topicId === id && mode === "field") {
      setTopicId(null);
      return;
    }
    setSeed(null);
    setQuery("");
    setSearchInput("");
    setFieldId(topic.field);
    setTopicId(id);
    setMode("field");
  };
  const goForYou = () => {
    setSeed(null);
    setMode("foryou");
  };
  const goSimilar = (p: Paper) => {
    setSeed(p);
    setMode("similar");
  };

  // The end-of-feed card is a snap target only when it has something to show:
  // the real end of a feed, or an error with its Try again button. While more
  // pages can still load it is not snappable, so the reader stays on the last
  // real card and new cards appear below. If it were snappable, Chrome would
  // keep it in view as pages were inserted above it, the observer would fire
  // again, and the feed would load page after page while showing "Loading".
  const statusSnaps = papers.length > 0 && (done || error !== null);

  // Accent/label per card: in mixed feeds each card keeps its own field colour.
  const cardField = (p: Paper) =>
    mode === "field" ? field : fieldForCategory(p.primaryCategory);

  return (
    <div className="relative">
      <div ref={headerRef} className="fixed inset-x-0 top-0 z-30 bg-paper/80 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center gap-3">
          <h1 className="font-display text-lg font-semibold">
            Paper<span style={{ color: field.accent }}>Scroll</span>
          </h1>
          <form
            className="flex-1"
            onSubmit={(e) => {
              e.preventDefault();
              goField(fieldId); // also clears any active topic
              setQuery(searchInput.trim());
            }}
          >
            <input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              aria-label="Search within the current field"
              placeholder="Search a field…"
              className="w-full rounded-full border border-line bg-paper px-4 py-1.5 text-sm outline-none focus:border-ink"
            />
          </form>
          <button
            onClick={() => setDrawerOpen(true)}
            aria-haspopup="dialog"
            aria-expanded={drawerOpen}
            className="rounded-full border border-line px-4 py-1.5 text-sm font-medium"
          >
            Saved · {saved.length}
          </button>
          {accountsEnabled &&
            (user ? (
              <Link
                href="/account"
                aria-label="Your account"
                title={user.email ?? "Your account"}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-ink text-sm font-semibold text-paper"
              >
                {userInitial(user)}
              </Link>
            ) : (
              <Link href="/login" className="shrink-0 rounded-full border border-line px-4 py-1.5 text-sm font-medium">
                Log in
              </Link>
            ))}
        </div>

        <div className="mx-auto mt-2 flex max-w-3xl items-center gap-2">
          <button
            onClick={goForYou}
            aria-pressed={mode === "foryou"}
            className={`whitespace-nowrap rounded-full border px-4 py-1.5 text-sm font-semibold transition ${
              mode === "foryou" ? "border-ink bg-ink text-paper" : "border-line text-ink"
            }`}
          >
            ✦ For You
          </button>
          <div className="min-w-0 flex-1">
            <CategoryBar active={mode === "field" ? fieldId : ""} onPick={goField} />
          </div>
        </div>

        {mode === "field" && fieldTopics.length > 0 && (
          <ChipRow label="Topics in this field" activeKey={topicId} className="mx-auto mt-2 max-w-3xl">
            {fieldTopics.map((t) => {
              const on = t.id === topicId;
              return (
                <button
                  key={t.id}
                  onClick={() => goTopic(t.id)}
                  aria-pressed={on}
                  title={t.description}
                  className={`whitespace-nowrap rounded-full border px-3 py-1 text-xs font-medium transition ${
                    on ? "" : "border-line text-muted hover:text-ink"
                  }`}
                  style={on ? { background: `${field.accent}22`, color: field.accent, borderColor: field.accent } : undefined}
                >
                  {t.label}
                </button>
              );
            })}
          </ChipRow>
        )}

        {mode === "similar" && seed && (
          <div className="mx-auto mt-2 flex max-w-3xl items-center gap-2 text-sm">
            <span className="truncate text-muted">
              Similar to: <span className="text-ink">{seed.title}</span>
            </span>
            <button
              onClick={() => goField(fieldId)}
              className="ml-auto shrink-0 rounded-full border border-line px-3 py-1 font-medium"
            >
              Back
            </button>
          </div>
        )}
      </div>

      <div ref={feedRef} className="feed" style={{ "--header-h": `${headerH}px` } as React.CSSProperties}>
        {papers.map((p, i) => {
          const f = cardField(p);
          return (
            <PaperCard
              key={p.id}
              paper={p}
              index={i}
              accent={f.accent}
              fieldLabel={f.label}
              saved={isSaved(p.id)}
              onToggleSave={() => toggle(p)}
              onMoreLikeThis={() => goSimilar(p)}
              onTopic={goTopic}
            />
          );
        })}

        {loading &&
          Array.from({ length: papers.length ? 1 : 3 }, (_, i) => (
            <SkeletonCard key={`skeleton-${i}`} />
          ))}

        <div className={`snap-card ${statusSnaps ? "" : "snap-off"} flex items-center justify-center px-6`}>
          <div
            ref={sentinel}
            role="status"
            aria-live="polite"
            className="max-w-sm text-center text-sm text-muted"
          >
            {loading && "Loading papers…"}
            {!loading && error && (
              <div className="flex flex-col items-center gap-3">
                <span className="text-ink">{error}</span>
                <button
                  onClick={() => setAttempt((a) => a + 1)}
                  className="rounded-full border border-line px-4 py-1.5 font-medium text-ink"
                >
                  Try again
                </button>
              </div>
            )}
            {!loading && !error && papers.length === 0 && (
              <span>Nothing here yet. Try another field or search.</span>
            )}
            {!loading && !error && papers.length > 0 && mode === "foryou" && (
              <span>
                {saved.length === 0
                  ? "Save a few papers and refresh — these will start matching your taste."
                  : "End of your recommendations for now."}
              </span>
            )}
            {!loading && !error && done && papers.length > 0 && mode === "field" && (
              <span>You’ve reached the end. Switch fields to keep going.</span>
            )}
            {!loading && !error && papers.length > 0 && mode === "similar" && (
              <span>End of similar papers.</span>
            )}

            <nav aria-label="About this site" className="mt-10 flex justify-center gap-5 text-xs">
              <Link href="/about" className="hover:text-ink">About</Link>
              <Link href="/privacy" className="hover:text-ink">Privacy</Link>
              <Link href="/terms" className="hover:text-ink">Terms</Link>
            </nav>
          </div>
        </div>
      </div>

      <SavedDrawer
        open={drawerOpen}
        saved={saved}
        onClose={() => setDrawerOpen(false)}
        onRemove={remove}
      />
    </div>
  );
}
