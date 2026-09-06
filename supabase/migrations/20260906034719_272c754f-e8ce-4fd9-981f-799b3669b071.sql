-- 1) Vues : passer en security_invoker
ALTER VIEW public.mkt_partners_public SET (security_invoker = true);
ALTER VIEW public.mkt_requests_for_partners SET (security_invoker = true);
ALTER VIEW public.jsc_marketplace_profiles_public SET (security_invoker = true);
ALTER VIEW public.crm_clients_v SET (security_invoker = true);
ALTER VIEW public.seo_gsc_deltas_28d SET (security_invoker = true);
ALTER VIEW public.crm_deals_v SET (security_invoker = true);
ALTER VIEW public.jsc_material_supply_v SET (security_invoker = true);
ALTER VIEW public.crm_carriers_v SET (security_invoker = true);
ALTER VIEW public.seo_bulk_candidates SET (security_invoker = true);
ALTER VIEW public.seo_gsc_ga4_merged_v SET (security_invoker = true);
ALTER VIEW public.seo_recent_jobs_v SET (security_invoker = true);
ALTER VIEW public.crm_dumps_v SET (security_invoker = true);
ALTER VIEW public.seo_page_conversions_30d SET (security_invoker = true);

-- 2) jsc_listings : masquer contact_phone / contact_email pour les anonymes
REVOKE SELECT ON public.jsc_listings FROM anon;
GRANT SELECT (id, company_id, profile_id, created_by, listing_type, title, material_id, material_label, quantity, quantity_unit, price, price_unit, city, region, latitude, longitude, available_from, available_until, description, status, is_active, archived_at, archived_by, created_at, updated_at) ON public.jsc_listings TO anon;

-- 3) user_roles : ne plus approuver par défaut
ALTER TABLE public.user_roles ALTER COLUMN approved SET DEFAULT false;