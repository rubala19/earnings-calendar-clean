-- =============================================================================
-- Migration v4.1.0 — Positions
-- Run AFTER migration_v3.sql
-- Adds per-user ticker positions (average cost basis + quantity)
-- =============================================================================

-- Drop policies/triggers if re-running
drop policy  if exists "positions_service_role" on public.positions;
drop trigger if exists set_positions_updated_at on public.positions;

-- ---------------------------------------------------------------------------
-- Positions table
-- One row per (user_id, symbol) — single average cost per ticker.
-- ---------------------------------------------------------------------------
create table if not exists public.positions (
  id            bigserial primary key,
  user_id       text not null references public.users(id) on delete cascade,
  symbol        text not null,
  quantity      numeric(18, 6) not null check (quantity > 0),
  avg_cost      numeric(18, 4) not null check (avg_cost > 0),  -- USD per share
  notes         text,
  created_at    timestamptz default now(),
  updated_at    timestamptz default now(),

  constraint positions_user_symbol unique (user_id, symbol)
);

create index if not exists idx_positions_user
  on public.positions (user_id);

create index if not exists idx_positions_symbol
  on public.positions (symbol);

alter table public.positions enable row level security;

create policy "positions_service_role" on public.positions
  for all using (true);

create trigger set_positions_updated_at
  before update on public.positions
  for each row execute function public.set_updated_at();
