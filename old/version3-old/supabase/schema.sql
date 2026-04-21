-- =============================================================================
-- Earnings Calendar — Supabase Schema
-- Run this entire file in the Supabase SQL editor (Dashboard → SQL Editor)
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Users table
-- Mirrors the OAuth identity from NextAuth. We store the provider's user ID
-- (e.g. Google sub / GitHub id) as the primary key so there is no mismatch
-- between what NextAuth puts in session.user.id and what we query by.
-- ---------------------------------------------------------------------------
create table if not exists public.users (
  id          text primary key,           -- NextAuth token.sub (provider user id)
  email       text,
  name        text,
  image       text,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

-- ---------------------------------------------------------------------------
-- Earnings events table
-- One row per (user, ticker, earnings_date) combination.
-- The unique constraint on (user_id, symbol, earnings_date) replaces the
-- in-memory duplicate check that existed in the JSONBin implementation and
-- makes it atomic — no race condition possible.
-- ---------------------------------------------------------------------------
create table if not exists public.earnings_events (
  id             bigserial primary key,
  user_id        text not null references public.users(id) on delete cascade,
  symbol         text not null,
  name           text not null,
  earnings_date  date not null,
  time_of_day    text not null default 'TBD',  -- BMO | AMC | DMH | TBD
  domain         text not null,
  eps_estimated  numeric,
  data_source    text,                          -- FMP | Yahoo | Nasdaq
  created_at     timestamptz default now(),
  updated_at     timestamptz default now(),

  -- Prevents duplicate entries for the same user + ticker + date
  constraint earnings_events_unique unique (user_id, symbol, earnings_date)
);

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------

-- Most common query: fetch all events for a user ordered by date
create index if not exists idx_earnings_events_user_date
  on public.earnings_events (user_id, earnings_date asc);

-- Useful for future features: find all events for a given ticker globally
create index if not exists idx_earnings_events_symbol
  on public.earnings_events (symbol);

-- Useful for showing upcoming events within a date range
create index if not exists idx_earnings_events_date
  on public.earnings_events (earnings_date);

-- ---------------------------------------------------------------------------
-- Row Level Security (RLS)
-- Users can only read and write their own rows. Supabase enforces this at the
-- database level — even if application code has a bug, data cannot leak.
--
-- We use the service role key server-side (in Next.js API routes) which bypasses
-- RLS for trusted server operations. The anon key is never used server-side.
-- ---------------------------------------------------------------------------
alter table public.users enable row level security;
alter table public.earnings_events enable row level security;

-- Users can only see and edit their own user record
create policy "users_own_row" on public.users
  for all
  using (id = current_setting('app.current_user_id', true));

-- Users can only see and edit their own events
create policy "events_own_rows" on public.earnings_events
  for all
  using (user_id = current_setting('app.current_user_id', true));

-- ---------------------------------------------------------------------------
-- updated_at trigger — keeps updated_at current on any row modification
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger set_users_updated_at
  before update on public.users
  for each row execute function public.set_updated_at();

create trigger set_events_updated_at
  before update on public.earnings_events
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Helper view: upcoming events (next 90 days) — useful for future dashboard
-- ---------------------------------------------------------------------------
create or replace view public.upcoming_earnings as
  select
    ee.*,
    u.email,
    u.name as user_name
  from public.earnings_events ee
  join public.users u on u.id = ee.user_id
  where ee.earnings_date >= current_date
    and ee.earnings_date <= current_date + interval '90 days'
  order by ee.earnings_date asc;
