# Earnings Calendar — Setup Guide

## Environment Variables

Create a `.env.local` file in the project root:

```bash
# NextAuth
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=<generate with: openssl rand -base64 32>

# OAuth providers
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GITHUB_ID=
GITHUB_SECRET=

# Supabase (replace JSONBin)
NEXT_PUBLIC_SUPABASE_URL=https://<your-project-ref>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<from Supabase dashboard → Settings → API>

# Earnings data sources (round-robin, all optional but at least one needed)
FMP_API_KEY=                  # financialmodelingprep.com — 250 calls/day free
NASDAQ_DATA_LINK_KEY=         # data.nasdaq.com — 50 calls/day free
# Yahoo Finance needs no key

# News sources (optional — falls back gracefully)
ALPHAVANTAGE_KEY=             # alphavantage.co — used for news sentiment only
FINNHUB_API_KEY=              # finnhub.io
FMP_API_KEY=                  # reused for news too

# Logo proxy (keeps API token server-side)
LOGO_DEV_TOKEN=               # logo.dev

# Debug (set to 'true' to see source counters in responses)
DEBUG_LOGS=false
```

## Supabase Setup

1. Create a free project at [supabase.com](https://supabase.com)
2. Go to **SQL Editor** in the dashboard
3. Paste and run the contents of `supabase/schema.sql`
4. Copy your project URL and service role key into `.env.local`

The schema creates:
- `users` table — synced from OAuth identity on each login
- `earnings_events` table — per-user earnings dates with a unique constraint on `(user_id, symbol, earnings_date)` preventing duplicates at the database level
- Row Level Security policies (enforced as a defence-in-depth layer)
- Indexes for fast user+date queries
- `upcoming_earnings` view for future dashboard features

## Install & Run

```bash
npm install
npm run dev
```

## What Changed from JSONBin

| Before (JSONBin) | After (Supabase) |
|-----------------|-----------------|
| Single JSON blob, all users mixed | Separate rows per user per event |
| In-process write lock (fragile) | DB unique constraint (atomic) |
| No delete support | DELETE /api/events?id=<id> |
| No BMO/AMC display | Time-of-day badges on calendar |
| No EPS data stored | epsEstimated stored and shown |
| axios dependency | Removed — native fetch only |
| Race condition on concurrent writes | Handled by Postgres upsert |
