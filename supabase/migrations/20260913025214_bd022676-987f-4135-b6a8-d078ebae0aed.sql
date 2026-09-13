
-- 1) Vocabulaire de disponibilité élargi (additif : les valeurs existantes restent valides)
DO $$
DECLARE c text;
BEGIN
  FOR c IN SELECT conname FROM pg_constraint
           WHERE conrelid='public.submissions'::regclass AND contype='c'
             AND pg_get_constraintdef(oid) ILIKE '%availability_status%'
  LOOP
    EXECUTE format('ALTER TABLE public.submissions DROP CONSTRAINT %I', c);
  END LOOP;
END $$;

ALTER TABLE public.submissions
  ADD CONSTRAINT submissions_availability_status_check
  CHECK (availability_status IN ('available','limited','unavailable','completed','suspended','owner_closed'));

-- 2) Colonnes additives (jamais concurrentes à availability_status)
ALTER TABLE public.submissions
  ADD COLUMN IF NOT EXISTS availability_confirmed_by uuid,
  ADD COLUMN IF NOT EXISTS availability_source text,
  ADD COLUMN IF NOT EXISTS availability_reason text,
  ADD COLUMN IF NOT EXISTS revalidation_requested_at timestamptz,
  ADD COLUMN IF NOT EXISTS revalidation_days_override integer;

-- 3) Réglages configurables des délais de revalidation
CREATE TABLE IF NOT EXISTS public.dompe_availability_settings (
  key text PRIMARY KEY,
  value_int integer,
  description text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.dompe_availability_settings TO authenticated;
GRANT ALL ON public.dompe_availability_settings TO service_role;
ALTER TABLE public.dompe_availability_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "settings readable by authenticated" ON public.dompe_availability_settings;
CREATE POLICY "settings readable by authenticated" ON public.dompe_availability_settings
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "settings managed by admins" ON public.dompe_availability_settings;
CREATE POLICY "settings managed by admins" ON public.dompe_availability_settings
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

INSERT INTO public.dompe_availability_settings(key, value_int, description) VALUES
  ('revalidation_days_default', 60, 'Délai normal avant revalidation'),
  ('revalidation_days_large_volume', 30, 'Gros volume ou activité importante'),
  ('revalidation_days_unlimited', 90, 'Capacité annoncée très grande ou illimitée'),
  ('revalidation_days_after_delivery', 14, 'Après une livraison connue'),
  ('aging_ratio_percent', 60, 'Pourcentage du délai à partir duquel la confirmation est vieillissante')
ON CONFLICT (key) DO NOTHING;

-- 4) Journal d'audit dédié à la disponibilité
CREATE TABLE IF NOT EXISTS public.submission_availability_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id uuid NOT NULL REFERENCES public.submissions(id) ON DELETE CASCADE,
  old_status text,
  new_status text,
  old_confirmed_at timestamptz,
  new_confirmed_at timestamptz,
  action text NOT NULL DEFAULT 'availability_change',
  source text,
  reason text,
  note text,
  actor_id uuid,
  actor_email text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_avail_log_submission ON public.submission_availability_log(submission_id, created_at DESC);
GRANT SELECT ON public.submission_availability_log TO authenticated;
GRANT ALL ON public.submission_availability_log TO service_role;
ALTER TABLE public.submission_availability_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "availability log readable by admins" ON public.submission_availability_log;
CREATE POLICY "availability log readable by admins" ON public.submission_availability_log
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));

