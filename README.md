# PaperScroll

A scrollable, swipe-through feed of the latest academic papers, built to prove
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
| `npm run build:test` | Production build into `.next-test` with the fake Supabase address baked in, for the tests |
| `npm run test:e2e` | End-to-end tests (Playwright) in `tests/e2e`; run `npm run build:test` first. Starts the fake Supabase and the app |
| `npm run fake-supabase` | In-memory stand-in for Supabase on :54321, for developing the account features offline |
| `npx tsx scripts/tag-report.ts` | Tagger quality report over the saved sample in `tests/fixtures`; `fetch` pulls a new sample, `eval` scores labelled papers |
| `npx tsx scripts/foryou-eval.ts` | Precision at 10 for each ranking engine over the same sample; `--verbose` prints a line per simulated reader |
| `npx tsx scripts/nightly/fetch.ts papers.json` | Step 1 of the nightly job: fetch recent papers from arXiv and tag them |
| `python recommender/embed.py papers.json papers.json` | Step 2: add a sentence embedding to each paper |
| `npx tsx scripts/nightly/upload.ts papers.json` | Step 3: write them to Supabase (needs `SUPABASE_URL` and `SUPABASE_SERVICE_KEY`) |

The end-to-end tests answer `/api/papers` from a fake inside the browser and
talk to the fake Supabase for accounts, so they never call arXiv or any
external service. If a dev server is already running on port 3000, run the
tests on another port: `PORT=3001 npm run test:e2e` (in PowerShell:
`$env:PORT = "3001"` first). Before the first run, download the browser engines with
`npx playwright install chromium firefox webkit`. GitHub Actions runs all of
the above on every push (`.github/workflows/ci.yml`).

Progress and reasoning live in [docs/ROADMAP.md](docs/ROADMAP.md) and
[docs/WORKLOG.md](docs/WORKLOG.md).

## What it does today

- Vertical **swipe/scroll feed** of papers (CSS scroll-snap, which works with wheel,
  trackpad, and touch).
- **Fields of study** as sections (AI & ML, NLP, Vision, Neuroscience, …), each
  mapped to real arXiv categories and given its own accent colour.
- **For You**: a personalised feed that learns from what you actually do:
  which cards you linger on, expand, open, save, or hide. It blends content
  similarity, topic affinity, freshness, popularity, and novelty, spreads the
  topics out, and keeps every sixth slot for something outside your usual
  reading. Each card says in one line why it is there, and "Not interested"
  takes a paper out. Works with zero setup and works logged out, where the
  history stays in your browser.
- **Similar**: "more like this" on any card, ranked by content similarity.
- **Topics**: every paper carries up to three topic tags (for example
  "Diffusion models" or "Medical imaging") from a fixed taxonomy of 56 topics
  in `lib/topics.ts`. Tags are computed on the server: by the embedding
  tagger in the Python service when it is configured, by the rule-based
  tagger in `lib/tagger.ts` otherwise. Tap a tag, or a topic chip under the
  field chips, to browse that topic.
- **Search** within a field.
- **Save for later** (stored in the browser via `localStorage`, no login needed).
- **Accounts** (optional, Supabase free tier): sign up with email and password
  and your saved papers follow you across devices, with a library page
  (search, sort, collections), onboarding that picks your default field and
  interests, and account pages for profile, settings, security, and your data
  (export or delete). Logged-out visitors keep everything with saves in the
  browser; local saves merge into the account on first login. See
  `supabase/README.md` for the ten-minute setup, or run without it.
- **Read** (arXiv abstract page) and **PDF** links on every card.
- **Infinite scroll**: new pages load automatically as you near the end.
- **Installable**: a web app manifest and a small service worker let you add
  PaperScroll to a phone's home screen. The app shell is cached so it opens
  instantly; paper data always comes from the network.
- **Keyboard**: the up and down arrow keys move one paper at a time. Smooth
  scrolling and the loading animation are switched off when the system asks
  for reduced motion.

## For You

The feed on the "For You" tab is a small recommender with every part visible
and explainable. It has three jobs: learn what a reader likes, find candidate
papers, and put them in an order.

**1. Learning (`lib/foryou/`).** Each thing a reader does with a paper becomes
one event: `impression`, `dwell` (with how long the card was on screen),
`expand`, `read`, `save`, `unsave`, `not_interested`, `tag_tap`. The event
carries the paper's topic tags, so a profile can be built from events alone.
Every event adds its weight to each of those topics, and weights fade with a
**30-day half-life**, so this week counts twice as much as a month ago. Topics
picked at onboarding act as a prior that does not fade, which is what makes a
brand new account useful before anything has been read. Sliders on
`/account/foryou` multiply a topic up or down by hand.

Events live in `localStorage` and, with an account, in the `events` table, so
the feed learns logged out and follows you between devices when signed in.

**2. Candidates.** Two sources, picked at load time:

- **The paper store.** A nightly GitHub Actions job fetches recent papers from
  arXiv, tags them, embeds them with `all-MiniLM-L6-v2`, and writes them to
  Supabase with pgvector. arXiv limits requests by address and an Actions
  runner shares its address with every other job on that machine, so the job
  waits out a refusal a few times and then falls back to arXiv's daily RSS
  feeds, which are served by a different host. A night where both refuse is a
  warning, not a failure: the store keeps what it has. The browser then asks the database for the nearest
  papers to its content profile (the weighted average of the embeddings of
  papers it responded to) and for fresh papers on its top topics. arXiv is not
  called at all on this path: once a night for everybody, instead of once per
  reader per tap.
