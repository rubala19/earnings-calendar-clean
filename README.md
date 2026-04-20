# Earnings Calendar v3 — Setup Guide

## New in v3
- Stripe subscriptions — $0.99/month premium plan
- Graph relationship DB — ticker relationships stored in Supabase with crowdsourced accuracy
- Voting system — users vote on relationship accuracy, confidence scores auto-adjust
- Admin panel — /admin for edge curation, approval, reclassification
- Premium gating — price chart and related tickers require active subscription
- Yahoo crumb/cookie fix — chart and earnings endpoints now authenticate correctly

## Environment Variables

```bash
# NextAuth
NEXTAUTH_URL=https://yourapp.vercel.app
NEXTAUTH_SECRET=                        # openssl rand -base64 32

# OAuth
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GITHUB_ID=
GITHUB_SECRET=

# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=

# Stripe
STRIPE_SECRET_KEY=sk_live_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_...
STRIPE_PRICE_ID=price_...
STRIPE_WEBHOOK_SECRET=whsec_...

# Earnings data
FMP_API_KEY=
NASDAQ_DATA_LINK_KEY=

# Relationships (optional but recommended)
ANTHROPIC_API_KEY=sk-ant-...

# News
ALPHAVANTAGE_KEY=
FINNHUB_API_KEY=

# Logo proxy
LOGO_DEV_TOKEN=

# Admin — comma-separated emails with admin access
ADMIN_EMAILS=you@example.com

# Debug
DEBUG_LOGS=false
```

## Supabase — Run in order

1. supabase/schema.sql
2. supabase/migration_relationships.sql
3. supabase/migration_v3.sql

## Stripe Setup

1. Create product at stripe.com — $0.99/month recurring
2. Copy price_... ID to STRIPE_PRICE_ID
3. Add webhook at https://yourapp.vercel.app/api/stripe/webhook
   Events: checkout.session.completed, customer.subscription.updated,
   customer.subscription.deleted, invoice.payment_failed, invoice.payment_succeeded
4. Copy webhook secret to STRIPE_WEBHOOK_SECRET

## Admin Panel

Visit /admin — restricted to ADMIN_EMAILS. Shows pending user suggestions and
flagged low-confidence edges for review.

## Confidence Scoring

LLM seed: 0.60 | FMP: 0.75 | User: 0.70 | Admin approved: 0.95
Each upvote +0.02, each downvote -0.05
Auto-reject below 0.15 confidence with 5+ downvotes
Hidden from users below 0.25 confidence
