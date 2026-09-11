# Work log

Newest entry first. Each entry says what changed, why, and how it was checked,
so the git history can be read without re-deriving the reasoning.

## 2026-09-11: Phase 1 started

- **Deploy preparation.** `lib/site.ts` falls back to Vercel's own URL
  variable when `NEXT_PUBLIC_SITE_URL` is not set, so a fresh import on
  Vercel needs no configuration. The README roadmap now summarises the
  phases and links to `docs/ROADMAP.md` as the single detailed list. The
  page title uses a colon instead of a dash. Lighthouse could not be run
  from this machine; Core Web Vitals were measured instead (see above).

- **Fonts and performance.** Fraunces and Inter are loaded through
  `next/font/google`, which downloads them once at build time and serves
  them from this site with size-matched fallbacks. No request goes to Google
  at runtime, the render-blocking stylesheet is gone, and the ESLint font
  warning with it. Measured on the production build with Playwright in a
  Pixel 7 profile and a 4x CPU slowdown: first contentful paint 252 ms,
  largest contentful paint 684 ms, cumulative layout shift 0, total blocking
  time 33 ms, 272 kB transferred. Lighthouse itself could not launch Chrome
  from this shell; run it on the deployed URL (PageSpeed Insights is free)
  to confirm the score.

- **Dark mode.** The four design tokens (paper, ink, muted, line) are now CSS
  variables in `globals.css`, light by default and inverted under
  `prefers-color-scheme: dark`. Tailwind reads them as RGB channels
  (`tailwind.config.ts`), so every existing class and opacity modifier keeps
  working and no component had to change its classes. The few inline hex
  colours in the header chips became token classes. Text on accent-coloured
  buttons uses a fixed light colour in both themes (`text-onAccent`), and the
  browser theme colour follows the scheme. Field accents and layout are
  unchanged. There is no toggle yet; that belongs with account settings.
- **Drawer focus fix.** Focusing the saved panel had to wait one frame; in the
  frame it becomes visible the browser still computes it as hidden and
  refuses focus.

- **Accessibility pass.** One `h1` per page (the PaperScroll wordmark; card
  titles are `h2` and each card is labelled by its title), the feed sits in a
  `main`. The saved panel is a real dialog: role and label, Escape closes it,
  focus moves in on open and back to the opener on close, and it is
  `invisible` while closed so it leaves the tab order. Field chips and the
  For You button expose `aria-pressed`; the Saved button announces that it
  opens a dialog. The end-of-feed card is a polite live region, so loading
  and error messages are read out. Buttons whose visible text is short
  (PDF, Similar, Remove, Close) carry full labels. A visible focus ring is
  applied with `:focus-visible`, so mouse users never see it. Arrow keys are
  ignored while the drawer is open. Known gap: the small accent-coloured
  field stamp on each card is below the AA contrast ratio on the paper
  background; changing it would alter the design, so it is left as is.

- **First page loaded twice in WebKit.** Found by the end-to-end suite: on
  load, WebKit showed 24 cards, page one appended to itself, with no
  scrolling. The server-rendered HTML has no skeletons, so the end-of-feed
  card is in view at mount and the infinite-scroll observer fires straight
  away; it read `loading` from a stale closure and requested page one while
  the reset effect requested it too. Chromium happened to re-render first.
  Fix in `Feed.tsx`: the observer is only created once papers exist, reads
  `loading` through a ref, and appended pages are de-duplicated by id.
- **Test notes.** Playwright blocks service workers in the test context;
  otherwise, once the worker controls the page, requests bypass the fake API
  and WebKit was calling the real arXiv from the tests. Firefox cannot start
  on this machine (the Playwright build needs the Microsoft Visual C++
  runtime), so Firefox runs in CI on Ubuntu only.

- **Standard pages and metadata.** About, Privacy, and Terms (plain language,
  honest about what the site does and does not store), a 404 page, and an
  Offline page that the service worker shows when the feed shell is not
  cached. Shared frame in `components/PageShell.tsx`, body styles under
  `.text-page` in `globals.css`, small footer links at the end of the feed.
  `lib/site.ts` holds the site name, URL, owner, and repository link in one
  place. Added `app/error.tsx` (error boundary), `sitemap.ts`, `robots.ts`,
  `app/icon.png` and `app/apple-icon.png` (Next turns these into the favicon
  tags), and `opengraph-image.tsx` for the share preview. The share image is
  rendered in the edge runtime on request because the build-time renderer
  fails on Windows paths.
- **End-to-end tests and CI.** `tests/e2e/feed.spec.ts` drives the production
  build through the main journey: load one page and stay on the first card
  (the cascade regression test), switch field, save, For You, arrow keys,
  error card and Try again. The papers API is answered by a fake inside the
  browser, so the suite is deterministic and never calls arXiv. It runs in
  Chromium, Firefox, WebKit, and a mobile Chrome profile. ESLint uses the
  Next.js rules. `.github/workflows/ci.yml` runs lint, typecheck, unit tests,
  build, and the end-to-end suite on every push.

- Added this work log and `ROADMAP.md`.
- **arXiv client extracted** from the API route into `lib/arxivClient.ts`.
  Same four rules as before (one call at a time, per-query cache, shared
  in-flight calls, backoff after 429), but the client takes its fetch, clock,
  and sleep as parameters, so the rules are now covered by unit tests with a
  fake arXiv instead of the real one. The route is a thin wrapper again.
- **Per-visitor throttle** (`lib/rateLimit.ts`): a sliding window of 30
  requests per minute per client address. Above that the route answers 429
  with a Retry-After header and the feed shows its Try again card. A normal
  reader never gets near the limit; the point is that one runaway tab cannot
  spend the arXiv budget that everyone shares.
- **Unit tests** with Vitest in `tests/unit`: 18 tests over the arXiv client
  (cache hit, expiry, shared in-flight call, spacing, stale-on-429, backoff,
  Retry-After), the rate limiter, and the TF-IDF recommender (cold start,
  saved papers excluded, vocabulary match ranks higher, similar excludes the
  seed). Run with `npm test`.

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
