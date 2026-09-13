# Work log

Newest entry first. Each entry says what changed, why, and how it was checked,
so the git history can be read without re-deriving the reasoning.

## 2026-09-13: Onboarding could be lost for ever

Found by signing up on the deployed site as a stranger would, in a private
window. The confirmation email arrived, the link pointed at the live site as
it should, and then the page said the link was invalid.

- **Why the link failed.** Sign-up uses PKCE: the browser that starts it keeps
  a secret that only it can use to finish. Opening the email in a different
  browser, or in the ordinary window when sign-up happened in a private one,
  means that secret is missing and the exchange cannot complete. Nothing is
  broken and the address is confirmed either way, because Supabase marks it
  before redirecting. The old message said the link was invalid or expired,
  which was misleading: it was neither. It now explains what actually
  happened and says the address is confirmed, so logging in is enough.

- **The real bug underneath.** Onboarding was reachable through exactly one
  route, the `next` parameter on the emailed link. Anyone whose exchange
  failed, or who simply signed in later on a second device, never saw it and
  never could: nothing else in the app ever sent them there, so their default
  field and interests stayed empty and For You started colder than it needed
  to. Logging in now checks the profile once, and a reader who has never been
  onboarded goes there instead of to the feed, unless they were already on
  their way somewhere specific. Skipping is now recorded rather than being a
  plain link home, so the choice sticks instead of being asked again at every
  login.

- **How it was checked.** A new end-to-end test signs up in one browser,
  opens the confirmation link in a second, and proves the first browser is
  still offered onboarding when it logs in, and that skipping is remembered.
  One older test had to change with it: an account that resets its password
  but has never been onboarded now lands on onboarding, which is the point.

## 2026-09-13: The feed no longer depends on arXiv answering

- **What the deployed site actually did.** The live feed showed "arXiv is rate
  limiting us right now" instead of papers. Measuring it changed the diagnosis
  twice. arXiv does not block Vercel: one request succeeded, then six in a row
  failed. What happens is that arXiv refuses intermittently, and the client
  then stops calling it for a minute, which is the correct manners towards a
  service asking for quiet. On one long-lived server that minute costs almost
  nothing, because the ten-minute cache carries the load. On a serverless host
  it costs everything, because each instance starts cold, so a visitor
  arriving during the pause has no cache to fall back on and sees an error.

- **The fix uses what was already there.** The nightly job has been filling a
  table of recent papers with their topics since Phase 4, and until now only
  the For You feed read it. The API route now tries arXiv, then this
  instance's expired cache, then the store, and only shows an error when all
  three have nothing. `lib/papersStore.ts` reads it over plain PostgREST with
  the two public values, with a three-second timeout, and never throws:
  a fallback that fails must not replace the error it was called to avoid.
  The reply says which source answered, so the card can say "these are from
  our own nightly copy, they may be a day old" rather than something vague.
  Twelve unit tests cover the query, including stripping the characters
  PostgREST reads as syntax out of a reader's search. Verified for real:
  with this machine's address still being refused by arXiv, every field and
  both searches returned tagged papers from the store.

- **A second bug, found by accident.** The local `.env.local` had the Vercel
  address where the Supabase project address belongs, so every local database
  call returned 404 and the fallback appeared broken when it was not. It was
  presumably pasted there during the deploy. Production was never affected,
  since Vercel holds its own copy, which was confirmed by finding the right
  host in the JavaScript the site ships.

## 2026-09-13: The first deploy, and the bug it found

