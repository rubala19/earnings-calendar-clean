# Wofinn — v4.2.0

Your personal financial intelligence agent.

## What's new in v4.2.0
- Full rebrand from "Earnings Calendar" to Wofinn
- Commercial landing page at wofinn.io (/)
- App moved to /app — authenticated users auto-redirect
- Sign in flow routes to /app on success

## Routing
| Path | Description |
|------|-------------|
| `/` | Public landing page |
| `/app` | The earnings calendar app (requires auth) |
| `/auth/signin` | OAuth sign in |
| `/subscribe` | Premium pricing page |
| `/admin` | Admin panel (ADMIN_EMAILS only) |

## Supabase — Run migrations in order
1. supabase/schema.sql
2. supabase/migration_relationships.sql
3. supabase/migration_v3.sql
4. supabase/migration_v4_1_0.sql

## Environment Variables
```bash
NEXTAUTH_URL=https://wofinn.io
NEXTAUTH_SECRET=
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GITHUB_ID=
GITHUB_SECRET=
NEXT_PUBLIC_SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
STRIPE_SECRET_KEY=
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=
STRIPE_PRICE_ID=
STRIPE_WEBHOOK_SECRET=
FMP_API_KEY=
NASDAQ_DATA_LINK_KEY=
ANTHROPIC_API_KEY=
ALPHAVANTAGE_KEY=
FINNHUB_API_KEY=
LOGO_DEV_TOKEN=
ADMIN_EMAILS=you@wofinn.io
STUB_PREMIUM=false
DEBUG_LOGS=false
```

## Stripe webhook
Point to: https://wofinn.io/api/stripe/webhook
Events: checkout.session.completed, customer.subscription.updated,
customer.subscription.deleted, invoice.payment_failed, invoice.payment_succeeded
