create or replace function public.mkt_partner_is_public(_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.mkt_partners p
    where p.company_id = _company_id and p.is_public and p.is_active and p.archived_at is null
  )
$$;
revoke all on function public.mkt_partner_is_public(uuid) from public;
grant execute on function public.mkt_partner_is_public(uuid) to anon, authenticated;

drop policy if exists "Public reads public photos" on public.mkt_partner_photos;
create policy "Public reads public photos" on public.mkt_partner_photos for select to anon, authenticated
  using (is_public and public.mkt_partner_is_public(company_id));

drop policy if exists "Public reads published reviews" on public.mkt_reviews;
create policy "Public reads published reviews" on public.mkt_reviews for select to anon, authenticated
  using (status = 'publie' and public.mkt_partner_is_public(company_id));

create or replace function public.mkt_partner_public(_company_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select case when public.mkt_partner_is_public(_company_id) then jsonb_build_object(
    'company_id', p.company_id,
    'name', coalesce(nullif(p.trade_name,''), p.legal_name),
    'description', p.description,
    'logo_url', p.logo_url,
    'website', p.website,
    'city', p.city,
    'region', p.region,
    'founded_year', p.founded_year,
    'is_verified', p.is_verified,
    'availability_status', p.availability_status,
    'public_score', case when s.show_public_score then s.public_score else null end,
    'services', coalesce((select jsonb_agg(c.name order by c.sort_order, c.name)
      from public.mkt_partner_services ps
      join public.mkt_service_categories c on c.id = ps.category_id
      where ps.company_id = p.company_id), '[]'::jsonb),
    'territories', coalesce((select jsonb_agg(concat_ws(' — ', nullif(t.city,''), nullif(t.region,'')) order by t.region, t.city)
      from public.mkt_partner_territories t where t.company_id = p.company_id and t.is_active), '[]'::jsonb),
    'photos', coalesce((select jsonb_agg(jsonb_build_object('id', ph.id, 'url', ph.url, 'caption', ph.caption) order by ph.sort_order, ph.created_at)
      from public.mkt_partner_photos ph where ph.company_id = p.company_id and ph.is_public), '[]'::jsonb),
    'reviews', coalesce((select jsonb_agg(jsonb_build_object(
        'id', r.id, 'author_name', r.author_name, 'rating', r.rating,
        'title', r.title, 'comment', r.comment, 'created_at', r.created_at
      ) order by r.created_at desc)
      from public.mkt_reviews r where r.company_id = p.company_id and r.status = 'publie'), '[]'::jsonb),
    'reviews_avg', (select avg(r.rating)::numeric(3,1) from public.mkt_reviews r where r.company_id = p.company_id and r.status = 'publie'),
    'reviews_count', (select count(*) from public.mkt_reviews r where r.company_id = p.company_id and r.status = 'publie')
  ) else null end
  from public.mkt_partners p
  left join public.mkt_partner_scores s on s.company_id = p.company_id
  where p.company_id = _company_id;
$$;
revoke all on function public.mkt_partner_public(uuid) from public;
grant execute on function public.mkt_partner_public(uuid) to anon, authenticated;