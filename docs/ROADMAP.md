# PaperScroll roadmap

The plan from the current MVP to a polished website and then a mobile app.
Boxes are ticked as work lands; each tick has a matching entry in
[WORKLOG.md](WORKLOG.md) that says what changed and how it was checked.

Everything here is free to run except the app store fees in Phase 6.

## Phase 0: MVP feed (done)

- [x] Live arXiv feed with fields, search, save for later, infinite scroll
- [x] arXiv proxy with a request queue, per-query cache, and 429 backoff
- [x] Scroll-snap cascade fixed, loading skeletons, arrow keys, retry action
- [x] TF-IDF recommender for "For You" and "Similar"
- [x] Neural recommender service wired in with a seamless fallback
- [x] Installable PWA (manifest, service worker, icons)

## Phase 1: production-ready website

- [x] Tracking docs: this roadmap and a work log
- [x] Per-visitor throttle on `/api/papers` so one visitor cannot spend the shared arXiv budget
- [x] Unit tests (Vitest) for the recommender and the arXiv client's cache rules
- [x] End-to-end test (Playwright) with a mocked API: open, switch field, save, For You
- [x] ESLint and a GitHub Actions workflow that runs lint, typecheck, tests, and build on every push
- [x] Error boundary with a "something broke" card
- [x] Standard pages: About, Privacy, Terms, 404, Offline
- [x] Metadata: Open Graph image, favicon set, sitemap, robots
- [x] Accessibility: focus order, ARIA labels, Escape closes the drawer, visible focus rings, contrast
- [x] Dark mode following the system setting (same layout and accents)
- [x] Fonts self-hosted through Next; Core Web Vitals measured green on a throttled mobile profile (Lighthouse score to confirm on the deployed URL)
- [x] Cross-browser pass: the end-to-end test runs in Chromium, Firefox, and WebKit (Firefox in CI)
- [ ] Deploy on Vercel (free Hobby plan) from a GitHub repository

## Phase 2: topic tagging

Goal: every paper carries up to three tags from one fixed taxonomy, computed
on the server, never in the browser while scrolling.

- [x] Taxonomy of about fifty topics in `lib/topics.ts`: id, label, parent field, description, hinting arXiv categories, keyword patterns, and the arXiv search each topic maps to
- [x] Tagger v1 (rules): keyword patterns weighted by title and abstract, arXiv categories as a tie-breaker, max three tags. Quality check against a sample is a separate item below
- [ ] Tagger v2 (embeddings): cosine between abstract and topic descriptions, threshold, max three tags
- [x] Tags returned with every paper by the API route (a `paper_tags` table comes with Phase 3)
- [ ] Tag chips on cards, tap to filter, topics row under the field chips
- [ ] Evaluation: hand-label 200 papers, precision and recall per topic, tune threshold

## Phase 3: accounts (Supabase free tier)

Tables: profiles, saved_papers, collections, events, user_topics, papers,
paper_tags, paper_embeddings (pgvector). Row-level security on every table.

- [ ] Auth: email and password, magic link, Google sign-in
- [ ] Pages: sign up, log in, forgot password, reset password, verify email, onboarding (pick three topics)
- [ ] Account pages: profile, settings, security, data (export and delete)
- [ ] Library page with collections, search, sort; localStorage saves merge on first login
- [ ] Branded email templates
- [ ] Route protection in middleware; logged-out visitors keep the read-only experience
- [ ] Weekly keep-alive ping so the free project does not pause

## Phase 4: For You v2

- [ ] Event tracking: impression, dwell, expand, read, save, unsave, not interested, tag tap
- [ ] Interest profile: one weight per topic per user with a 30-day half-life
- [ ] Content profile in pgvector; candidates from nearest-neighbour search
- [ ] Ranking blend: similarity, topic affinity, recency, popularity, novelty and diversity, exploration
- [ ] Nightly job (GitHub Actions cron): fetch, tag, embed, store; arXiv hit once a night
- [ ] Evaluation harness: precision at 10 for TF-IDF, neural, and the blend; numbers in the README
- [ ] User controls: "why you are seeing this", not interested, topic sliders

## Phase 5: polish

- [ ] Weekly email digest (Resend free tier)
- [ ] Share a paper or collection by link
- [ ] Reading states: to read, reading, done
- [ ] More sources behind the same parser: bioRxiv, medRxiv, PubMed
- [ ] Monitoring: uptime, error rate, arXiv 429 counter
- [ ] Docs: architecture page, recommender write-up with evaluation numbers, demo video

## Phase 6: mobile app (Expo)

- [ ] Monorepo: `apps/web`, `apps/mobile`, `packages/core`
- [ ] Screen parity with the website, including all auth and account screens
- [ ] Native extras: share sheet, push notifications, offline cache of saved abstracts
- [ ] Beta via TestFlight and Play internal testing
- [ ] Store release (Apple Developer 99 USD per year, Google Play 25 USD once)
- [ ] Keep the PWA as the free install path
