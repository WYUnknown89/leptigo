# Leptigo v2

**One word. Infinite meanings. Now shared.**

Leptigo v2 upgrades the original local prototype into a real multi-user app backed by Supabase.

## What v2 adds

- public shared feed
- passwordless email authentication
- real user profiles and LP reputation
- globally persisted meanings
- one-vote-per-user context voting
- Daily Leptigo shared across users
- shared Daily voting
- living global dictionary
- local private saves remain private to the device
- secure Row Level Security policies
- Vercel-ready static deployment

## Supabase setup

1. Create a Supabase project.
2. Open **SQL Editor** and run `supabase/schema.sql` in full.
3. Go to **Project Settings → API**.
4. Copy the Project URL and anon/publishable key into `supabase-config.js`.
5. In **Authentication → URL Configuration**, set:
   - Site URL: `https://leptigo.vercel.app`
   - Redirect URL: `https://leptigo.vercel.app/**`
6. Commit and push to `main`. Vercel will redeploy automatically.

The anon key is intentionally public. It is safe in the browser because database access is controlled by the RLS policies in `supabase/schema.sql`. Never put the Supabase service-role key in this repository.

## Local test

```bash
python3 -m http.server 8080
```

Then open `http://localhost:8080`.

For local magic-link auth, add `http://localhost:8080/**` as an additional Supabase redirect URL.

## Next

- AI meaning inference through a server-side endpoint
- profile editing and custom handles
- permanent `/m/:id` share pages
- comments/remixes
- global Battle scoring
- moderation/reporting
- leaderboards and notifications
- analytics and rate limiting