-- 5) Trigger de journalisation (n'écrit jamais dans submissions)
CREATE OR REPLACE FUNCTION public.log_submission_availability()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NEW.availability_status IS DISTINCT FROM OLD.availability_status
     OR NEW.availability_updated_at IS DISTINCT FROM OLD.availability_updated_at
     OR NEW.revalidation_requested_at IS DISTINCT FROM OLD.revalidation_requested_at THEN
    INSERT INTO public.submission_availability_log(
      submission_id, old_status, new_status, old_confirmed_at, new_confirmed_at,
      action, source, reason, note, actor_id, actor_email)
    VALUES (
      NEW.id, OLD.availability_status, NEW.availability_status,
      OLD.availability_updated_at, NEW.availability_updated_at,
      CASE WHEN NEW.revalidation_requested_at IS DISTINCT FROM OLD.revalidation_requested_at
             AND NEW.availability_status IS NOT DISTINCT FROM OLD.availability_status
           THEN 'revalidation_requested' ELSE 'availability_change' END,
      NEW.availability_source, NEW.availability_reason, NEW.availability_note,
      auth.uid(), public.current_user_email());
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_log_submission_availability ON public.submissions;
CREATE TRIGGER trg_log_submission_availability
AFTER UPDATE ON public.submissions
FOR EACH ROW EXECUTE FUNCTION public.log_submission_availability();

-- 6) Protection : une modification CRM seule ne touche jamais la disponibilité
CREATE OR REPLACE FUNCTION public.submissions_touch_availability()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  -- Confirmation explicite (date fournie par une action humaine de confirmation).
  IF NEW.availability_updated_at IS DISTINCT FROM OLD.availability_updated_at THEN
    IF NEW.availability_updated_at IS NOT NULL AND NEW.availability_updated_at > now() THEN
      NEW.availability_updated_at := now();
    END IF;
    RETURN NEW;
  END IF;

  -- Seul un vrai changement de disponibilité met à jour la date de confiance.
  IF NEW.availability_status IS DISTINCT FROM OLD.availability_status THEN
    NEW.availability_updated_at := now();
  END IF;

  -- Un changement de statut CRM ne modifie jamais la disponibilité.
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    NEW.availability_status := OLD.availability_status;
  END IF;

  RETURN NEW;
END $$;

-- 7) Logique centrale : type de demande remblai/dépôt
CREATE OR REPLACE FUNCTION public.is_fill_request_type(_request_type text)
RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
  SELECT lower(trim(coalesce(_request_type,''))) IN
    ('remblai','depot','dépôt','remblai / dépôt','remblai / depot');
$$;

-- 8) Délai applicable à une demande (configurable)
CREATE OR REPLACE FUNCTION public.dompe_revalidation_days(_s public.submissions)
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT COALESCE(
    _s.revalidation_days_override,
    CASE
      WHEN lower(coalesce(_s.remaining_capacity,'')) ~ 'illimit|tr[eè]s grand|sans limite'
        THEN (SELECT value_int FROM public.dompe_availability_settings WHERE key='revalidation_days_unlimited')
      WHEN EXISTS (SELECT 1 FROM public.lead_trips t
                   WHERE t.submission_id = _s.id AND t.created_at > now() - interval '120 days')
        THEN (SELECT value_int FROM public.dompe_availability_settings WHERE key='revalidation_days_after_delivery')
      WHEN COALESCE(NULLIF(regexp_replace(coalesce(_s.tonnage,''), '[^0-9]', '', 'g'),'')::numeric, 0) >= 1000
        THEN (SELECT value_int FROM public.dompe_availability_settings WHERE key='revalidation_days_large_volume')
      ELSE (SELECT value_int FROM public.dompe_availability_settings WHERE key='revalidation_days_default')
    END,
    60);
$$;

-- 9) Fraîcheur calculée (jamais un second statut manuel)
CREATE OR REPLACE FUNCTION public.dompe_freshness(_confirmed_at timestamptz, _days integer, _revalidation_requested_at timestamptz DEFAULT NULL)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT CASE
    WHEN _revalidation_requested_at IS NOT NULL
         AND (_confirmed_at IS NULL OR _confirmed_at < _revalidation_requested_at) THEN 'needs_revalidation'
    WHEN _confirmed_at IS NULL THEN 'unknown'
    WHEN _confirmed_at > now() - make_interval(days => GREATEST(
          1, (COALESCE(_days,60) * COALESCE((SELECT value_int FROM public.dompe_availability_settings WHERE key='aging_ratio_percent'),60)) / 100))
      THEN 'confirmed'
    WHEN _confirmed_at > now() - make_interval(days => COALESCE(_days,60)) THEN 'aging'
    ELSE 'needs_revalidation'
  END;
