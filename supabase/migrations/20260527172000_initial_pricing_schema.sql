create extension if not exists pgcrypto;

create table if not exists public.price_list_runs (
  id uuid primary key default gen_random_uuid(),
  list_name text not null,
  week_start date,
  status text not null default 'draft'
    check (status in ('draft', 'review', 'approved', 'published', 'archived')),
  searched_at timestamptz not null,
  created_at timestamptz not null default now(),
  duration_ms integer not null default 0,
  items_count integer not null default 0,
  matched_count integer not null default 0,
  unmatched_count integer not null default 0,
  catalog_status text,
  catalog_last_synced_at timestamptz,
  metadata jsonb not null default '{}'::jsonb
);

create table if not exists public.price_list_run_sources (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.price_list_runs(id) on delete cascade,
  source_id text not null,
  store_name text not null,
  store_type text not null check (store_type in ('mayorista', 'minorista')),
  status text not null,
  results_count integer not null default 0,
  duration_ms integer not null default 0,
  source_url text,
  data_origin text,
  source_scope text,
  error_message text,
  created_at timestamptz not null default now()
);

create table if not exists public.price_list_run_items (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.price_list_runs(id) on delete cascade,
  row_number integer not null,
  rubro text,
  description text,
  code text,
  ean13_di text,
  ean13_bu text,
  current_price numeric(14, 2),
  current_cost numeric(14, 2),
  query_used text,
  match_status text not null check (match_status in ('matched', 'not_found')),
  best_price numeric(14, 2),
  best_source_id text,
  best_source_name text,
  best_source_type text check (best_source_type in ('mayorista', 'minorista')),
  best_source_url text,
  best_product_name text,
  best_product_url text,
  best_confidence_score integer,
  margin_percent numeric(8, 2),
  gap_percent numeric(8, 2),
  suggested_price numeric(14, 2),
  decision_status text not null,
  decision_label text not null,
  matched_count integer not null default 0,
  source_prices jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists price_list_runs_week_start_idx
  on public.price_list_runs(week_start desc);

create index if not exists price_list_runs_created_at_idx
  on public.price_list_runs(created_at desc);

create index if not exists price_list_run_sources_run_id_idx
  on public.price_list_run_sources(run_id);

create index if not exists price_list_run_items_run_id_idx
  on public.price_list_run_items(run_id);

create index if not exists price_list_run_items_decision_status_idx
  on public.price_list_run_items(decision_status);

create index if not exists price_list_run_items_rubro_idx
  on public.price_list_run_items(rubro);

alter table public.price_list_runs enable row level security;
alter table public.price_list_run_sources enable row level security;
alter table public.price_list_run_items enable row level security;

comment on table public.price_list_runs is
  'Cada importacion/evaluacion semanal de lista de precios.';
comment on table public.price_list_run_sources is
  'Estado de las fuentes usadas en una corrida de lista de precios.';
comment on table public.price_list_run_items is
  'Resultado y decision sugerida por articulo dentro de una corrida semanal.';
