-- =============================================================================
-- Migration: Graph Relationships + Subscriptions
-- Run AFTER schema.sql (requires public.users and public.set_updated_at)
-- Safe to run on existing databases — uses CREATE IF NOT EXISTS throughout
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Subscriptions
-- Tracks Stripe subscription state per user.
-- Webhook handler keeps this in sync with Stripe events.
-- ---------------------------------------------------------------------------
create table if not exists public.subscriptions (
  id                   bigserial primary key,
  user_id              text not null references public.users(id) on delete cascade,
  stripe_customer_id   text unique,
  stripe_subscription_id text unique,
  status               text not null default 'inactive',
    -- active | inactive | trialing | past_due | canceled | unpaid
  plan                 text not null default 'premium',
  price_id             text,
  current_period_start timestamptz,
  current_period_end   timestamptz,
  cancel_at_period_end boolean default false,
  created_at           timestamptz default now(),
  updated_at           timestamptz default now(),

  constraint subscriptions_user_unique unique (user_id)
);

create index if not exists idx_subscriptions_user
  on public.subscriptions (user_id);

create index if not exists idx_subscriptions_stripe_customer
  on public.subscriptions (stripe_customer_id);

create index if not exists idx_subscriptions_status
  on public.subscriptions (status);

alter table public.subscriptions enable row level security;

-- Drop policies if they exist (makes this script idempotent / re-runnable)
drop policy if exists "subscriptions_service_role" on public.subscriptions;
drop policy if exists "ticker_nodes_read_all" on public.ticker_nodes;
drop policy if exists "ticker_nodes_service_write" on public.ticker_nodes;
drop policy if exists "ticker_edges_read_active" on public.ticker_edges;
drop policy if exists "ticker_edges_service_write" on public.ticker_edges;
drop policy if exists "edge_votes_service_role" on public.ticker_edge_votes;
drop policy if exists "edge_audit_service_role" on public.ticker_edge_audit;

create policy "subscriptions_service_role" on public.subscriptions
  for all using (true);

drop trigger if exists set_subscriptions_updated_at on public.subscriptions;
create trigger set_subscriptions_updated_at
  before update on public.subscriptions
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Ticker nodes
-- One row per publicly traded ticker we know about.
-- Populated on-demand as tickers are looked up.
-- ---------------------------------------------------------------------------
create table if not exists public.ticker_nodes (
  symbol       text primary key,
  name         text,
  sector       text,
  industry     text,
  exchange     text,
  verified     boolean default false,   -- admin has reviewed this node
  created_at   timestamptz default now(),
  updated_at   timestamptz default now()
);

alter table public.ticker_nodes enable row level security;

-- Anyone (including anon) can read nodes — not sensitive
create policy "ticker_nodes_read_all" on public.ticker_nodes
  for select using (true);

-- Only service role can write
create policy "ticker_nodes_service_write" on public.ticker_nodes
  for all using (true);

drop trigger if exists set_ticker_nodes_updated_at on public.ticker_nodes;
create trigger set_ticker_nodes_updated_at
  before update on public.ticker_nodes
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Ticker edges (the graph)
-- Directed relationship from from_symbol → to_symbol.
-- e.g. NVDA →[upstream]→ ASML  means ASML is an upstream supplier of NVDA
-- ---------------------------------------------------------------------------
create table if not exists public.ticker_edges (
  id             bigserial primary key,
  from_symbol    text not null references public.ticker_nodes(symbol),
  to_symbol      text not null references public.ticker_nodes(symbol),
  rel_type       text not null check (rel_type in ('upstream','downstream','peer','adjacent')),
  reason         text,                       -- one-line rationale
  confidence     numeric default 0.6
                   check (confidence >= 0.0 and confidence <= 1.0),
  source         text not null default 'llm'
                   check (source in ('llm','fmp','admin','user')),
  status         text not null default 'active'
                   check (status in ('active','pending','rejected')),
  vote_up        integer default 0,
  vote_down      integer default 0,
  created_by     text,                       -- user_id or 'system'
  reviewed_by    text,                       -- admin user_id
  created_at     timestamptz default now(),
  updated_at     timestamptz default now(),

  constraint ticker_edges_unique unique (from_symbol, to_symbol, rel_type)
);

create index if not exists idx_ticker_edges_from
  on public.ticker_edges (from_symbol, status, confidence desc);

create index if not exists idx_ticker_edges_to
  on public.ticker_edges (to_symbol);

create index if not exists idx_ticker_edges_status
  on public.ticker_edges (status);

