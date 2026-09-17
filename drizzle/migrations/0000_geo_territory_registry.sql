-- 1. Normalization helper
CREATE OR REPLACE FUNCTION public.geo_normalize(_txt text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT NULLIF(
    regexp_replace(
      regexp_replace(
        lower(translate(coalesce(_txt,''),
          'ÀÁÂÃÄÅàáâãäåÈÉÊËèéêëÌÍÎÏìíîïÒÓÔÕÖòóôõöÙÚÛÜùúûüÇçÑñŒœÆæ',
          'AAAAAAaaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuCcNnOoAa')),
        '[^a-z0-9]+', ' ', 'g'),
      '\s+', ' ', 'g')
  , '')
$$;

-- 2. Central territory registry
CREATE TABLE public.geo_territories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  normalized_name text NOT NULL UNIQUE,
  type text NOT NULL DEFAULT 'municipalite',
  municipality text,
  sector text,
  region text,
  province text NOT NULL DEFAULT 'QC',
  latitude double precision,
  longitude double precision,
  seo_city_slug text,
  status text NOT NULL DEFAULT 'active',
  merged_into_id uuid REFERENCES public.geo_territories(id),
  source text NOT NULL DEFAULT 'crm_submissions',
  request_count integer NOT NULL DEFAULT 0,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT geo_territories_type_chk CHECK (type IN ('municipalite','arrondissement','secteur','mrc','region','inconnu')),
  CONSTRAINT geo_territories_status_chk CHECK (status IN ('active','a_valider','fusionne','refuse','inactif'))
);
CREATE INDEX geo_territories_norm_idx ON public.geo_territories (normalized_name);
CREATE INDEX geo_territories_region_idx ON public.geo_territories (region);

GRANT SELECT, INSERT, UPDATE ON public.geo_territories TO authenticated;
GRANT ALL ON public.geo_territories TO service_role;
ALTER TABLE public.geo_territories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "geo_territories_admin_all" ON public.geo_territories
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));

-- 3. Aliases (name variants)
CREATE TABLE public.geo_territory_aliases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  territory_id uuid NOT NULL REFERENCES public.geo_territories(id) ON DELETE CASCADE,
  alias text NOT NULL,
  normalized_alias text NOT NULL UNIQUE,
  source text NOT NULL DEFAULT 'crm_submissions',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX geo_territory_aliases_territory_idx ON public.geo_territory_aliases (territory_id);
GRANT SELECT, INSERT, UPDATE ON public.geo_territory_aliases TO authenticated;
GRANT ALL ON public.geo_territory_aliases TO service_role;
ALTER TABLE public.geo_territory_aliases ENABLE ROW LEVEL SECURITY;
CREATE POLICY "geo_territory_aliases_admin_all" ON public.geo_territory_aliases
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));

