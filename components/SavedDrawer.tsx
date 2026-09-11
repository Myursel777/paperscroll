"use client";

import { useEffect, useRef } from "react";
import type { SavedPaper } from "@/lib/useSaved";

// Slide-over panel with the saved papers. Accessibility notes:
// - It is a dialog: role, aria-modal, and a title the dialog is labelled by.
// - Escape closes it. Focus moves into the panel when it opens and returns
//   to whatever opened it when it closes.
// - While closed it is `invisible`, so it is out of the tab order and hidden
//   from screen readers even though it stays in the DOM for the transition.
export function SavedDrawer({
  open,
  saved,
  onClose,
  onRemove,
}: {
  open: boolean;
  saved: SavedPaper[];
  onClose: () => void;
  onRemove: (id: string) => void;
}) {
  const panel = useRef<HTMLElement | null>(null);
  const opener = useRef<HTMLElement | null>(null);
  const close = useRef(onClose);
  close.current = onClose;

  useEffect(() => {
    if (!open) return;
    opener.current = document.activeElement as HTMLElement | null;
    panel.current?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close.current();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      opener.current?.focus();
    };
  }, [open]);

  return (
    <>
      <div
        onClick={onClose}
        aria-hidden="true"
        className={`fixed inset-0 z-40 bg-ink/30 transition-opacity ${
          open ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      />
      <aside
        ref={panel}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="saved-drawer-title"
        className={`fixed right-0 top-0 z-50 flex h-full w-full max-w-md flex-col bg-paper shadow-2xl outline-none transition-[transform,visibility] ${
          open ? "visible translate-x-0" : "invisible translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <h2 id="saved-drawer-title" className="font-display text-xl font-semibold">
            Saved · {saved.length}
          </h2>
          <button onClick={onClose} aria-label="Close saved papers" className="text-sm text-muted">
            Close
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {saved.length === 0 ? (
            <p className="mt-10 text-center text-sm text-muted">
              Nothing saved yet. Tap “Save” on a paper to keep it here.
            </p>
          ) : (
            <ul className="space-y-4">
              {saved.map((p) => (
                <li key={p.id} className="border-b border-line pb-4">
                  <a
                    href={p.id}
                    target="_blank"
                    rel="noreferrer"
                    className="font-display text-base font-medium leading-snug hover:underline"
                  >
                    {p.title}
                  </a>
                  <div className="mt-2 flex items-center gap-4 text-xs">
                    {p.pdfLink && (
                      <a
                        href={p.pdfLink}
                        target="_blank"
                        rel="noreferrer"
                        aria-label={`Open PDF of ${p.title}`}
                        className="text-muted underline"
                      >
                        PDF
                      </a>
                    )}
                    <button
                      onClick={() => onRemove(p.id)}
                      aria-label={`Remove ${p.title} from saved`}
                      className="text-muted underline"
                    >
                      Remove
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </aside>
    </>
  );
}
