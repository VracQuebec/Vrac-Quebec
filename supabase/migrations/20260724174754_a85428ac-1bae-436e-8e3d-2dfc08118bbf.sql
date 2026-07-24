
-- 1) Fix mutable search_path on _haversine_km
ALTER FUNCTION public._haversine_km(double precision, double precision, double precision, double precision) SET search_path = public;

-- 2) Scope admin policies to authenticated role only
DROP POLICY IF EXISTS "Admins manage seo pages" ON public.seo_pages;
CREATE POLICY "Admins manage seo pages" ON public.seo_pages
  AS PERMISSIVE FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Admins manage seo business metrics" ON public.seo_business_metrics;
CREATE POLICY "Admins manage seo business metrics" ON public.seo_business_metrics
  AS PERMISSIVE FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Admins manage jobs" ON public.seo_generation_jobs;
CREATE POLICY "Admins manage jobs" ON public.seo_generation_jobs
  AS PERMISSIVE FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Admins manage services" ON public.seo_services;
CREATE POLICY "Admins manage services" ON public.seo_services
  AS PERMISSIVE FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Admins manage waves" ON public.seo_waves;
CREATE POLICY "Admins manage waves" ON public.seo_waves
  AS PERMISSIVE FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Admins manage strategic reports" ON public.strategic_reports;
CREATE POLICY "Admins manage strategic reports" ON public.strategic_reports
  AS PERMISSIVE FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- 3) Transport requests: scope the public insert policy to anon+authenticated
--    and enforce input-length validation to blunt PII abuse via the public wizard.
DROP POLICY IF EXISTS "Anyone can create transport request" ON public.transport_requests;
CREATE POLICY "Anyone can create transport request" ON public.transport_requests
  AS PERMISSIVE FOR INSERT TO anon, authenticated
  WITH CHECK (
    status = 'nouvelle'::transport_request_status
    AND assigned_dispatcher IS NULL
    AND driver_id IS NULL
    AND truck_id IS NULL
    AND (internal_notes IS NULL OR internal_notes = '')
    AND (request_number IS NULL OR request_number = '')
    AND (
      (auth.uid() IS NULL AND user_id IS NULL)
      OR (auth.uid() IS NOT NULL AND user_id = auth.uid())
    )
  );

CREATE OR REPLACE FUNCTION public.validate_transport_request_input()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND public.has_role(auth.uid(), 'admin'::app_role) THEN
    RETURN NEW;
  END IF;

  IF NEW.client_name IS NOT NULL AND length(NEW.client_name) > 200 THEN
    RAISE EXCEPTION 'client_name too long';
  END IF;
  IF NEW.client_email IS NOT NULL AND (length(NEW.client_email) > 254 OR NEW.client_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$') THEN
    RAISE EXCEPTION 'invalid client_email';
  END IF;
  IF NEW.client_phone IS NOT NULL AND length(NEW.client_phone) > 40 THEN
    RAISE EXCEPTION 'client_phone too long';
  END IF;
  IF NEW.pickup_address IS NOT NULL AND length(NEW.pickup_address) > 500 THEN
    RAISE EXCEPTION 'pickup_address too long';
  END IF;
  IF NEW.delivery_address IS NOT NULL AND length(NEW.delivery_address) > 500 THEN
    RAISE EXCEPTION 'delivery_address too long';
  END IF;
  IF NEW.project_description IS NOT NULL AND length(NEW.project_description) > 5000 THEN
    RAISE EXCEPTION 'project_description too long';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_transport_request_input ON public.transport_requests;
CREATE TRIGGER trg_validate_transport_request_input
  BEFORE INSERT OR UPDATE ON public.transport_requests
  FOR EACH ROW EXECUTE FUNCTION public.validate_transport_request_input();
