# PaperScroll

A scrollable, swipe-through feed of the latest academic papers — built to prove
that reading research can be as easy as opening an app. Papers are pulled live
from the [arXiv API](https://info.arxiv.org/help/api/index.html); no database,
no paper hosting, no scraping.

> Phase 1 (this repo) is a complete, deployable MVP. The roadmap below takes it
> to a personalised recommender and a mobile app.

## Quick start

```bash
npm install
npm run dev
# open http://localhost:3000
```

Deploy free on Vercel: push to GitHub, import the repository, done. No env vars
are required; set `NEXT_PUBLIC_SITE_URL` to your domain once you have one so
the sitemap and share preview use it.

## Development

| Command | What it does |
|---|---|
| `npm run dev` | Dev server with hot reload on http://localhost:3000 |
| `npm run build` / `npm start` | Production build and server |
| `npm run typecheck` | TypeScript, no emit |
| `npm run lint` | ESLint with the Next.js rules |
| `npm test` | Unit tests (Vitest) in `tests/unit` |
| `npm run test:e2e` | End-to-end tests (Playwright) in `tests/e2e`; run `npm run build` first |
| `npx tsx scripts/tag-report.ts` | Tagger quality report over the saved sample in `tests/fixtures`; `fetch` pulls a new sample, `eval` scores labelled papers |

The end-to-end tests answer `/api/papers` from a fake inside the browser, so
they never call arXiv. Before the first run, download the browser engines with
`npx playwright install chromium firefox webkit`. GitHub Actions runs all of
the above on every push (`.github/workflows/ci.yml`).

Progress and reasoning live in [docs/ROADMAP.md](docs/ROADMAP.md) and
[docs/WORKLOG.md](docs/WORKLOG.md).

## What it does today

- Vertical **swipe/scroll feed** of papers (CSS scroll-snap — works with wheel,
  trackpad, and touch).
- **Fields of study** as sections (AI & ML, NLP, Vision, Neuroscience, …), each
  mapped to real arXiv categories and given its own accent colour.
- **For You** — a personalised feed ranked by how similar each paper is to the
  ones you've saved (see "Recommender" below). Works with zero setup.
- **Similar** — "more like this" on any card, ranked by content similarity.
- **Topics**: every paper carries up to three topic tags (for example
  "Diffusion models" or "Medical imaging") from a fixed taxonomy of 56 topics
  in `lib/topics.ts`. Tags are computed on the server by a rule-based tagger.
  Tap a tag, or a topic chip under the field chips, to browse that topic.
- **Search** within a field.
- **Save for later** (stored in the browser via `localStorage`, no login).
- **Read** (arXiv abstract page) and **PDF** links on every card.
- **Infinite scroll** — new pages load automatically as you near the end.
- **Installable**: a web app manifest and a small service worker let you add
  PaperScroll to a phone's home screen. The app shell is cached so it opens
  instantly; paper data always comes from the network.
- **Keyboard**: the up and down arrow keys move one paper at a time. Smooth
  scrolling and the loading animation are switched off when the system asks
  for reduced motion.

## Recommender

Two layers, both included:

1. **In-app (default, no setup):** `lib/recommender.ts` — a dependency-free
   TF-IDF + cosine engine. It builds a profile vector from your saved papers and
   ranks candidates by similarity, blended with recency. Runs instantly in the
   browser. Powers "For You" and "Similar".
2. **Neural upgrade (`/recommender`):** a FastAPI service using a
   sentence-transformer (`all-MiniLM-L6-v2`) for meaning-based similarity. Same
   interface, better ranking. To use it, run the service (see
   `recommender/README.md`) and point the app at it:

   ```
   # .env.local
   NEXT_PUBLIC_RECOMMENDER_URL=http://localhost:8000
   ```

   `lib/neuralRecommender.ts` calls the service for "For You" and "Similar".
   If the variable is unset, or the service does not answer within a few
   seconds, the app silently uses the TF-IDF engine instead, so nothing breaks
   when the service is down.

## How it's structured

```
app/
  api/papers/route.ts   API route: parses the request, applies the per-visitor throttle, returns JSON
  layout.tsx            HTML shell, fonts, metadata (icons, manifest, share preview)
  page.tsx              Renders <Feed/>
  globals.css           Scroll-snap feed, design tokens, text-page styles
  error.tsx             Error boundary card ("Something broke", Try again)
  not-found.tsx         404 page
  about/ privacy/ terms/ offline/   Text pages
  manifest.ts sitemap.ts robots.ts opengraph-image.tsx   Generated metadata files
components/
  Feed.tsx              Core: fetch, infinite scroll, search, modes, keyboard, state
  PaperCard.tsx         One full-screen paper
  SkeletonCard.tsx      Placeholder while a page loads
  CategoryBar.tsx       Field-of-study selector
  SavedDrawer.tsx       Saved-papers panel
  PageShell.tsx         Frame for the text pages
  RegisterSW.tsx        Registers the service worker in production
lib/
  arxiv.ts              Types, FIELDS map, XML to Paper parser
  topics.ts             Topic taxonomy: 56 topics with patterns, categories, and searches
  tagger.ts             Rule-based tagger: up to three topics per paper, explainable
  arxivClient.ts        The only code that talks to arXiv: queue, cache, backoff
  rateLimit.ts          Sliding-window limiter used by the API route
  recommender.ts        Dependency-free TF-IDF + cosine recommender
  neuralRecommender.ts  Client for the optional neural service, with fallback
  useSaved.ts           localStorage save hook
  site.ts               Site name, URL, owner, repository link
public/
  sw.js                 Service worker: caches the app shell, never the API
  icon-192.png, icon-512.png
tests/
  unit/                 Vitest: arXiv client rules, rate limiter, recommender, taxonomy, tagger
  e2e/                  Playwright: the main user journey with a mocked API
  fixtures/             150-paper sample used by the tagger report
scripts/
  tag-report.ts         Tagger quality report, sample fetch, precision and recall
docs/
  ROADMAP.md            Phase-by-phase checklist
  WORKLOG.md            What changed, why, and how it was checked
```

The key idea: **a "section" is just a different arXiv query.** To add a field,
add an entry to `FIELDS` in `lib/arxiv.ts` with its arXiv categories
(see the [taxonomy](https://arxiv.org/category_taxonomy)). That's it.

## Roadmap

The detailed, ticked checklist lives in [docs/ROADMAP.md](docs/ROADMAP.md).
In short:

1. **MVP feed**: live arXiv feed, fields, search, save, infinite scroll, TF-IDF and neural recommenders, PWA. Done.
2. **Production-ready website**: tests, CI, standard pages, accessibility, dark mode, self-hosted fonts, deploy. Done except the deploy.
3. **Topic tagging**: a fixed taxonomy, rule-based then embedding-based tags, tag filters.
4. **Accounts** on Supabase: sign up, log in, account pages, synced library.
5. **For You v2**: interest profile from reading behaviour, nightly tagging and embedding job, evaluation harness.
6. **Polish**: digest emails, sharing, more sources, monitoring, write-up.
7. **Mobile app** with Expo, sharing the data layer with the website.

## Notes & etiquette
- arXiv asks API clients to identify themselves and to make at most one request
  every three seconds. `app/api/papers/route.ts` is the only place that talks
  to arXiv, and it is deliberately gentle: it sends a `User-Agent`, pushes every
  call through a single queue with three seconds between calls, caches each
  query in memory for ten minutes, and shares one call between identical
  requests that arrive together. Keep all of that.
- If arXiv answers 429 (too many requests), the route serves the cached copy of
  that query if it has one, and otherwise returns a short message and stops
  calling arXiv for a minute. It never retries in a loop; that only makes the
  throttle last longer. If you get throttled during development, wait a few
  minutes before trying again.
- arXiv content is the authors'; this app only links to it, never rehosts it.

## License
MIT — do what you like.
