-- PaperScroll For You v2: reading events, the paper store, topic sliders.
--
-- Run after 0001_accounts.sql, the same way: SQL Editor, New query, paste,
-- Run. Safe to re-run.
--
-- What this adds:
--   events        one row per thing a reader did with a paper (see
--                 lib/foryou/events.ts). Private to the owner. The interest
--                 profile is computed from these in the browser.
--   papers        the paper store filled by the nightly job: recent papers
--                 with their topic tags, a sentence embedding (pgvector), and
--                 a popularity score. Readable by everyone, written only by
--                 the job with the service-role key (which bypasses these
--                 policies; the app itself never holds that key).
--   nearest_papers  the nearest-neighbour search For You uses to find
--                 candidates close to the reader's content profile.
--   profiles.topic_boosts  the topic sliders, per user.

create extension if not exists vector;

-- ---------------------------------------------------------------------------
-- events
-- ---------------------------------------------------------------------------
create table if not exists public.events (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references auth.users (id) on delete cascade,
  paper_id   text not null,
  type       text not null check (type in (
               'impression', 'dwell', 'expand', 'read', 'save', 'unsave', 'not_interested', 'tag_tap')),
  value      real,                              -- dwell milliseconds; null otherwise
  tags       text[] not null default '{}',      -- the paper's topic ids at the time
  created_at timestamptz not null default now()
);

create index if not exists events_by_user_and_time
  on public.events (user_id, created_at desc);

-- The nightly job counts recent events per paper for the popularity score.
create index if not exists events_by_time
  on public.events (created_at desc);

alter table public.events enable row level security;

drop policy if exists "events are private to their owner" on public.events;
create policy "events are private to their owner"
  on public.events for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- papers: the store. Metadata only (title, abstract, authors, links), never
-- the papers themselves, and pruned by the nightly job after a few months.
-- ---------------------------------------------------------------------------
create table if not exists public.papers (
  id               text primary key,             -- arXiv abstract URL, the app's key everywhere
  title            text not null,
  summary          text not null,
  authors          text[] not null default '{}',
  published        timestamptz not null,
  pdf_link         text,
  primary_category text,
  categories       text[] not null default '{}',
  tags             text[] not null default '{}', -- topic ids from lib/topics.ts
  embedding        vector(384),                  -- all-MiniLM-L6-v2, unit length
  popularity       real not null default 0,      -- 0 to 1, from recent events across all readers
  fetched_at       timestamptz not null default now()
);

create index if not exists papers_by_published on public.papers (published desc);
create index if not exists papers_by_tags on public.papers using gin (tags);
-- Approximate nearest neighbour by cosine distance.
create index if not exists papers_by_embedding
  on public.papers using hnsw (embedding vector_cosine_ops);

alter table public.papers enable row level security;

drop policy if exists "papers are public" on public.papers;
create policy "papers are public"
  on public.papers for select to anon, authenticated
  using (true);

-- ---------------------------------------------------------------------------
-- nearest_papers: candidates closest to a content profile vector. Called by
-- the browser through PostgREST (supabase.rpc). Rows come back with a
-- similarity from 0 to 1 and without the embedding, which the app does not
-- need.
-- ---------------------------------------------------------------------------
create or replace function public.nearest_papers(query vector(384), n int default 60)
returns table (
  id text, title text, summary text, authors text[], published timestamptz,
  pdf_link text, primary_category text, categories text[], tags text[],
  popularity real, similarity real
)
language sql
stable
as $$
  select p.id, p.title, p.summary, p.authors, p.published,
         p.pdf_link, p.primary_category, p.categories, p.tags,
         p.popularity, (1 - (p.embedding <=> query))::real as similarity
  from public.papers p
  where p.embedding is not null
  order by p.embedding <=> query
  limit least(greatest(n, 1), 200);
$$;

grant execute on function public.nearest_papers(vector, int) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Topic sliders: { "llms": 2, "gnns": 0 }, 1 is neutral (see lib/foryou/profile.ts).
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column if not exists topic_boosts jsonb not null default '{}'::jsonb;
