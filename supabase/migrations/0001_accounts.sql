-- PaperScroll accounts: profiles, saved papers, collections.
--
-- Run this once in the Supabase dashboard (SQL Editor, "New query", paste,
-- Run). It is idempotent enough to re-run after a failure: every object is
-- created with "if not exists" or replaced.
--
-- Security model: every table has row-level security on, and every policy
-- says the same thing: a user may read and write rows whose user id is their
-- own. The browser talks to the database directly with the public anon key;
-- these policies are what keep one person's saves invisible to another.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- profiles: one row per user, created by a trigger when the user signs up.
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id            uuid primary key references auth.users (id) on delete cascade,
  display_name  text,
  default_field text not null default 'ai-ml',   -- field id from lib/arxiv.ts
  interests     text[] not null default '{}',     -- topic ids from lib/topics.ts
  onboarded     boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

alter table public.profiles enable row level security;

drop policy if exists "profiles are private to their owner" on public.profiles;
create policy "profiles are private to their owner"
  on public.profiles for all to authenticated
  using (auth.uid() = id) with check (auth.uid() = id);

-- ---------------------------------------------------------------------------
-- collections: named folders for saved papers.
-- ---------------------------------------------------------------------------
create table if not exists public.collections (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  name       text not null check (length(name) between 1 and 60),
  created_at timestamptz not null default now(),
  unique (user_id, name)
);

alter table public.collections enable row level security;

drop policy if exists "collections are private to their owner" on public.collections;
create policy "collections are private to their owner"
  on public.collections for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- saved_papers: the library. paper_id is the arXiv abstract URL, the same key
-- the app uses everywhere; paper is the Paper object as shown in the feed, so
-- the library can render without asking arXiv again.
-- ---------------------------------------------------------------------------
create table if not exists public.saved_papers (
  user_id       uuid not null references auth.users (id) on delete cascade,
  paper_id      text not null,
  paper         jsonb not null,
  collection_id uuid references public.collections (id) on delete set null,
  saved_at      timestamptz not null default now(),
  primary key (user_id, paper_id)
);

create index if not exists saved_papers_by_user_and_time
  on public.saved_papers (user_id, saved_at desc);

alter table public.saved_papers enable row level security;

drop policy if exists "saved papers are private to their owner" on public.saved_papers;
create policy "saved papers are private to their owner"
  on public.saved_papers for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- Triggers: a profile for every new user, and updated_at maintenance.
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1))
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute procedure public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Delete your own account. Deleting from auth.users normally needs the
-- service-role key; this function runs with the definer's rights and only
-- ever deletes the calling user, so the app never needs that secret.
-- Cascades remove the profile, collections, and saved papers.
-- ---------------------------------------------------------------------------
create or replace function public.delete_own_account()
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not signed in';
  end if;
  delete from auth.users where id = auth.uid();
end;
$$;

revoke all on function public.delete_own_account() from public;
grant execute on function public.delete_own_account() to authenticated;
