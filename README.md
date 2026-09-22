# Leptigo v1

**One word. Infinite meanings.**

This is the first product-shaped Leptigo prototype. It is deliberately local-first and dependency-free so the product mechanics can be tested before adding accounts, APIs, payments or hosting infrastructure.

## Included

- Contextual Leptigo meaning engine
- Public-style meaning feed
- Publish/private-save flows
- Context voting and LP reputation
- Daily Leptigo prompt and entries
- Leptigo Battle voting loop
- Searchable/sortable living dictionary
- User profile, levels and local stats
- Persistent browser state via `localStorage`
- Installable PWA shell/service worker
- Responsive desktop/mobile UI

## Run it

You can open `index.html` directly for most functionality.

For the service worker/PWA behaviour, serve the folder locally, for example:

```bash
python3 -m http.server 8080
```

Then open `http://localhost:8080`.

## Product architecture after this prototype

The next real build should move state from localStorage to a backend with:

- authentication and profiles
- Postgres/Supabase-style persistence
- server-side feed ranking and moderation
- AI contextual interpretation endpoint
- real daily competitions and battle matchmaking
- shareable permanent meaning URLs
- notifications, streaks and leaderboards
- analytics and abuse controls
- Pro subscriptions / brand campaign surfaces

The core object is a **Meaning**: context + inferred part of speech + definition + tone + author + votes + provenance.

## Deploy to Vercel

This folder is deployment-ready. Import the repository or deploy the directory as a static project. `vercel.json` provides SPA fallback routing, basic security headers, and fresh service-worker checks.