- **A bad address broke the build, and said nothing useful.** The first Vercel
  deploy failed with "Failed to collect page data for /_not-found", a page
  that has nothing to do with the cause. The root layout hands `siteUrl` to
  Next as `metadataBase`, which parses it with `new URL`, and every page
  renders inside that layout, so an address Next cannot parse takes down the
  build and gets blamed on whichever page Next reached first. Two ways to get
  there, both reproduced locally and both easy to do by hand: setting
  `NEXT_PUBLIC_SITE_URL` to an address with no `https://` in front, or leaving
  the variable in place with nothing in it. The second is nastier than it
  looks, because `??` only falls back on a missing value, never on an empty
  one, so an empty string sailed through as if it were an address.
  `normaliseSiteUrl` now fills in a missing scheme, treats blank as unset,
  checks the result really parses and really has a host, and falls through to
  Vercel's own per-deployment address and then to localhost. Seven unit tests
  cover the shapes that reached a real deploy, and the build was rerun under
  each failing condition to confirm it now compiles.

## 2026-09-12: Phase 4 (For You v2)

The recommendation feed stopped being "papers that share words with the ones
you saved" and became something that learns from reading. Four pieces, each
written so it can be read on its own: what the reader does, what that says
about them, where candidate papers come from, and how they are ordered.

- **Events** (`lib/foryou/events.ts`). Every action on a paper becomes one
  small record: the card came into view, it was on screen for so many
  milliseconds, the abstract was expanded, the paper was opened, saved,
  unsaved, hidden, or a topic chip was tapped. Each event carries the paper's
  topics, so the profile can be rebuilt from events alone without looking any
  paper up again. Storage follows the pattern saved papers already use: the
  browser always keeps its own copy in `localStorage`, so the feed learns
  logged out and offline, and a signed-in reader also gets the account copy,
  queued and flushed in batches (events arrive in bursts as you scroll, so a
  short delay turns a scroll into one request). Sixty days and 800 events are
  kept, whichever comes first.

- **Interest profile** (`lib/foryou/profile.ts`). One weight per topic. A save
  counts 3, a read 2, tag tap 1.5, expand 1, a long look up to 1 (nothing
  under two seconds, full weight at thirty), unsave -2, not interested -3.
  Weights fade with a **30-day half-life**, so a phase of reading about one
  subject does not follow you for ever. Topics picked at onboarding are a
  prior that does not fade, which is what makes a new account useful before
  anything has been read; the sliders multiply a topic and add or remove one
  prior's worth, so turning up a topic with no history still does something.
  All pure functions, unit tested, and the page at `/account/foryou` shows
  exactly these numbers as bars.

- **Candidates** (`lib/foryou/candidates.ts`, `supabase/migrations/0002_for_you.sql`).
  A new `papers` table holds recent papers with their topics, a 384-wide
  pgvector embedding, and a popularity score; it is public to read and written
  only by the nightly job. The browser builds a content profile (the weighted
  average of the embeddings of papers it responded to) and asks the database
  for the nearest papers with `nearest_papers`, plus fresh papers on its top
  topics. On that path **arXiv is not called at all**: once a night for
  everybody instead of once per reader per tap. With no store, the old live
  pool and the TF-IDF engine are used, so nothing is required for the feature
  to work.

- **Ranking** (`lib/foryou/rank.ts`). One score per paper, then a list built a
  slot at a time:
  `(0.45 similarity + 0.30 topic + 0.15 recency + 0.10 popularity) x novelty`,
  a penalty for each already-picked paper sharing the same first topic so one
  theme cannot fill the screen, and every sixth slot reserved for a good paper
  from outside the reader's top topics. The part that contributed most becomes
  the line on the card: "Because you read about Diffusion models", "Close to
  papers you responded to", "Something different". Hidden papers never appear
  and seen ones are damped.

- **The nightly job** (`.github/workflows/nightly.yml`). Three steps: fetch and
  tag from arXiv (`scripts/nightly/fetch.ts`, the same polite client the app
  uses), embed with `all-MiniLM-L6-v2` on the CPU build of torch
  (`recommender/embed.py`), upload and refresh popularity
  (`scripts/nightly/upload.ts`). It needs the project URL and the service-role
  key as repository secrets, and that key lives there and nowhere else: not in
  `.env.local`, not in a public variable, never in the browser. Without the
  secrets the job is a harmless dry run.

