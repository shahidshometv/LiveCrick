# Boundary – cricket video player

Static site, no build step. Plays HLS (.m3u8), MP4 and WebM streams.

## Add matches
Edit `streams.json`. Each item: `id`, `title`, `series`, `status` (live | upcoming | replay), optional `start` (ISO time), and `url`.
Only use streams you own or have rights to show. Stream URLs must be https and allow cross-origin playback (CORS).

## Deploy on Vercel
Option A (CLI):  npm i -g vercel  &&  vercel --prod   (run inside this folder; accept defaults, no framework)
Option B (Git):  push this folder to GitHub, import the repo at vercel.com/new, leave Build Command empty, Output Directory empty.

Set `ADMIN_PASSWORD` and `GROQ_API_KEY` in the Vercel project environment variables to use the admin assistant. The assistant uses Groq's web search to find official streams and replays in India, including free and paid options labeled by access type. It verifies public YouTube videos for embedding and can also list official broadcaster watch pages; playback and access on those pages must be confirmed on the source site. Results are not exhaustive. Optionally set `GROQ_CHAT_MODEL` to choose a Groq chat model for general assistant questions.

## Test locally
npx serve .
