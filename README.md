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

Deploy free on Vercel: push to GitHub → "Import Project" → done. No env vars.

## What it does today

- Vertical **swipe/scroll feed** of papers (CSS scroll-snap — works with wheel,
  trackpad, and touch).
- **Fields of study** as sections (AI & ML, NLP, Vision, Neuroscience, …), each
  mapped to real arXiv categories and given its own accent colour.
- **For You** — a personalised feed ranked by how similar each paper is to the
  ones you've saved (see "Recommender" below). Works with zero setup.
- **Similar** — "more like this" on any card, ranked by content similarity.
- **Search** within a field.
- **Save for later** (stored in the browser via `localStorage`, no login).
- **Read** (arXiv abstract page) and **PDF** links on every card.
- **Infinite scroll** — new pages load automatically as you near the end.

## Recommender

Two layers, both included:

1. **In-app (default, no setup):** `lib/recommender.ts` — a dependency-free
   TF-IDF + cosine engine. It builds a profile vector from your saved papers and
   ranks candidates by similarity, blended with recency. Runs instantly in the
   browser. Powers "For You" and "Similar".
2. **Neural upgrade (`/recommender`):** a FastAPI service using a
   sentence-transformer (`all-MiniLM-L6-v2`) for meaning-based similarity. Same
   interface, better ranking. Wire it in via an env var and keep the TF-IDF
   version as the fallback. See `recommender/README.md`.

## How it's structured

```
app/
  api/papers/route.ts   Server proxy: queues and caches arXiv queries, returns clean JSON
  layout.tsx            Fonts + shell
  page.tsx              Renders <Feed/>
  globals.css           Scroll-snap feed + design tokens
components/
  Feed.tsx              Core: fetch, infinite scroll, search, state
  PaperCard.tsx         One full-screen paper
  CategoryBar.tsx       Field-of-study selector
  SavedDrawer.tsx       Saved-papers panel
lib/
  arxiv.ts              Types, FIELDS map, XML→Paper parser
  useSaved.ts           localStorage save hook
```

The key idea: **a "section" is just a different arXiv query.** To add a field,
add an entry to `FIELDS` in `lib/arxiv.ts` with its arXiv categories
(see the [taxonomy](https://arxiv.org/category_taxonomy)). That's it.

## Roadmap

### Phase 1 — MVP feed ✅ (this repo)
Live arXiv feed, fields, search, save, infinite scroll. Deployable.

### Phase 2 — Polish & PWA
- Loading skeletons, nicer empty/error states, keyboard arrows for next/prev.
- Make it an installable **PWA** (manifest + service worker) so phones can
  "Add to Home Screen" and it feels like an app. (ArxivTok does exactly this —
  worth copying its `manifest.json` / `sw.js` approach.)
- More sources behind the same parser: bioRxiv, medRxiv, PubMed.

### Phase 3 — Accounts & cloud sync
Move saves off `localStorage` so they sync across devices.
- Add **Supabase** (Postgres + auth) — free tier, ~an afternoon of work.
- `saved_papers(user_id, paper_id, paper_json, saved_at)`.
- Swap `useSaved` to read/write Supabase when logged in, fall back to
  localStorage when not. Add a "download for offline" action that caches PDFs.

### Phase 4 — Trending
Right now the feed is newest-first. Add a real trending signal:
- Track lightweight events (views, saves, "read paper" clicks) per paper.
- Rank with a time-decayed score, e.g. `score = saves / (hours_since + 2)^1.5`
  (a Hacker News–style gravity formula).
- A "Trending" tab alongside the field tabs.

### Phase 5 — Personalised recommender ✅ in progress
The portfolio centrepiece — and the part your AI degree makes you qualified for.
- ✅ In-app TF-IDF recommender (`lib/recommender.ts`) powering "For You" + "Similar".
- ✅ Neural embedding service (`recommender/`) — sentence-transformers, ready to deploy.
- ▢ Next: wire the frontend to call the neural service (env var + fallback),
  cache paper embeddings in **pgvector** (Supabase) for fast similarity search,
  and write up the approach — that write-up *is* the portfolio value.

### Phase 6 — Mobile app
Reuse the data layer in **React Native (Expo)**. `lib/arxiv.ts` and the fetch
logic port almost unchanged; you rebuild the UI with native components and a
`FlatList` with paging enabled for the swipe feed. One backend, two clients.

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
