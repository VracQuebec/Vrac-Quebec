CREATE TABLE IF NOT EXISTS public.dompe_public_point_backup (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id UUID NOT NULL,
  old_public_latitude DOUBLE PRECISION,
  old_public_longitude DOUBLE PRECISION,
  old_public_point_updated_at TIMESTAMPTZ,
  reason TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT ALL ON public.dompe_public_point_backup TO service_role;
GRANT SELECT ON public.dompe_public_point_backup TO authenticated;

ALTER TABLE public.dompe_public_point_backup ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin read public point backup" ON public.dompe_public_point_backup;
CREATE POLICY "admin read public point backup"
ON public.dompe_public_point_backup
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Ancrage : privilégier la position géocodée de l'adresse, jamais le centre du code postal.
CREATE OR REPLACE FUNCTION public.submissions_set_public_point()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lat double precision;
  v_lng double precision;
  p record;
BEGIN
  v_lat := COALESCE(NEW.latitude, NEW.postal_latitude);
  v_lng := COALESCE(NEW.longitude, NEW.postal_longitude);
  IF v_lat IS NULL OR v_lng IS NULL THEN
    RETURN NEW;
  END IF;
  IF NEW.public_latitude IS NULL OR NEW.public_longitude IS NULL THEN
    SELECT * INTO p FROM public.dompe_public_point(NEW.id, v_lat, v_lng);
    NEW.public_latitude := p.lat;
    NEW.public_longitude := p.lng;
    NEW.public_point_updated_at := now();
  END IF;
  RETURN NEW;
END;
$$;