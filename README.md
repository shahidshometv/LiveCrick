# Boundary – cricket video player

Static site, no build step. Plays HLS (.m3u8), MP4 and WebM streams.

## Add matches
Edit `streams.json`. Each item: `id`, `title`, `series`, `status` (live | upcoming | replay), optional `start` (ISO time), and `url`.
Only use streams you own or have rights to show. Stream URLs must be https and allow cross-origin playback (CORS).

## Deploy on Vercel
Option A (CLI):  npm i -g vercel  &&  vercel --prod   (run inside this folder; accept defaults, no framework)
Option B (Git):  push this folder to GitHub, import the repo at vercel.com/new, leave Build Command empty, Output Directory empty.

## Test locally
npx serve .
