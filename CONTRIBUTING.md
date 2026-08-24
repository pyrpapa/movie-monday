# Contributing to Movie Monday

## One-time setup

1. Clone the repo and install dependencies:
   ```bash
   git clone https://github.com/pyrpapa/movie-monday.git
   cd movie-monday
   npm install
   ```
2. Create a `.env` file in the project root (see the main [README](README.md#running-locally)):
   ```
   VITE_TMDB_TOKEN=your-own-tmdb-read-access-token
   VITE_SUPABASE_URL=shared-supabase-project-url
   VITE_SUPABASE_ANON_KEY=shared-supabase-anon-key
   ```
   - Get your own free TMDB token at [themoviedb.org/settings/api](https://www.themoviedb.org/settings/api) — don't share tokens, they're free and personal.
   - The Supabase URL/anon key are shared (same backend/database for both of you) — ask the repo owner for these.
3. Start the dev server: `npm run dev`, then open `http://localhost:5173`.

## Workflow

1. Pull the latest `main` before starting anything new:
   ```bash
   git checkout main
   git pull
   ```
2. Create a branch named after the Jira ticket:
   ```bash
   git checkout -b MM-123-short-description
   ```
3. Make your change. Before committing, sanity-check it:
   ```bash
   npm run build
   npm run lint
   ```
4. Commit with a message that says *why*, not just *what*:
   ```bash
   git add -A
   git commit -m "MM-123: short description of the change"
   ```
5. Push the branch and open a Pull Request:
   ```bash
   git push -u origin MM-123-short-description
   ```
   GitHub will show a banner on the repo page to open a PR from your branch into `main`. Put the Jira ticket key in the PR title too.
6. Wait for review before merging — see below. Once merged, `main` auto-deploys to the live site within about a minute, so review is the only thing standing between a change and it going live.

## Reviewing a PR

1. Open the PR on GitHub, click the **Files changed** tab to see the diff.
2. Leave inline comments on anything questionable (click the `+` next to a line), or a general comment at the bottom.
3. Click **Review changes** (top right of Files changed) → **Approve**, or **Request changes** if something needs fixing first.
4. Once approved, click **Merge pull request** on the PR's main tab.

## Notes

- There's no automated test suite — review is the only safety net, so for anything touching data (Journal, Hall of Fame, imports) it's worth pulling the branch and clicking through it locally, not just reading the diff.
- **Database schema changes** (new Supabase tables/columns, RLS policies) don't ship via git — they have to be run manually in the Supabase SQL editor. Always call these out explicitly in the PR description so the other person can run them before pulling `main`, otherwise the app will error against a schema it doesn't expect yet.
- Reference the Jira ticket key in both the branch name and PR title so history stays traceable back to context.
