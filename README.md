# Movie Monday

Watch movie with loved one every monday and alternate who chooses!
A personal movie journal web app to track every film you watch.

**Live app:** https://pyrpapa.github.io/movie-monday/

## What it does
- Search for movies by title, actor, or director
- Log movies with your rating, notes, and date watched
- Get suggestions based on your watch history
- View stats and reports on your movie habits
- Secure login — your journal is private to your account

## Built with
- React + Vite
- Supabase (authentication + database)
- TMDB API (movie search and posters)

## Running locally

1. Clone the repo and install dependencies:
```bash
   npm install
```

2. Create a `.env` file in the project root:

VITE_TMDB_TOKEN=your-tmdb-read-access-token
VITE_SUPABASE_URL=your-supabase-project-url
VITE_SUPABASE_ANON_KEY=your-supabase-anon-key


3. Start the app:
```bash
   npm run dev
```

4. Open `http://localhost:5173`

## API Keys
- TMDB — free at [themoviedb.org](https://www.themoviedb.org/settings/api)
- Supabase — free at [supabase.com](https://supabase.com)

## Deployment

Pushing to `main` automatically builds and deploys to GitHub Pages via [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml).

One-time setup (repo owner only):
1. In repo **Settings → Pages**, set Source to **GitHub Actions**.
2. In repo **Settings → Secrets and variables → Actions**, add a secret `VITE_TMDB_TOKEN` (the `SUPABASE_URL` / `SUPABASE_ANON_KEY` secrets already exist for the keep-alive workflow and are reused for the build).
3. In your Supabase project (**Authentication → URL Configuration**), add `https://pyrpapa.github.io/movie-monday/` as a Redirect URL so email confirmation links work from the live site.

Because this is a static site, the TMDB token and Supabase anon key are visible in the built JS bundle — normal for a client-only app like this. Keep the Supabase table's Row Level Security policies scoped to `auth.uid()` so users can only see their own entries.

## Public read-only demo (optional)

The login screen can show a "View a read-only demo" link that lets visitors browse one account's Journal, Hall of Fame, and Report — no sign-in required, no edit/delete/import controls, and no personal notes (excluded at the database level, not just hidden in the UI). To enable it:

1. Find your Supabase `auth.users` id (SQL Editor): `select id from auth.users where email = 'you@example.com';`
2. Create a view that hardcodes both the row scope (just that account) and the column list (no `notes`, no raw `user_id`), then grant it to the anonymous role:
   ```sql
   create view demo_watchlog as
   select id, title, year, genre, poster, tmdb_id, watch_date, gold_rank, overview
   from watchlog
   where user_id = '<the-uuid-from-step-1>';

   grant select on demo_watchlog to anon;
   ```
3. Add a repo secret named `VITE_DEMO_ENABLED` with the value `true` (**Settings → Secrets and variables → Actions**).

The demo link only appears once `VITE_DEMO_ENABLED` is `true`. Visiting `?demo=1` reads from `demo_watchlog` via the anon key — the view itself is what scopes access to one account and strips notes, so the client never even requests (or could request) more than that.
