"use client";

import Link from "next/link";

// Error boundary for the whole app (Next.js convention: app/error.tsx).
// If anything inside a page throws while rendering, this card is shown
// instead of a blank screen. `reset` re-renders the page that failed.
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-6 text-center">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted">Something broke</p>
      <h1 className="mt-3 max-w-md font-display text-3xl font-semibold leading-tight">
        The page hit an error it could not recover from.
      </h1>
      <p className="mt-4 max-w-sm text-sm text-muted">
        Nothing you did caused this. Trying again usually fixes it. If it keeps happening, the
        reference below helps track it down.
      </p>
      <div className="mt-8 flex gap-3">
        <button
          onClick={reset}
          className="rounded-full bg-ink px-5 py-2.5 text-sm font-semibold text-paper transition active:scale-95"
        >
          Try again
        </button>
        <Link
          href="/"
          className="rounded-full border border-line px-5 py-2.5 text-sm font-semibold transition active:scale-95"
        >
          Back to the feed
        </Link>
      </div>
      {error.digest && <p className="mt-8 font-mono text-xs text-muted">Reference {error.digest}</p>}
    </main>
  );
}
