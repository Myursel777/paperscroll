"use client";

import { useId, useRef, useState } from "react";
import type { Paper } from "@/lib/arxiv";
import { useCardVisibility } from "@/lib/foryou/useCardVisibility";
import { reasonText, type Reason } from "@/lib/foryou/rank";
import { topicById } from "@/lib/topics";

function fmtDate(iso: string) {
  const d = new Date(iso);
  return isNaN(d.getTime())
    ? ""
    : d.toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
}

export function PaperCard({
  paper,
  accent,
  fieldLabel,
  index,
  saved,
  onToggleSave,
  onMoreLikeThis,
  onTopic,
  reason,
  hidden = false,
  onSeen,
  onLeft,
  onExpand,
  onRead,
  onNotInterested,
  onUndoHide,
}: {
  paper: Paper;
  accent: string;
  fieldLabel: string;
  index: number;
  saved: boolean;
  onToggleSave: () => void;
  onMoreLikeThis?: () => void;
  /** Called with a topic id when a tag chip is tapped. */
  onTopic?: (topicId: string) => void;
  /** Why For You picked this paper. Only set in the For You feed. */
  reason?: Reason;
  /** The reader marked this paper "not interested"; it stays until the feed is rebuilt. */
  hidden?: boolean;
  /** The card came into view. */
  onSeen?: () => void;
  /** The card went out of view, with the milliseconds it was showing. */
  onLeft?: (ms: number) => void;
  onExpand?: () => void;
  /** "Read paper" or "PDF" was opened. */
  onRead?: () => void;
  onNotInterested?: () => void;
  onUndoHide?: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const titleId = useId();
  const article = useRef<HTMLElement>(null);
  const topics = (paper.tags ?? []).map(topicById).filter((t) => t !== undefined);

  // Impressions and dwell time, the two signals For You learns from without
  // the reader doing anything (see lib/foryou/useCardVisibility.ts).
  useCardVisibility(article, { onSeen, onLeft });

  return (
    <article
      ref={article}
      aria-labelledby={titleId}
      className="snap-card relative flex flex-col px-6 py-8 sm:px-12 sm:py-10"
      style={{
        background: `radial-gradient(120% 80% at 50% 0%, ${accent}14 0%, transparent 60%)`,
      }}
    >
      {/* Top: field stamp + index */}
      <header className="flex shrink-0 items-center justify-between">
        <span
          className="rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wider"
          style={{ background: `${accent}22`, color: accent }}
        >
          {fieldLabel}
        </span>
        <span className="font-mono text-xs text-muted">
          #{String(index + 1).padStart(2, "0")}
        </span>
      </header>

      {/* Middle: the paper itself. It takes the space between header and
          footer: short content is centred, long content (a three-line title
          plus the expanded abstract) scrolls inside the card. The buttons
          below therefore sit in the same place on every card. */}
      <div className="mx-auto flex min-h-0 w-full max-w-2xl flex-1 flex-col overflow-y-auto py-6 [scrollbar-width:thin]">
       <div className="my-auto">
        {/* Why this paper is here. Set in the For You feed only. */}
        {reason && (
          <p className="mb-3 flex items-center gap-1.5 text-xs font-medium text-muted">
            <span aria-hidden="true" style={{ color: accent }}>
              ✦
            </span>
            {reasonText(reason)}
          </p>
        )}

        <h2 id={titleId} className="font-display text-3xl font-semibold leading-tight sm:text-5xl">
          {paper.title}
        </h2>

        <p className="mt-3 text-sm text-muted">
          {paper.authors.slice(0, 4).join(", ")}
          {paper.authors.length > 4 ? " et al." : ""}
          {paper.published ? ` · ${fmtDate(paper.published)}` : ""}
        </p>

        {/* Topic tags from the server-side tagger. Tapping one searches that topic. */}
        {topics.length > 0 && (
          <ul aria-label="Topics" className="mt-3 flex flex-wrap gap-2">
            {topics.map((t) => (
              <li key={t.id}>
                <button
                  onClick={() => onTopic?.(t.id)}
                  title={t.description}
                  aria-label={`More papers about ${t.label}`}
                  className="rounded-full border border-line px-2.5 py-0.5 text-xs font-medium text-muted transition hover:border-ink hover:text-ink"
                >
                  {t.label}
                </button>
              </li>
            ))}
          </ul>
        )}

        <p
          className={`mt-6 text-base leading-relaxed text-ink/80 ${
            expanded ? "" : "clamp-6"
          }`}
        >
          {paper.summary}
        </p>

        {paper.summary.length > 280 && (
          <button
            onClick={() => {
              if (!expanded) onExpand?.();
              setExpanded((v) => !v);
            }}
            className="mt-2 text-sm font-medium underline underline-offset-4"
            style={{ color: accent }}
          >
            {expanded ? "Show less" : "Read full abstract"}
          </button>
        )}
       </div>
      </div>

      {/* Bottom: actions, pinned */}
      <footer className="mx-auto w-full max-w-2xl shrink-0">
        <div className="flex items-center gap-3">
          <a
            href={paper.id}
            target="_blank"
            rel="noreferrer"
            onClick={onRead}
            className="flex-1 rounded-full px-5 py-3 text-center text-sm font-semibold text-onAccent transition active:scale-95"
            style={{ background: accent }}
          >
            Read paper
          </a>

          {paper.pdfLink && (
            <a
              href={paper.pdfLink}
              target="_blank"
              rel="noreferrer"
              download
              onClick={onRead}
              className="rounded-full border border-line bg-paper px-5 py-3 text-sm font-semibold transition active:scale-95"
              aria-label="Open PDF"
            >
              PDF
            </a>
          )}

          <button
            onClick={onToggleSave}
            aria-pressed={saved}
            className="rounded-full border border-line bg-paper px-5 py-3 text-sm font-semibold transition active:scale-95"
            style={saved ? { borderColor: accent, color: accent } : undefined}
          >
            {saved ? "Saved" : "Save"}
          </button>

          {onMoreLikeThis && (
            <button
              onClick={onMoreLikeThis}
              className="rounded-full border border-line bg-paper px-5 py-3 text-sm font-semibold transition active:scale-95"
              aria-label="Find similar papers"
            >
              Similar
            </button>
          )}
        </div>

        {/* "Not interested" teaches For You what to stop showing. The card
            stays where it is, because removing it would move the page under
            the reader's thumb, and says so with an undo. */}
        {(onNotInterested || hidden) && (
          <p className="mt-3 text-xs text-muted">
            {hidden ? (
              <>
                <span>Hidden from For You.</span>{" "}
                <button onClick={onUndoHide} className="font-medium underline underline-offset-2 hover:text-ink">
                  Undo
                </button>
              </>
            ) : (
              <button
                onClick={onNotInterested}
                aria-label={`Not interested in ${paper.title}`}
                className="underline underline-offset-2 hover:text-ink"
              >
                Not interested
              </button>
            )}
          </p>
        )}
      </footer>
    </article>
  );
}
