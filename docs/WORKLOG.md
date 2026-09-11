# Work log

Newest entry first. Each entry says what changed, why, and how it was checked,
so the git history can be read without re-deriving the reasoning.

## 2026-09-11: Phase 1 started

- Added this work log and `ROADMAP.md`.

## 2026-09-11: MVP hardening (Phase 0 finished)

Commits `e4d1df6` to `a82bd1d`.

- **Root cause of the arXiv bursts.** On every fresh load the feed jumped to
  its last card and infinite scroll fetched page after page with nobody
  touching it. Chrome re-snaps a scroll-snap container to the element that
  was snapped before a layout change; while loading, the only card is the
  end-of-feed status card, so once the papers were inserted above it the
  feed landed at the bottom. Fix: placeholder and status cards are not snap
  targets until real papers exist (`snap-off` in `globals.css`).
- **arXiv proxy** (`app/api/papers/route.ts`): one request at a time with
  three seconds between calls, a ten-minute per-query cache, identical
  in-flight requests share one call, and a 429 serves the stale copy or a
  short message plus a one-minute backoff. The old retry loop was removed
  because retrying a 429 only extends the throttle.
- **Polish**: skeleton cards, arrow keys move one card, smooth scrolling off
  under reduced motion, Try again button, network failures reported instead
  of an empty feed.
- **Neural recommender**: `lib/neuralRecommender.ts` posts to the FastAPI
  service when `NEXT_PUBLIC_RECOMMENDER_URL` is set and returns null on any
  failure so the TF-IDF engine takes over. Checked against a mock service
  that implements the same contract, then with the mock stopped.
- **PWA**: `app/manifest.ts`, `public/sw.js`, icons. Checked in a production
  build: worker active, shell cached, `/api/papers` never cached.
