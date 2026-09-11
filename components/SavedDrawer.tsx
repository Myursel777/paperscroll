"use client";

import type { SavedPaper } from "@/lib/useSaved";

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
  return (
    <>
      <div
        onClick={onClose}
        className={`fixed inset-0 z-40 bg-ink/30 transition-opacity ${
          open ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      />
      <aside
        className={`fixed right-0 top-0 z-50 flex h-full w-full max-w-md flex-col bg-paper shadow-2xl transition-transform ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <h2 className="font-display text-xl font-semibold">
            Saved · {saved.length}
          </h2>
          <button onClick={onClose} className="text-sm text-muted">
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
                        download
                        className="text-muted underline"
                      >
                        PDF
                      </a>
                    )}
                    <button
                      onClick={() => onRemove(p.id)}
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
