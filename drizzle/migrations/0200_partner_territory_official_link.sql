ALTER TABLE public.mkt_partner_territories
  ADD COLUMN IF NOT EXISTS territory_id uuid REFERENCES public.geo_territories(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS mkt_partner_territories_territory_idx ON public.mkt_partner_territories(territory_id);
CREATE UNIQUE INDEX IF NOT EXISTS mkt_partner_territories_company_territory_uniq
  ON public.mkt_partner_territories(company_id, territory_id) WHERE territory_id IS NOT NULL;
COMMENT ON COLUMN public.mkt_partner_territories.territory_id IS 'Lien facultatif vers un territoire officiel; city/region texte conservés tels quels.';

CREATE OR REPLACE FUNCTION public.mkt_search_territories(_q text)
RETURNS TABLE(id uuid, name text, type text, municipality text, mrc text, region text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  select g.id, g.name, g.type, g.municipality, g.mrc, g.region
  from public.geo_territories g
  where auth.uid() is not null
    and g.status = 'active'
    and length(trim(coalesce(_q,''))) >= 2
    and (g.name ilike '%' || trim(_q) || '%' or g.normalized_name ilike '%' || lower(trim(_q)) || '%')
  order by (lower(g.name) = lower(trim(_q))) desc, g.name
  limit 20;
$$;
REVOKE ALL ON FUNCTION public.mkt_search_territories(text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.mkt_search_territories(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.mkt_partner_public(_company_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    'territories', coalesce((select jsonb_agg(x.label order by x.label) from (
        select coalesce(g.name, nullif(concat_ws(' — ', nullif(t.city,''), nullif(t.region,'')), '')) as label
        from public.mkt_partner_territories t
        left join public.geo_territories g on g.id = t.territory_id
        where t.company_id = p.company_id and t.is_active) x where x.label is not null), '[]'::jsonb),
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
$function$;