-- 4. Service catalogue (reality-based classification)
CREATE TABLE public.geo_services (
  service_key text PRIMARY KEY,
  label text NOT NULL,
  category text NOT NULL,
  description text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT geo_services_category_chk CHECK (category IN ('A_OFFERT','B_MISE_EN_RELATION','C_CONNEXE','D_EDITORIAL'))
);
GRANT SELECT ON public.geo_services TO authenticated;
GRANT ALL ON public.geo_services TO service_role;
ALTER TABLE public.geo_services ENABLE ROW LEVEL SECURITY;
CREATE POLICY "geo_services_read" ON public.geo_services FOR SELECT TO authenticated USING (true);
CREATE POLICY "geo_services_admin_write" ON public.geo_services FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- 5. Territory x Service matrix
CREATE TABLE public.geo_territory_services (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  territory_id uuid NOT NULL REFERENCES public.geo_territories(id) ON DELETE CASCADE,
  service_key text NOT NULL REFERENCES public.geo_services(service_key) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'A_VALIDER',
  request_count integer NOT NULL DEFAULT 0,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (territory_id, service_key),
  CONSTRAINT geo_territory_services_status_chk CHECK (status IN ('ACTIVE','PARTIELLE','NON_CONFIGUREE','A_VALIDER'))
);
CREATE INDEX geo_territory_services_territory_idx ON public.geo_territory_services (territory_id);
GRANT SELECT, INSERT, UPDATE ON public.geo_territory_services TO authenticated;
GRANT ALL ON public.geo_territory_services TO service_role;
ALTER TABLE public.geo_territory_services ENABLE ROW LEVEL SECURITY;
CREATE POLICY "geo_territory_services_admin_all" ON public.geo_territory_services FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- 6. Queue of new territories to validate
CREATE TABLE public.geo_territory_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  raw_city text NOT NULL,
  normalized_city text NOT NULL UNIQUE,
  request_count integer NOT NULL DEFAULT 1,
  latitude double precision,
  longitude double precision,
  suggested_territory_id uuid REFERENCES public.geo_territories(id),
  status text NOT NULL DEFAULT 'pending',
  resolved_by uuid,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT geo_territory_queue_status_chk CHECK (status IN ('pending','accepted','merged','rejected'))
);
GRANT SELECT, INSERT, UPDATE ON public.geo_territory_queue TO authenticated;
GRANT ALL ON public.geo_territory_queue TO service_role;
ALTER TABLE public.geo_territory_queue ENABLE ROW LEVEL SECURITY;
CREATE POLICY "geo_territory_queue_admin_all" ON public.geo_territory_queue FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- 7. Additive linkage on submissions (original address untouched)
ALTER TABLE public.submissions
  ADD COLUMN IF NOT EXISTS territory_id uuid REFERENCES public.geo_territories(id),
  ADD COLUMN IF NOT EXISTS territory_confidence text,
  ADD COLUMN IF NOT EXISTS territory_status text;
CREATE INDEX IF NOT EXISTS submissions_territory_idx ON public.submissions (territory_id);

-- 8. Resolver: exact normalized name or alias only (never invents a location)
CREATE OR REPLACE FUNCTION public.geo_resolve_territory(_city text)
RETURNS uuid
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT t.id
  FROM public.geo_territories t
  WHERE t.normalized_name = public.geo_normalize(_city)
    AND t.status IN ('active','a_valider')
  UNION ALL
  SELECT a.territory_id
  FROM public.geo_territory_aliases a
  WHERE a.normalized_alias = public.geo_normalize(_city)
  LIMIT 1
$$;

-- 9. Attach new submissions automatically; queue unknown cities
CREATE OR REPLACE FUNCTION public.geo_attach_submission_territory()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_norm text;
  v_id uuid;
BEGIN
  IF NEW.territory_id IS NOT NULL THEN
    RETURN NEW;
  END IF;
  v_norm := public.geo_normalize(NEW.city);
  IF v_norm IS NULL THEN
    NEW.territory_status := 'TERRITOIRE_A_VALIDER';
    NEW.territory_confidence := 'aucune';
    RETURN NEW;
  END IF;
  v_id := public.geo_resolve_territory(NEW.city);
  IF v_id IS NOT NULL THEN
    NEW.territory_id := v_id;
    NEW.territory_status := 'RATTACHE';
    NEW.territory_confidence := 'exacte';
  ELSE
    NEW.territory_status := 'TERRITOIRE_A_VALIDER';
    NEW.territory_confidence := 'aucune';
    INSERT INTO public.geo_territory_queue (raw_city, normalized_city, request_count, latitude, longitude)
    VALUES (trim(NEW.city), v_norm, 1, NEW.latitude, NEW.longitude)
    ON CONFLICT (normalized_city) DO UPDATE
      SET request_count = public.geo_territory_queue.request_count + 1;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_geo_attach_submission_territory ON public.submissions;
CREATE TRIGGER trg_geo_attach_submission_territory
BEFORE INSERT ON public.submissions
FOR EACH ROW EXECUTE FUNCTION public.geo_attach_submission_territory();
