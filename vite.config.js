import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import process from 'node:process'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Vercel serves the site from the root; GitHub Pages serves it from /movie-monday/.
  // Vercel sets VERCEL=1 during its builds.
  base: process.env.VERCEL ? '/' : '/movie-monday/',
})
