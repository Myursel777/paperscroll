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
   delete-own-account function.
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
5. Optional: under **Authentication, Email Templates** replace the default
   texts with the ones in `email-templates/` so the emails match the site.
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

Deleting an account removes all three through cascades.