- **Does it work?** `scripts/foryou-eval.ts` invents a reader per topic out of
  the 150-paper sample, has them save three papers of that topic, and measures
  how much of the top ten carries it. Mean precision at 10: recency 0.02,
  TF-IDF 0.28, topic affinity 0.53, the blend 0.56. The honest caveat, which
  the script prints too: relevance is the topic tag itself, so the topic
  engine is judged against its own definition. What the numbers do show is
  that every engine beats newest-first by a wide margin and that the blend
  buys diversity, freshness, and exploration without costing precision.

- **Two bugs the tests caught.** The For You page passed the profile to the
  reading hook but not the function that saves it, so a slider was written to
  the browser and then ignored in favour of the account row: it moved and
  sprang back. And the first draft of the "not interested" test looked for the
  hidden card in the field feed, where it need not be, because the For You
  pool is drawn from whichever fields the reader's topics belong to. Both are
  now covered: five end-to-end tests for the reasons on cards, the ordering,
  hide and undo, the account round trip with the sliders, and a store-backed
  feed that proves arXiv is not called when the store exists.

- **arXiv throttles cloud addresses.** The first real run of the nightly job
  was refused with HTTP 429 on its very first request, twenty seconds in. The
  cause is not our pacing, which arXiv's own guidance sets and the client has
  always followed: the search API limits by address and a GitHub Actions
  runner shares its address with every other job on that machine, so the night
  can start already in penalty. Three changes, none of them touching how the
  app behaves for a reader. The job now waits out a refusal up to four times,
  honouring the Retry-After arXiv sends. If it is still refused, or was cut
  short partway, it tops up from arXiv's daily RSS feeds at `rss.arxiv.org`, a
  different host that is not throttled the same way; those carry only the
  latest announcement and nothing at weekends, which is a thinner night but
  better than none. And a night where everything refuses is now a warning
  rather than a red failure, because the store keeps yesterday's papers and
  the site falls back to asking arXiv live, so there is nothing for anyone to
  fix. The upload step refuses to prune against an empty fetch, which would
  otherwise have emptied the store on exactly such a night. The feed parser
  (`lib/arxivRss.ts`) has thirteen unit tests and was checked against a live
  feed of 273 papers: every one parsed with a title, abstract, authors, and
  categories, and 215 of them tagged, the tagger's usual rate.

- **One paper, two ids.** The first successful run stored 469 papers, and the
  nearest-neighbour check on the real database immediately showed the same
  paper twice. The two sources disagreed about its name: the search API calls
  it `http://arxiv.org/abs/2609.11878v1` and a feed item's link calls it
  `https://arxiv.org/abs/2609.11878`, without the version and over https. That
  matters because the abstract URL is the key the whole app uses for a paper,
  in saved papers, in reading events, and in the store, so a reader could have
  saved the same paper twice. The feed does carry the versioned identifier, in
  the guid and again at the head of the description, so the parser now reads
  it from there and rebuilds the id in exactly the shape the API uses. Checked
  against the live feed: all 273 papers came back with versioned ids over
  http and PDF links over https, as arXiv itself returns them. A known limit
  that remains: a paper revised weeks later arrives as a new version and so a
  new id, which the live feed never showed because it only ever serves the
  current one.

- **The runner's first real night.** Throttled on the opening request, waited,
  hit two HTTP 503s from an overloaded arXiv, waited four times in all, and
  came away with 196 papers from the search API before a 429 with no patience
  left. It then topped up from the feeds for 273 more: 469 papers stored, all
  469 with an embedding, 386 carrying at least one topic. Eleven minutes, and
  the vector search on the real database returns sensible neighbours. The
  actions were also moved off the Node 20 runtime GitHub is retiring.