$$;

-- 10) Définition unique d'une demande de remblai utilisable
CREATE OR REPLACE FUNCTION public.is_usable_fill_request(_s public.submissions, _require_gps boolean DEFAULT true)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT public.is_fill_request_type(_s.request_type)
     AND COALESCE(_s.availability_status,'available') IN ('available','limited')
     AND (NOT _require_gps
          OR (COALESCE(_s.postal_latitude, _s.latitude) IS NOT NULL
              AND COALESCE(_s.postal_longitude, _s.longitude) IS NOT NULL))
     AND NOT public.is_blacklisted('submission', _s.id);
$$;

-- 11) Carte publique : la disponibilité devient la source principale
DROP FUNCTION IF EXISTS public.get_public_dumps();
CREATE OR REPLACE FUNCTION public.get_public_dumps()
RETURNS TABLE(id uuid, submission_number integer, dompe_number text, materials text[],
  latitude double precision, longitude double precision, availability_status text,
  truck_types_allowed text[], opening_hours text, remaining_capacity text,
  accessibility text[], freshness text, availability_updated_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT s.id, s.submission_number, s.dompe_number, s.materials,
    COALESCE(s.postal_latitude, s.latitude),
    COALESCE(s.postal_longitude, s.longitude),
    COALESCE(s.availability_status,'available'),
    s.truck_types_allowed, s.opening_hours, s.remaining_capacity, s.accessibility,
    public.dompe_freshness(s.availability_updated_at, public.dompe_revalidation_days(s), s.revalidation_requested_at),
    s.availability_updated_at
  FROM public.submissions s
  WHERE public.is_usable_fill_request(s, true);
$$;

-- 12) Compteurs SEO alignés sur la même règle
CREATE OR REPLACE FUNCTION public.count_active_dumps_by_city(_city_slug text)
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT COUNT(*)::int FROM public.submissions s
  WHERE lower(regexp_replace(unaccent_string(coalesce(s.city,'')), '[^a-z0-9]+', '-', 'g')) = lower(_city_slug)
    AND public.is_usable_fill_request(s, true);
$$;

-- 13) Espace entrepreneur : même règle centrale + fraîcheur
DROP FUNCTION IF EXISTS public.get_entrepreneur_leads();
CREATE OR REPLACE FUNCTION public.get_entrepreneur_leads()
RETURNS TABLE(id uuid, submission_number integer, dompe_number text, materials text[], other_material text,
  request_type text, property_type text, quantity text, tonnage text, deliver_or_remove text,
  contamination text, status text, priority text, postal_prefix text,
  latitude double precision, longitude double precision, machinery_available boolean,
  machinery_description text, accessibility text[], created_at timestamptz, is_assigned boolean,
  availability_status text, availability_note text, truck_types_allowed text[], opening_hours text,
  remaining_capacity text, availability_updated_at timestamptz, access_heavy_truck text,
  access_details jsonb, freshness text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT s.id, s.submission_number, s.dompe_number, s.materials, s.other_material,
    s.request_type, s.property_type, s.quantity, s.tonnage, s.deliver_or_remove,
    s.contamination, s.status, s.priority,
    LEFT(COALESCE(s.postal_code,''),3),
    COALESCE(s.postal_latitude, s.latitude), COALESCE(s.postal_longitude, s.longitude),
    s.machinery_available, s.machinery_description, s.accessibility, s.created_at,
    (s.assigned_entrepreneur IS NOT NULL),
    COALESCE(s.availability_status,'available'), s.availability_note, s.truck_types_allowed,
    s.opening_hours, s.remaining_capacity, s.availability_updated_at,
    s.access_heavy_truck, s.access_details,
    public.dompe_freshness(s.availability_updated_at, public.dompe_revalidation_days(s), s.revalidation_requested_at)
  FROM public.submissions s
  WHERE public.is_approved_entrepreneur(auth.uid())
    AND public.is_usable_fill_request(s, true);
$$;

-- 14) Action administrative unique (disponibilité + confirmation + journal)
CREATE OR REPLACE FUNCTION public.set_dompe_availability(
  _submission_id uuid, _status text DEFAULT NULL, _confirm boolean DEFAULT false,
  _request_revalidation boolean DEFAULT false, _source text DEFAULT NULL,
  _reason text DEFAULT NULL, _note text DEFAULT NULL)
