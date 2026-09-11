// Placeholder shown while a page of papers is loading. It mirrors the layout
// of PaperCard so nothing shifts when the real cards arrive. The pulse is
// switched off by the reduced-motion rule in globals.css.
//
// It is deliberately not a snap target (snap-off): if it were, Chrome would
// re-snap to the end of the feed when it is removed (see globals.css).
export function SkeletonCard() {
  const block = "animate-pulse rounded bg-line";
  return (
    <article
      aria-hidden
      className="snap-card snap-off flex flex-col justify-between px-6 py-20 sm:px-12"
    >
      <header className="flex items-center justify-between">
        <div className={`h-6 w-28 rounded-full ${block}`} />
        <div className={`h-4 w-8 ${block}`} />
      </header>

      <div className="mx-auto w-full max-w-2xl">
        <div className={`h-9 w-11/12 ${block}`} />
        <div className={`mt-3 h-9 w-3/4 ${block}`} />
        <div className={`mt-5 h-4 w-1/2 ${block}`} />
        <div className="mt-6 space-y-2">
          <div className={`h-4 w-full ${block}`} />
          <div className={`h-4 w-full ${block}`} />
          <div className={`h-4 w-11/12 ${block}`} />
          <div className={`h-4 w-2/3 ${block}`} />
        </div>
      </div>

      <footer className="mx-auto flex w-full max-w-2xl items-center gap-3">
        <div className={`h-11 flex-1 rounded-full ${block}`} />
        <div className={`h-11 w-16 rounded-full ${block}`} />
        <div className={`h-11 w-20 rounded-full ${block}`} />
      </footer>
    </article>
  );
}