- **How it was checked.** 93 unit tests, 81 end-to-end tests in Chromium,
  WebKit, and mobile Chrome (Firefox in CI, as before). The nightly job was
  rehearsed end to end against the stand-in Supabase with a real arXiv fetch
  and stand-in vectors: 26 papers stored, the embedding column correctly
  hidden from the default select, the topic-overlap query and the
  nearest-neighbour search both returning the right papers.

## 2026-09-11: Phase 3 started (accounts)

Decisions: Supabase free tier, email and password only, logged-out visitors
keep the full feed with saves in the browser, local saves merge into the
account on first login. The account system switches on only when the two
public Supabase values are present in `.env.local`, so the site keeps working
with zero setup.

- **Connected to a real project.** Tables, function, and auth settings checked
  from the command line with the public key (all three tables answer, the
  delete function refuses anonymous calls, email confirmation is on). The
  owner then signed up with a real address: the confirmation email arrived,
  the link signed them in, and onboarding saved the field and topics.

- **Finishing touches.** Branded confirmation and reset emails for the day a
  mail provider is configured (Supabase only allows editing templates with
  custom SMTP), a daily keep-alive workflow (one read a day keeps
  the free project from pausing; it needs the project URL and anon key as
  repository secrets and does nothing without them), and the README, About,
  and Privacy pages updated for accounts. Not done yet: connecting a real
  Supabase project, which needs the two public values in `.env.local`, then
  a manual pass through sign-up with a real inbox.

- **Account section, onboarding, library.** `/account` (name), `/account/settings`
  (default field, interests as topic chips), `/account/security` (change
  password, sign out everywhere), `/account/data` (download everything as
  JSON, delete the account through the database function). `/onboarding`
  asks for a default field and at least three topics after the first login;
  the feed then opens on that field. `/saved` is the library: search, sort,
  collections (create, rename, delete, file papers), with a link from the
  drawer for signed-in readers. Signing out clears the browser copy of the
  saves so nothing stays behind on a shared device. One race found by the
  WebKit run: the settings and onboarding forms seeded their state from the
  profile after the reader had already clicked, wiping the clicks; the
  fieldsets are now disabled until the profile has loaded. The Saved button
  carries `aria-busy` while the account sync runs, so tests (and assistive
  tech) can tell when it is done.

- **Saved papers follow the account.** `useSaved` keeps localStorage as the
  always-on browser copy. When a user is signed in it pulls the account's
  list; the first time in a browser the two are merged and browser-only
  papers are uploaded, afterwards the account leads so removals made
  elsewhere show up. Each save or removal is applied locally at once and
  queued in localStorage for the account; the queue is flushed in order and
  a failed write stays queued for the next sync instead of being lost. Pure
  merge logic in `lib/saved/merge.ts` (unit tested), Supabase calls in
  `lib/saved/remote.ts`. End-to-end: a paper saved logged out survives a
  wiped browser after login, and saves and removals while signed in show up
  in a fresh browser state.

- **Sign-in pages.** Sign up (name, email, password; shows a "check your
  inbox" state), log in (with a `next` return address and plain error
  messages), forgot password, reset password (reached from the emailed link,
  explains an expired link), verify email, and `/auth/callback`, where the
  emailed links land: it exchanges the one-time code for a session and sends
  new users to onboarding or returning users where they were going. A small
  form kit in `components/auth/ui.tsx` keeps the pages consistent; a
  `useUser` hook gives client components the signed-in user; the feed header
  shows "Log in" or the account initial, and nothing at all when accounts
  are off.
- **Tests with the fake.** `npm run build:test` builds into `.next-test` with
  the fake Supabase address baked in; Playwright starts the fake and the app
  itself. `tests/e2e/auth.spec.ts` covers sign-up and confirmation, wrong
  password, unconfirmed email, protected-page redirect and return, the full
  password reset, and an expired reset link. Two lessons: the fake must not
  read `PORT` (that variable picks the app's port, so the fake had started on
  it and the tests waited on the wrong port), and Next's route announcer also
  has the alert role, so form messages are located inside `main`.

