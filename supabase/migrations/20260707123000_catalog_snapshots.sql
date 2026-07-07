create table if not exists public.catalog_snapshots (
  id text primary key,
  status text not null,
  last_synced_at timestamptz,
  duration_ms integer,
  products_count integer not null default 0,
  snapshot jsonb not null,
  updated_at timestamptz not null default now()
);

create index if not exists catalog_snapshots_last_synced_at_idx
  on public.catalog_snapshots(last_synced_at desc);

create index if not exists catalog_snapshots_status_idx
  on public.catalog_snapshots(status);

alter table public.catalog_snapshots enable row level security;

comment on table public.catalog_snapshots is
  'Snapshot consolidado actual del catalogo competitivo usado por busquedas offline, categorias e importaciones Excel.';
