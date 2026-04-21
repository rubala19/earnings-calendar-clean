-- =============================================================================
-- Migration: ticker_relationships table
-- Run this in Supabase SQL Editor (Dashboard → SQL Editor)
-- Adds to the existing schema — safe to run on existing databases
-- =============================================================================

-- ---------------------------------------------------------------------------
-- ticker_relationships
-- Stores related tickers for a given symbol, grouped by relationship type.
-- Populated server-side from FMP peers + Claude LLM analysis.
-- Cached indefinitely and refreshable on demand.
-- ---------------------------------------------------------------------------
create table if not exists public.ticker_relationships (
  id            bigserial primary key,
  symbol        text not null,              -- the ticker this data is about e.g. 'NVDA'
  rel_type      text not null,              -- 'peer' | 'upstream' | 'downstream' | 'adjacent'
  rel_symbol    text not null,             -- the related ticker e.g. 'AMD'
  rel_name      text,                       -- human name e.g. 'Advanced Micro Devices'
  reason        text,                       -- one-line rationale from Claude
  source        text not null default 'llm', -- 'fmp' | 'llm'
  created_at    timestamptz default now(),
  refreshed_at  timestamptz default now(),

  constraint ticker_relationships_unique unique (symbol, rel_type, rel_symbol)
);

-- Fast lookup: all relationships for a given symbol
create index if not exists idx_ticker_rel_symbol
  on public.ticker_relationships (symbol, rel_type);

-- Fast reverse lookup: find everything that points to a given ticker
create index if not exists idx_ticker_rel_symbol_rel
  on public.ticker_relationships (rel_symbol);

-- RLS — relationships are global (not per-user) so read is public,
-- writes happen only via the service role key from API routes.
alter table public.ticker_relationships enable row level security;

-- Drop policies if they exist (makes this script idempotent / re-runnable)
drop policy if exists "ticker_relationships_read_all" on public.ticker_relationships;

create policy "ticker_relationships_read_all" on public.ticker_relationships
  for select using (true);

-- updated_at trigger
drop trigger if exists set_ticker_rel_refreshed_at on public.ticker_relationships;
create trigger set_ticker_rel_refreshed_at
  before update on public.ticker_relationships
  for each row execute function public.set_updated_at();
