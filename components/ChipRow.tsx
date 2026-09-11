"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

// A horizontal row of chips (fields, topics) that can hold more than fits.
// The scrollbar is hidden for looks, so the row needs other ways to show and
// reach what is off-screen:
//   - the mouse wheel over the row scrolls it sideways (touch swipes already
//     work natively),
//   - an arrow button with a soft fade appears at any edge that has more
//     chips, and scrolls by most of a row width,
//   - the chip marked aria-pressed="true" is scrolled into view whenever
//     `activeKey` changes, so a selection made elsewhere (a tag on a card) is
//     never hidden.
export function ChipRow({
  label,
  activeKey,
  className = "",
  children,
}: {
  /** Accessible name of the group, e.g. "Field of study". */
  label: string;
  /** Changes when the selected chip changes; triggers scroll-into-view. */
  activeKey?: string | null;
  className?: string;
  children: ReactNode;
}) {
  const row = useRef<HTMLDivElement | null>(null);
  const [canLeft, setCanLeft] = useState(false);
  const [canRight, setCanRight] = useState(false);

  const update = useCallback(() => {
    const el = row.current;
    if (!el) return;
    setCanLeft(el.scrollLeft > 1);
    setCanRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 1);
  }, []);

  // Recompute the arrows on scroll, on resize, and whenever the chips change.
  useEffect(() => {
    const el = row.current;
    if (!el) return;
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    const mo = new MutationObserver(update);
    mo.observe(el, { childList: true, subtree: true });
    el.addEventListener("scroll", update, { passive: true });

    // Wheel: a vertical wheel over an overflowing row scrolls it sideways.
    // Registered natively because React marks wheel listeners passive, which
    // would make preventDefault a no-op.
    const onWheel = (e: WheelEvent) => {
      if (el.scrollWidth <= el.clientWidth) return;
      if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
      el.scrollLeft += e.deltaY;
      e.preventDefault();
    };
    el.addEventListener("wheel", onWheel, { passive: false });

    return () => {
      ro.disconnect();
      mo.disconnect();
      el.removeEventListener("scroll", update);
      el.removeEventListener("wheel", onWheel);
    };
  }, [update]);

  // Keep the selected chip visible, centred so it never sits under an edge arrow.
  useEffect(() => {
    const active = row.current?.querySelector<HTMLElement>('[aria-pressed="true"]');
    active?.scrollIntoView({ inline: "center", block: "nearest", behavior: "auto" });
  }, [activeKey]);

  const nudge = (direction: -1 | 1) => {
    const el = row.current;
    if (!el) return;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollBy({ left: direction * el.clientWidth * 0.8, behavior: reduceMotion ? "auto" : "smooth" });
  };

  return (
    <div className={`relative min-w-0 ${className}`}>
      <div
        ref={row}
        role="group"
        aria-label={label}
        className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {children}
      </div>

      {canLeft && <EdgeButton side="left" onClick={() => nudge(-1)} label={`Scroll ${label.toLowerCase()} left`} />}
      {canRight && <EdgeButton side="right" onClick={() => nudge(1)} label={`Scroll ${label.toLowerCase()} right`} />}
    </div>
  );
}

// Arrow over a fade at one edge of the row. Hidden from assistive tech and
// the tab order: keyboard users reach every chip directly and the browser
// scrolls the focused chip into view by itself.
function EdgeButton({ side, onClick, label }: { side: "left" | "right"; onClick: () => void; label: string }) {
  const edge = side === "left" ? "left-0 bg-gradient-to-r" : "right-0 bg-gradient-to-l";
  return (
    <div
      aria-hidden="true"
      className={`pointer-events-none absolute inset-y-0 flex w-14 items-center pb-1 from-paper via-paper/90 to-transparent ${edge} ${
        side === "left" ? "justify-start" : "justify-end"
      }`}
    >
      <button
        type="button"
        tabIndex={-1}
        aria-label={label}
        onClick={onClick}
        className="pointer-events-auto flex h-7 w-7 items-center justify-center rounded-full border border-line bg-paper text-ink shadow-sm transition hover:border-ink active:scale-95"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          {side === "left" ? <path d="M15 6l-6 6 6 6" /> : <path d="M9 6l6 6-6 6" />}
        </svg>
      </button>
    </div>
  );
}
