"use client";

import { useEffect, useRef } from "react";

// Tells a card when it is on screen and for how long.
//
// The feed is a scroll-snap list, so "on screen" is unambiguous: one card
// fills the space below the header. The observer watches the card against
// the feed itself (its scroll container), and a card counts as seen once
// more than SEEN_RATIO of it is showing.
//
//   onSeen   fires once each time the card comes into view (an impression)
//   onLeft   fires when it goes out of view again, with the milliseconds it
//            was visible (a dwell)
//
// Time spent in a hidden tab does not count: the page visibility listener
// closes the current stretch when the reader switches away and opens a new
// one when they come back. `onLeft` also fires when the card unmounts while
// visible, so the last card of a session is not lost.

const SEEN_RATIO = 0.6;

export function useCardVisibility(
  ref: React.RefObject<HTMLElement>,
  handlers: { onSeen?: () => void; onLeft?: (ms: number) => void },
) {
  // The callbacks change on every render of the feed; a ref keeps the
  // observer from being torn down and rebuilt each time.
  const latest = useRef(handlers);
  latest.current = handlers;

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const root = el.closest<HTMLElement>(".feed") ?? null;

    let since: number | null = null;
    const open = () => {
      if (since === null) since = Date.now();
    };
    const close = () => {
      if (since === null) return;
      const ms = Date.now() - since;
      since = null;
      latest.current.onLeft?.(ms);
    };

    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.intersectionRatio >= SEEN_RATIO) {
            if (since === null) {
              open();
              latest.current.onSeen?.();
            }
          } else {
            close();
          }
        }
      },
      { root, threshold: [0, SEEN_RATIO, 1] },
    );
    io.observe(el);

    const onVisibility = () => {
      if (document.visibilityState === "hidden") close();
      else if (el.isConnected) {
        // Reopen only if the card is still the one on screen.
        const rect = el.getBoundingClientRect();
        const bounds = root?.getBoundingClientRect();
        const top = bounds?.top ?? 0;
        const bottom = bounds?.bottom ?? window.innerHeight;
        const shown = Math.min(rect.bottom, bottom) - Math.max(rect.top, top);
        if (shown / rect.height >= SEEN_RATIO) open();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      io.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      close(); // the card is going away; count what it had
    };
  }, [ref]);
}