- **Foundations.** `lib/supabase/` holds a browser client, a server client
  (cookies), and the on/off switch; `middleware.ts` refreshes the session on
  every page request and redirects signed-out visitors away from account
  pages (and signed-in ones away from login and sign-up). With no keys the
  middleware does nothing.
- **Database as one SQL file** (`supabase/migrations/0001_accounts.sql`):
  profiles, collections, saved_papers, row-level security so every user sees
  only their own rows, a trigger that creates a profile on sign-up, and a
  `delete_own_account` function that runs with the definer's rights so the
  app never needs the secret service-role key. `supabase/README.md` has the
  ten-minute setup.
- **Fake Supabase** (`scripts/fake-supabase.ts`): an in-memory stand-in for
  the parts of the Supabase API the app uses (sign-up with email
  confirmation, password login, refresh, recovery, the verify link and the
  code exchange, the three tables with PostgREST filters and row-level
  security, the delete RPC). Emails are recorded at `/_dev/emails` instead
  of sent, which is how tests follow the link. A smoke script drove it
  through 16 checks, all passing. It lets the account features be developed
  and tested before a real project exists, and lets anyone run them offline.

## 2026-09-11: Phase 2 started (topic tagging)

- **Chip rows you can actually scroll.** The field and topic rows overflow
  sideways with the scrollbar hidden, so with a mouse there was no visible way
  to reach the chips off-screen. `components/ChipRow.tsx` now wraps both
  rows: a vertical mouse wheel over a row scrolls it sideways (registered as a
  native, non-passive listener so the page does not scroll too), an arrow
  button over a soft fade appears at any edge that has more chips and scrolls
  by most of a row width, and the selected chip is scrolled into view whenever
  the selection changes, including when a tag on a card selects a topic that
  was off-screen. The arrows are hidden from assistive technology and the tab
  order because keyboard users reach every chip directly. Covered by an
  end-to-end test at a 640 px viewport.

- **Two bugs found by trying the app.** (1) The action buttons moved from card
  to card: a long title plus the six-line abstract could be taller than the
  card, so the middle overflowed and pushed the footer out of the card and
  into the next one. The card is now header, a middle region that centres
  short content and scrolls inside the card when long, and a pinned footer;
  vertical padding is smaller. (2) "Loading" at the end of the feed never
  went away: the status card was the snapped card, new pages were inserted
  above it, Chrome kept it in view, the observer fired again, and the feed
  loaded page after page while showing the status card. The status card is
  now a snap target only at a real end (no more pages, or an error to show),
  so the reader stays on the last card and new cards appear below. Fixing
  that exposed a third problem: the intersection observer used the viewport
  as its root, so the sentinel counted as visible only when the status card
  itself was on screen. It now observes relative to the feed container with
  a margin of one and a half cards, so the next page loads shortly before
  the reader reaches the end. Two new end-to-end tests cover the pinned
  footer and "one more page, no cascade, still on the last card".
- **Test builds next to a dev server.** The Next output folder is
  overridable (`NEXT_DIST_DIR`) and the Playwright port too (`PORT`), so a
  production build for the tests no longer fights a running `npm run dev`
  over the same `.next` folder.

- **Embedding tagger (v2).** `recommender/main.py` gained `POST /tag`: it
  embeds the topic descriptions once (cached by text) and each abstract once,
  takes cosine similarities, and keeps topics at or above a threshold of 0.3,
  best first, at most three. The taxonomy is sent with the request so the
  service has no copy to keep in sync. On the Next side,
  `lib/neuralTagger.ts` is a small client with a four-second timeout and a
  per-paper cache; the API route calls `tagPapersBest`, which uses the
  service'"'"'s tags when it answers and the rules otherwise, and keeps the rule
  tags for any paper the service returned nothing for. Checked against a mock
  implementing the contract: tags switched to the mock'"'"'s, the second request
  only sent the three unseen papers, and with the mock stopped the route
  answered in about 300 ms with rule-based tags and a warning in the log. The
  real service was not run (it needs torch); the threshold will need tuning
  against real embeddings.

