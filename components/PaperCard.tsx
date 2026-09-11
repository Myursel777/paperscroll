"use client";

import { useId, useState } from "react";
import type { Paper } from "@/lib/arxiv";
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
}) {
  const [expanded, setExpanded] = useState(false);
  const titleId = useId();
  const topics = (paper.tags ?? []).map(topicById).filter((t) => t !== undefined);

  return (
    <article
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
            onClick={() => setExpanded((v) => !v)}
            className="mt-2 text-sm font-medium underline underline-offset-4"
            style={{ color: accent }}
          >
            {expanded ? "Show less" : "Read full abstract"}
          </button>
        )}
       </div>
      </div>

      {/* Bottom: actions, pinned */}
      <footer className="mx-auto flex w-full max-w-2xl shrink-0 items-center gap-3">
        <a
          href={paper.id}
          target="_blank"
          rel="noreferrer"
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
      </footer>
    </article>
  );
}
