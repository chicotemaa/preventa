create table if not exists public.source_sessions (
  source_id text primary key,
  store_name text not null,
  store_type text not null check (store_type in ('mayorista', 'minorista')),
  kind text not null default 'cookie' check (kind in ('cookie')),
  cookie jsonb not null,
  user_agent text not null,
  saved_at timestamptz not null,
  updated_at timestamptz not null,
  last_validation jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.source_catalog_snapshots (
  source_id text primary key,
  store_name text not null,
  store_type text not null check (store_type in ('mayorista', 'minorista')),
  source_url text,
  data_origin text,
  source_scope text,
  status text not null,
  synced_at timestamptz not null,
  duration_ms integer not null default 0,
  queries jsonb not null default '[]'::jsonb,
  products_count integer not null default 0,
  private_products_count integer not null default 0,
  visible_price_products_count integer not null default 0,
  errors jsonb not null default '[]'::jsonb,
  products jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

create index if not exists source_sessions_updated_at_idx
  on public.source_sessions(updated_at desc);

create index if not exists source_catalog_snapshots_synced_at_idx
  on public.source_catalog_snapshots(synced_at desc);

create index if not exists source_catalog_snapshots_status_idx
  on public.source_catalog_snapshots(status);

alter table public.source_sessions enable row level security;
alter table public.source_catalog_snapshots enable row level security;

comment on table public.source_sessions is
  'Sesiones server-side de fuentes con catalogos privados. Guardar siempre con service role y cookie cifrada.';

comment on table public.source_catalog_snapshots is
  'Snapshots persistidos de catalogos por fuente para busquedas offline y tableros por categoria.';
