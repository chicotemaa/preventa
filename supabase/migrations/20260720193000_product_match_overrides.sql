create table if not exists public.product_match_overrides (
  id uuid primary key default gen_random_uuid(),
  input_fingerprint text not null,
  input_description text,
  input_code text,
  input_ean13_di text,
  input_ean13_bu text,
  source_id text not null,
  store_name text not null,
  product_fingerprint text not null,
  product_name text not null,
  product_url text,
  status text not null check (status in ('confirmed', 'rejected')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (input_fingerprint, source_id, product_fingerprint)
);

create index if not exists product_match_overrides_status_idx
  on public.product_match_overrides(status, updated_at desc);

create index if not exists product_match_overrides_source_idx
  on public.product_match_overrides(source_id, updated_at desc);

alter table public.product_match_overrides enable row level security;

comment on table public.product_match_overrides is
  'Decisiones manuales reutilizables para confirmar o rechazar equivalencias de productos.';
