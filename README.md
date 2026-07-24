# Movie Monday

Watch movie with loved one every monday and alternate who chooses!
A personal movie journal web app to track every film you watch.

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