- **Tagger evaluation and tuning.** `scripts/tag-report.ts` pulls one polite
  request per field (25 papers each) into `tests/fixtures/tag-sample.json`
  and prints every paper with its tags and the patterns that fired, plus the
  tag distribution. Reading the first report showed three kinds of mistakes:
  words shared across areas ("replay", "gait", "localization", "decision
  making" firing on machine-learning papers), single common words plus a
  category being enough for the broadest topics ("benchmark", "LLM",
  "safety", "explanations", "pretrain"), and bare patterns ("3D",
  "vehicles", "spatio-temporal"). Fixes: a topic can be `gated` to its own
  categories (all neuroscience topics, video, image generation, locomotion,
  navigation, driving, speech, efficient models), a topic can set a higher
  `minScore` (benchmarks, LLMs, safety, interpretability need a title hit or
  two abstract hits), and the bare patterns were tightened. A second pass
  fixed three regressions found by diffing the reports. Result on the
  sample: benchmark tags 23 to 3, LLM tags 38 to 27, 132 of 150 papers
  tagged, and the remaining untagged ones are mostly outside the taxonomy
  (pure maths, molecular biology). Hand-labelling for precision and recall
  is the open item; the script'"'"'s `eval` mode is ready for it.

- **Topics in the UI.** Each card shows its tags as small chips under the
  author line; tapping one switches to the topic's field and runs the
  topic's arXiv search, so a topic is just another query like a field is.
  A topics row under the field chips lists the topics of the active field;
  the active one is highlighted in the field accent and tapping it again
  clears it. Typing a search or picking a field clears the topic.
- **Header geometry fix.** The header is fixed and the feed had a hard-coded
  112 px top padding while cards were a full viewport tall and snapped to the
  scrollport top. Result: the first 112 px of every card, the field stamp and
  card number, sat hidden under the header. The header height is now
  measured (ResizeObserver) into a `--header-h` variable; the feed uses it
  for padding and scroll-padding and cards are `100dvh` minus that height,
  so each card fits exactly below the header whatever rows it shows. The
  end-to-end suite asserts the stamp is in the viewport.

- **Taxonomy** (`lib/topics.ts`): 56 topics, 7 to 15 per field. A topic has a
  label, a one-sentence description, hinting arXiv categories, keyword
  patterns, and the arXiv search it maps to when tapped. Kept valid by
  `tests/unit/topics.test.ts`.
- **Rule-based tagger** (`lib/tagger.ts`): +3 per pattern found in the title,
  +1 per pattern in the abstract, +1 if the paper carries one of the topic's
  categories and at least one pattern matched. A topic needs 2 points, so a
  title hit is enough and a single stray word in the abstract is not. At most
  three tags, best first, ties in taxonomy order. `scoreTopics` also returns
  the patterns that fired, so every tag can be explained.
- **Plumbing**: `Paper` gained `categories` (all arXiv categories, parsed
  from the feed) and `tags`. The API route fills tags on every response,
  fresh or stale. Papers saved before this change get empty lists when read
  back from localStorage.

- Repository pushed to GitHub (Myursel777/paperscroll). The first CI run
  passed in about two minutes, including the end-to-end suite in Firefox,
  which cannot start on the development machine.

## 2026-09-11: Phase 1 started

- **Dependency pin.** `resolve` 1.22.12, a transitive dependency of Tailwind
  and ESLint, ships stray files from its maintainer's working folder inside
  the package. The 1.x line is pinned to 1.22.11 through `overrides` in
  `package.json`; the two versions are otherwise identical.

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