RETURNS public.submissions LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE row public.submissions;
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;
  IF _status IS NOT NULL AND _status NOT IN ('available','limited','unavailable','completed','suspended','owner_closed') THEN
    RAISE EXCEPTION 'invalid_availability_status';
  END IF;

  UPDATE public.submissions s SET
    availability_status = COALESCE(_status, s.availability_status),
    availability_updated_at = CASE WHEN _confirm THEN now() ELSE s.availability_updated_at END,
    availability_confirmed_by = CASE WHEN _confirm THEN auth.uid() ELSE s.availability_confirmed_by END,
    availability_source = COALESCE(_source, s.availability_source),
    availability_reason = COALESCE(_reason, s.availability_reason),
    availability_note = COALESCE(_note, s.availability_note),
    revalidation_requested_at = CASE WHEN _request_revalidation THEN now()
                                     WHEN _confirm THEN NULL
                                     ELSE s.revalidation_requested_at END
  WHERE s.id = _submission_id
  RETURNING * INTO row;

  IF row.id IS NULL THEN RAISE EXCEPTION 'submission_not_found'; END IF;
  RETURN row;
END $$;

-- 15) File de revalidation priorisée (administration)
CREATE OR REPLACE FUNCTION public.dompe_revalidation_queue(_limit integer DEFAULT 200)
RETURNS TABLE(id uuid, submission_number integer, dompe_number text, city text, status text,
  availability_status text, availability_updated_at timestamptz, freshness text,
  materials text[], tonnage text, remaining_capacity text, cohort text, priority_score integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT s.id, s.submission_number, s.dompe_number, s.city, s.status,
    COALESCE(s.availability_status,'available'),
    s.availability_updated_at,
    public.dompe_freshness(s.availability_updated_at, public.dompe_revalidation_days(s), s.revalidation_requested_at) AS freshness,
    s.materials, s.tonnage, s.remaining_capacity,
    CASE WHEN lower(trim(coalesce(s.status,''))) IN ('perdu','archivé','archive') THEN 'cohorte_perdu_archive'
         WHEN s.availability_updated_at IS NULL THEN 'jamais_confirmee'
         ELSE 'confirmation_ancienne' END AS cohort,
    (CASE WHEN COALESCE(NULLIF(regexp_replace(coalesce(s.tonnage,''),'[^0-9]','','g'),'')::numeric,0) >= 1000 THEN 40 ELSE 0 END
     + LEAST(COALESCE(array_length(s.materials,1),0) * 5, 30)
     + CASE WHEN EXISTS (SELECT 1 FROM public.lead_trips t WHERE t.submission_id = s.id
                          AND t.created_at > now() - interval '120 days') THEN 20 ELSE 0 END
     + CASE WHEN s.created_at > now() - interval '90 days' THEN 10 ELSE 0 END)::int AS priority_score
  FROM public.submissions s
  WHERE public.has_role(auth.uid(),'admin')
    AND public.is_fill_request_type(s.request_type)
    AND public.dompe_freshness(s.availability_updated_at, public.dompe_revalidation_days(s), s.revalidation_requested_at)
        IN ('unknown','needs_revalidation')
  ORDER BY priority_score DESC, s.created_at DESC
  LIMIT COALESCE(_limit, 200);
$$;
