-- Backup immuable des coordonnées avant migration Google Maps
CREATE TABLE IF NOT EXISTS public.submissions_geo_backup (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id uuid NOT NULL,
  submission_number integer,
  address text,
  postal_code text,
  latitude double precision,
  longitude double precision,
  postal_latitude double precision,
  postal_longitude double precision,
  geocoding_status text,
  geocoding_provider text,
  formatted_address text,
  place_id text,
  location_type text,
  backed_up_at timestamptz NOT NULL DEFAULT now(),
  backup_label text NOT NULL DEFAULT 'pre-google-migration'
);

GRANT SELECT ON public.submissions_geo_backup TO authenticated;
GRANT ALL ON public.submissions_geo_backup TO service_role;

ALTER TABLE public.submissions_geo_backup ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read geo backup"
ON public.submissions_geo_backup
FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE INDEX IF NOT EXISTS idx_geo_backup_submission ON public.submissions_geo_backup(submission_id);
CREATE INDEX IF NOT EXISTS idx_geo_backup_label ON public.submissions_geo_backup(backup_label);

-- Snapshot ponctuel de l'état actuel (avant re-géocodage Google)
INSERT INTO public.submissions_geo_backup (
  submission_id, submission_number, address, postal_code,
  latitude, longitude, postal_latitude, postal_longitude,
  geocoding_status, geocoding_provider, formatted_address, place_id, location_type,
  backup_label
)
SELECT
  s.id, s.submission_number, s.address, s.postal_code,
  s.latitude, s.longitude, s.postal_latitude, s.postal_longitude,
  s.geocoding_status, s.geocoding_provider, s.formatted_address, s.place_id, s.location_type,
  'pre-google-migration-' || to_char(now(), 'YYYYMMDD-HH24MI')
FROM public.submissions s
WHERE NOT EXISTS (
  SELECT 1 FROM public.submissions_geo_backup b
  WHERE b.submission_id = s.id AND b.backup_label LIKE 'pre-google-migration%'
);