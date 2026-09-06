-- Photos publiques des entreprises partenaires (URL signée longue durée, comme le blogue)
create table if not exists public.mkt_partner_photos (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.jsc_companies(id) on delete cascade,
  storage_path text not null,
  url text not null,
  caption text,
  sort_order integer not null default 0,
  is_public boolean not null default true,
  uploaded_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);
grant select on public.mkt_partner_photos to anon, authenticated;
grant insert, update, delete on public.mkt_partner_photos to authenticated;
grant all on public.mkt_partner_photos to service_role;
alter table public.mkt_partner_photos enable row level security;
create policy "Public reads public photos" on public.mkt_partner_photos for select to anon, authenticated
  using (is_public and exists (select 1 from public.mkt_partners p where p.company_id = mkt_partner_photos.company_id and p.is_public and p.is_active and p.archived_at is null));
create policy "Members manage photos" on public.mkt_partner_photos for all to authenticated
  using (public.mkt_is_member(company_id) or public.mkt_is_admin())
  with check (public.mkt_is_member(company_id) or public.mkt_is_admin());

-- Avis clients sur les entreprises partenaires
create table if not exists public.mkt_reviews (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.jsc_companies(id) on delete cascade,
  author_user_id uuid not null default auth.uid(),
  author_name text,
  rating integer not null check (rating between 1 and 5),
  title text,
  comment text,
  request_id uuid,
  status text not null default 'publie' check (status in ('publie','masque')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select on public.mkt_reviews to anon, authenticated;
grant insert, update, delete on public.mkt_reviews to authenticated;
grant all on public.mkt_reviews to service_role;
alter table public.mkt_reviews enable row level security;
create policy "Public reads published reviews" on public.mkt_reviews for select to anon, authenticated
  using (status = 'publie' and exists (select 1 from public.mkt_partners p where p.company_id = mkt_reviews.company_id and p.is_public and p.is_active and p.archived_at is null));
create policy "Authors read own reviews" on public.mkt_reviews for select to authenticated
  using (author_user_id = auth.uid() or public.mkt_is_member(company_id) or public.mkt_is_admin());
create policy "Clients create reviews" on public.mkt_reviews for insert to authenticated
  with check (author_user_id = auth.uid());
create policy "Authors edit own reviews" on public.mkt_reviews for update to authenticated
  using (author_user_id = auth.uid()) with check (author_user_id = auth.uid() and status = 'publie');
create policy "Authors delete own reviews" on public.mkt_reviews for delete to authenticated
  using (author_user_id = auth.uid());
create policy "Admins moderate reviews" on public.mkt_reviews for update to authenticated
  using (public.mkt_is_admin()) with check (public.mkt_is_admin());

-- Accès au conteneur privé partner-photos : lecture réservée aux connectés (le public passe par l'URL signée stockée), envoi par les membres
create policy "Authenticated read partner photos" on storage.objects for select to authenticated
  using (bucket_id = 'partner-photos');
create policy "Members upload partner photos" on storage.objects for insert to authenticated
  with check (bucket_id = 'partner-photos' and (public.mkt_is_admin() or public.mkt_is_member((storage.foldername(name))[1]::uuid)));
create policy "Members update partner photos" on storage.objects for update to authenticated
  using (bucket_id = 'partner-photos' and (public.mkt_is_admin() or public.mkt_is_member((storage.foldername(name))[1]::uuid)));
create policy "Members delete partner photos" on storage.objects for delete to authenticated
  using (bucket_id = 'partner-photos' and (public.mkt_is_admin() or public.mkt_is_member((storage.foldername(name))[1]::uuid)));