- **Live.** With no store configured, the pool is the newest papers from the
  reader's fields through the usual API route, with similarity from the TF-IDF
  engine (or the neural service when it is running).

**3. Ranking (`lib/foryou/rank.ts`).** One score per paper:

```
score = (0.45 x similarity + 0.30 x topic affinity + 0.15 x recency + 0.10 x popularity) x novelty
```

Then the list is built one slot at a time: a candidate is penalised for every
paper already picked that shares its first topic, so one theme cannot fill the
screen, and every sixth slot goes to a good paper from outside the reader's
top topics, labelled "Something different". Papers marked not interested never
appear; papers already seen are damped by the novelty term.

**Does it work?** `npx tsx scripts/foryou-eval.ts` invents a reader per topic
from the 150-paper sample, has them save three papers of that topic, and
measures how much of the top ten carries it:

| Engine | Precision at 10 |
|---|---|
| recency (baseline) | 0.02 |
| TF-IDF similarity | 0.28 |
| topic affinity | 0.53 |
| the blend | 0.56 |

Read those with the caveat the script prints: relevance is the topic tag
itself, so the topic engine is being marked against its own definition. The
useful readings are that every engine beats newest-first by a wide margin, and
that the blend adds similarity, freshness, and topic spread without losing
precision.

## Recommender

Two layers, both included:

1. **In-app (default, no setup):** `lib/recommender.ts`, a dependency-free
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

   The same service also tags papers by meaning (`POST /tag`): the API route
   sends each new paper's title and abstract together with the topic
   descriptions, and keeps the topics whose embeddings are closest. Set
   `RECOMMENDER_URL` for the server side (the public variable works too);
   without it, or when the service is down, `lib/tagger.ts` tags by rules.

## How it's structured

```
app/
  api/papers/route.ts   API route: parses the request, applies the per-visitor throttle, returns JSON
  auth/callback/        Where the links in Supabase's emails land (code exchange)
  login/ signup/ forgot-password/ reset-password/ verify-email/   Sign-in pages
  account/              Profile, settings, security, your data (signed in)
  onboarding/           Default field and interests after the first login
  saved/                The library: search, sort, collections (signed in)
  layout.tsx            HTML shell, fonts, metadata (icons, manifest, share preview)
  page.tsx              Renders <Feed/>
  globals.css           Scroll-snap feed, design tokens, text-page styles
  error.tsx             Error boundary card ("Something broke", Try again)
  not-found.tsx         404 page
  about/ privacy/ terms/ offline/   Text pages
  manifest.ts sitemap.ts robots.ts opengraph-image.tsx   Generated metadata files
components/
  auth/                 Form kit and the sign-in forms
  account/              Account section forms, onboarding, interest picker
  library/Library.tsx   The library page
  Feed.tsx              Core: fetch, infinite scroll, search, modes, keyboard, state
  PaperCard.tsx         One full-screen paper
  SkeletonCard.tsx      Placeholder while a page loads
  CategoryBar.tsx       Field-of-study selector
  SavedDrawer.tsx       Saved-papers panel
  PageShell.tsx         Frame for the text pages
  RegisterSW.tsx        Registers the service worker in production
lib/
  arxiv.ts              Types, FIELDS map, XML to Paper parser
  arxivRss.ts           Daily RSS feeds, the nightly job's fallback source
  topics.ts             Topic taxonomy: 56 topics with patterns, categories, and searches
  tagger.ts             Rule-based tagger: up to three topics per paper, explainable
  neuralTagger.ts       Client for the embedding tagger in the Python service, with fallback
  arxivClient.ts        The only code that talks to arXiv: queue, cache, backoff
  rateLimit.ts          Sliding-window limiter used by the API route
  recommender.ts        Dependency-free TF-IDF + cosine recommender
  neuralRecommender.ts  Client for the optional neural service, with fallback
  useSaved.ts           Saved papers: browser copy plus account sync with a retry queue
  saved/                Merge logic, Supabase calls, collections
  foryou/               For You v2: events, interest profile, ranking blend, candidates
  supabase/             Browser and server clients, on/off switch
  auth/                 useUser hook, friendly error messages
  profile.ts            The profile row (default field, interests)
  site.ts               Site name, URL, owner, repository link
middleware.ts           Refreshes the session and guards account pages
supabase/
  migrations/           The database as one SQL file (tables, row-level security)
  email-templates/      Branded confirmation and reset emails
  README.md             Setup in ten minutes
public/
  sw.js                 Service worker: caches the app shell, never the API
  icon-192.png, icon-512.png
tests/
  unit/                 Vitest: arXiv client rules, rate limiter, recommender, taxonomy, tagger
  e2e/                  Playwright: the main user journey with a mocked API
  fixtures/             150-paper sample used by the tagger report
scripts/
  tag-report.ts         Tagger quality report, sample fetch, precision and recall
  foryou-eval.ts        Precision at 10 per ranking engine
  nightly/              The nightly job: fetch and tag, then upload to Supabase
  fake-supabase.ts      In-memory stand-in for Supabase, for development and tests
  with-test-env.mjs     Runs a command with the test build folder and fake Supabase address
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
5. **For You v2**: interest profile from reading behaviour, nightly tagging and embedding job, evaluation harness. Done.
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
  that query if it has one, then the nightly paper store in the database if
  there is one, and only if both are empty does it return a short message. It
  stops calling arXiv for a minute either way. It never retries in a loop; that only makes the
  throttle last longer. If you get throttled during development, wait a few
  minutes before trying again.
- arXiv content is the authors'; this app only links to it, never rehosts it.

## License
MIT. Do what you like.
