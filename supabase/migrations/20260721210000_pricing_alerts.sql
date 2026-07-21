create table if not exists public.pricing_alerts (
  id uuid primary key default gen_random_uuid(),
  fingerprint text not null unique,
  type text not null check (
    type in (
      'source_unavailable',
      'catalog_stale',
      'price_above_wholesale',
      'margin_opportunity',
      'missing_own_price',
      'retail_below_wholesale'
    )
  ),
  severity text not null check (severity in ('critical', 'warning', 'info')),
  status text not null default 'new' check (status in ('new', 'reviewed', 'resolved')),
  title text not null,
  message text not null,
  source_id text,
  product_key text,
  product_name text,
  category text,
  own_price numeric,
  reference_price numeric,
  gap_percent numeric,
  metadata jsonb not null default '{}'::jsonb,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists pricing_alerts_status_idx
  on public.pricing_alerts(status, severity, last_seen_at desc);

create index if not exists pricing_alerts_type_idx
  on public.pricing_alerts(type, last_seen_at desc);

create index if not exists pricing_alerts_category_idx
  on public.pricing_alerts(category, last_seen_at desc);

alter table public.pricing_alerts enable row level security;

comment on table public.pricing_alerts is
  'Alertas comerciales deduplicadas generadas despues de cada actualizacion diaria del catalogo.';
