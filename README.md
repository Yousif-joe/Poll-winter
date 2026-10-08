# Seasons Poll

A live poll — "What's your favorite season?" — built with Next.js (App Router), Supabase (Postgres + Realtime) and Tailwind CSS. One vote per device, results visible to everyone and updated in real time.

## Project structure

```
app/layout.tsx        Root layout + metadata
app/page.tsx          Single page, renders <Poll />
components/Poll.tsx   Voting UI, live results, Realtime subscription
lib/supabase.ts       Supabase browser client (reads env vars)
supabase/schema.sql   Table, atomic increment RPC, RLS, Realtime — paste into Supabase
.env.example          Env var template (copy to .env.local)
```

## How it works

- **Storage:** `poll_options` has one row per season with a running `votes` count.
- **Voting:** the client calls the `increment_vote` RPC. It runs `votes = votes + 1` in a single `UPDATE`, so concurrent votes can't be lost. Anonymous users can only `SELECT` the table (RLS); the `security definer` function is the only write path.
- **Live updates:** the page subscribes to `UPDATE` events on `poll_options` via Supabase Realtime and applies the new absolute counts. It also refetches on every (re)connect so nothing is missed.
- **One vote per device:** the chosen season is saved in `localStorage` (`seasons-poll-vote`). If it's present, the vote buttons are hidden and the choice is tagged "Your vote". This survives refresh and syncs across tabs on the same device.
  > Note: this is a device-level guard, not a security control. Clearing site data or using another browser allows another vote.

## Setup

### 1. Supabase

1. Go to [supabase.com](https://supabase.com) → **New project**. Pick a name, password and region, then wait for it to provision.
2. Open **SQL Editor** → **New query**, paste the contents of [`supabase/schema.sql`](supabase/schema.sql) and click **Run**. This creates the table, seeds the four seasons, creates `increment_vote`, grants `execute` to `anon`, enables RLS with a public-read policy and adds the table to the `supabase_realtime` publication.
3. Check: **Table Editor** → `poll_options` should show 4 rows with `votes = 0`. Under **Database → Publications → supabase_realtime**, `poll_options` should be enabled.
4. Get your keys: **Project Settings → API** (or the **Connect** button at the top of the dashboard):
   - **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
   - **anon / public** key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`

   Never use the `service_role` key in this app.

### 2. Run locally

```bash
npm install
cp .env.example .env.local   # then paste your URL + anon key into .env.local
npm run dev
```

Open http://localhost:3000. The status dot turns green ("Live results") once Realtime is connected.

### 3. GitHub

If you're starting from this folder without a remote:

```bash
git init
git add .
git commit -m "Seasons Poll"
git branch -M main
git remote add origin https://github.com/<you>/<repo>.git
git push -u origin main
```

`.env.local` is git-ignored (`.env*`, with only `.env.example` allowed), so no secrets are committed. Run `git status` before your first commit to double-check.

### 4. Vercel

1. Go to [vercel.com/new](https://vercel.com/new) → **Import** your GitHub repo. The framework is auto-detected as Next.js; keep the default build settings.
2. Under **Environment Variables**, add:
   - `NEXT_PUBLIC_SUPABASE_URL` = your Project URL
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = your anon key

   Apply them to Production, Preview and Development.
3. Click **Deploy**. If you add or change env vars later, redeploy (**Deployments → ⋯ → Redeploy**), because `NEXT_PUBLIC_*` values are baked in at build time.

### 5. Test checklist

- [ ] Open the deployed URL in **two windows**: a normal window and an incognito/private window (or two different browsers, or a phone).
- [ ] Both show the four bars at 0% (not NaN) and "0 votes", and the dot says **Live results**.
- [ ] Vote **Summer** in window A. The buttons disappear, Summer gets a "Your vote" tag, and the bar animates to 100%.
- [ ] Window B updates to 1 vote for Summer **without refreshing**.
- [ ] Vote **Winter** in window B. Window A updates live to 50% / 50%.
- [ ] Refresh window A. It still shows "Your vote" on Summer and no buttons.
- [ ] Open a second tab in window A's browser. It shows the voted state, not the buttons.
- [ ] Concurrency: in the Supabase SQL editor run
  `select increment_vote('autumn') from generate_series(1, 100);`
  and confirm Autumn rises by exactly 100 in both windows.
- [ ] Reset the poll whenever you like: `update poll_options set votes = 0;`

## Scripts

| Command         | Purpose                    |
| --------------- | -------------------------- |
| `npm run dev`   | Local dev server           |
| `npm run build` | Production build           |
| `npm run start` | Serve the production build |
| `npm run lint`  | ESLint                     |