alter table public.ticker_edges enable row level security;

create policy "ticker_edges_read_active" on public.ticker_edges
  for select using (status = 'active');

create policy "ticker_edges_service_write" on public.ticker_edges
  for all using (true);

drop trigger if exists set_ticker_edges_updated_at on public.ticker_edges;
create trigger set_ticker_edges_updated_at
  before update on public.ticker_edges
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Edge votes
-- One vote per user per edge. Used to update confidence score.
-- ---------------------------------------------------------------------------
create table if not exists public.ticker_edge_votes (
  id          bigserial primary key,
  edge_id     bigint not null references public.ticker_edges(id) on delete cascade,
  user_id     text not null references public.users(id) on delete cascade,
  vote        smallint not null check (vote in (1, -1)),  -- 1=correct, -1=wrong
  comment     text,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now(),

  constraint one_vote_per_user_per_edge unique (edge_id, user_id)
);

create index if not exists idx_edge_votes_edge
  on public.ticker_edge_votes (edge_id);

create index if not exists idx_edge_votes_user
  on public.ticker_edge_votes (user_id);

alter table public.ticker_edge_votes enable row level security;

create policy "edge_votes_service_role" on public.ticker_edge_votes
  for all using (true);

drop trigger if exists set_edge_votes_updated_at on public.ticker_edge_votes;
create trigger set_edge_votes_updated_at
  before update on public.ticker_edge_votes
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Edge audit log
-- Full history of admin actions on edges.
-- ---------------------------------------------------------------------------
create table if not exists public.ticker_edge_audit (
  id           bigserial primary key,
  edge_id      bigint references public.ticker_edges(id) on delete set null,
  admin_id     text references public.users(id) on delete set null,
  action       text not null,  -- approve|reject|edit|add|reclassify|delete
  old_values   jsonb,
  new_values   jsonb,
  note         text,
  created_at   timestamptz default now()
);

create index if not exists idx_edge_audit_edge
  on public.ticker_edge_audit (edge_id);

create index if not exists idx_edge_audit_admin
  on public.ticker_edge_audit (admin_id);

alter table public.ticker_edge_audit enable row level security;

create policy "edge_audit_service_role" on public.ticker_edge_audit
  for all using (true);

-- ---------------------------------------------------------------------------
-- Confidence update function
-- Called after every vote to recalculate edge confidence.
--
-- Formula:
--   base     = source_base (llm=0.6, fmp=0.75, admin=0.95, user=0.7)
--   adjusted = base + (vote_up * 0.02) - (vote_down * 0.05)
--   clamped  = max(0.05, min(0.98, adjusted))
--   auto-reject if confidence < 0.15 and vote_down >= 5
-- ---------------------------------------------------------------------------
create or replace function public.recalculate_edge_confidence(p_edge_id bigint)
returns void language plpgsql as $$
declare
  v_edge    record;
  v_base    numeric;
  v_conf    numeric;
begin
  select * into v_edge from public.ticker_edges where id = p_edge_id;
  if not found then return; end if;

  -- Source base score
  v_base := case v_edge.source
    when 'admin' then 0.95
    when 'fmp'   then 0.75
    when 'user'  then 0.70
    else              0.60   -- llm
  end;

  -- Apply votes
  v_conf := v_base
    + (v_edge.vote_up   * 0.02)
    - (v_edge.vote_down * 0.05);

  -- Clamp
  v_conf := greatest(0.05, least(0.98, v_conf));

  -- Auto-reject if very low confidence with meaningful votes
  if v_conf < 0.15 and v_edge.vote_down >= 5 then
    update public.ticker_edges
    set confidence = v_conf, status = 'rejected', updated_at = now()
    where id = p_edge_id;
  else
    update public.ticker_edges
    set confidence = v_conf, updated_at = now()
    where id = p_edge_id;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Helper view: admin queue — pending edges and low-confidence active edges
-- ---------------------------------------------------------------------------
create or replace view public.admin_edge_queue as
  select
    e.*,
    fn.name as from_name,
    tn.name as to_name
  from public.ticker_edges e
  left join public.ticker_nodes fn on fn.symbol = e.from_symbol
  left join public.ticker_nodes tn on tn.symbol = e.to_symbol
  where e.status = 'pending'
     or (e.status = 'active' and e.confidence < 0.3 and e.vote_down >= 3)
  order by
    case e.status when 'pending' then 0 else 1 end,
    e.vote_down desc,
    e.confidence asc;
