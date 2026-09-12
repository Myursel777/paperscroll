# Accounts on Supabase

PaperScroll works without any of this. Accounts are an add-on: with them,
saved papers sync across devices and the library, settings, and For You can
learn from more than one browser. Everything here fits in Supabase's free
tier.

## One-time setup (about ten minutes)

1. Create a project at supabase.com (free plan). Pick a region near you and
   note the database password somewhere safe; the app never needs it.
2. In the dashboard open **SQL Editor**, choose **New query**, paste the whole
   of `migrations/0001_accounts.sql`, and run it. It creates the tables, the
   row-level security policies, the profile trigger, and the
   delete-own-account function. Then do the same with
   `migrations/0002_for_you.sql`, which adds the reading events, the paper
   store, and the nearest-neighbour search For You uses.
3. Open **Project Settings, API**. Copy the **Project URL** and the **anon
   public** key into `.env.local` in the repository root:

   ```
   NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
   ```

   Both are public by design. Never copy the **service_role** key anywhere;
   the app does not use it.
4. Open **Authentication, URL Configuration**. Set the Site URL to where the
   site runs and add the callback address to the redirect list, once per
   environment:

   ```
   http://localhost:3000/auth/callback
   https://your-domain.vercel.app/auth/callback
   ```
5. Optional, and only once you have a mail provider: Supabase lets you edit
   the email texts only when custom SMTP is configured (Authentication, Emails,
   SMTP Settings). The branded versions in `email-templates/` are ready for
   that day; until then the default Supabase emails are used and work fine.
6. Restart `npm run dev`. The header now shows **Log in**.

## Without a Supabase project

`npx tsx scripts/fake-supabase.ts` starts a small stand-in on
http://localhost:54321 that speaks enough of the Supabase API for the app:
sign up, log in, password reset, and the three tables, all in memory. Point
`.env.local` at it to develop the account features offline:

```
NEXT_PUBLIC_SUPABASE_URL=http://localhost:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=fake-anon-key
```

The end-to-end tests use the same stand-in.

## Keeping the free project awake

Supabase pauses free projects after a week without requests. The GitHub
Actions workflow `.github/workflows/keep-alive.yml` sends one tiny request a
day. It needs the project URL and anon key as repository secrets
`SUPABASE_URL` and `SUPABASE_ANON_KEY` (Settings, Secrets and variables,
Actions).

## What is stored

| Table | Row | Who can see it |
|---|---|---|
| `profiles` | display name, default field, interests, onboarding flag | the owner |
| `collections` | a named folder for saved papers | the owner |
| `saved_papers` | the paper as shown in the feed, when it was saved, optional collection | the owner |
| `events` | one reading action: paper, type, topics, how long the card was on screen | the owner |
| `papers` | recent papers with their topics, embedding, and popularity | everybody (read only) |

Deleting an account removes everything that belongs to it through cascades.
The `papers` table belongs to nobody: it holds public arXiv metadata, it is
readable by anyone, and only the nightly job can write it.

## The nightly paper store

`.github/workflows/nightly.yml` fills the `papers` table once a night: fetch
from arXiv, tag, embed, upload. It is what lets For You rank without calling
arXiv per reader. It needs two more repository secrets:

| Secret | What it is |
|---|---|
| `SUPABASE_URL` | the project URL, the same one the site uses |
| `SUPABASE_SERVICE_KEY` | the **service_role** key from Project Settings, API |

If a run ends yellow with "arXiv returned nothing tonight", nothing is wrong
with the setup: arXiv limits requests by address and Actions runners share
theirs. The job waits, then tries arXiv's daily feeds, and if those are empty
too (they carry nothing at weekends) it leaves the store alone and the site
uses the live path. The next night usually works.

The service-role key bypasses row-level security, so it belongs in the
repository secrets and nowhere else: never in `.env.local`, never in a
`NEXT_PUBLIC_` variable, never in the browser. The website only reads this
table, with the public key. Without the secrets the job still fetches and
embeds and then stops, which is a harmless dry run, and the site falls back to
the live path.

To rehearse the whole job against the stand-in, where the service key is the
literal `fake-service-key`:

```bash
npm run fake-supabase
npx tsx scripts/nightly/fetch.ts papers.json
SUPABASE_URL=http://localhost:54321 SUPABASE_SERVICE_KEY=fake-service-key npx tsx scripts/nightly/upload.ts papers.json
```
