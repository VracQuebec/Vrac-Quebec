-- CRM-02B : verrou court de paiement, pour qu'une entreprise ne puisse pas
-- ouvrir deux paiements simultanés (deux onglets, double clic, deux sessions).
create table if not exists public.platform_checkout_locks (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  environment text not null,
  provider_session_id text,
  created_by uuid,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '15 minutes'
);

create unique index if not exists platform_checkout_locks_uidx
  on public.platform_checkout_locks (company_id, environment);

grant select on public.platform_checkout_locks to authenticated;
grant all on public.platform_checkout_locks to service_role;

alter table public.platform_checkout_locks enable row level security;

create policy "Admins lisent les verrous de paiement"
  on public.platform_checkout_locks for select
  to authenticated
  using (public.has_role(auth.uid(), 'admin'));