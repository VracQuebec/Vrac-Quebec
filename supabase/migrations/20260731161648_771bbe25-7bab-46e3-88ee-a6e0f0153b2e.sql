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
  IF NEW.client_company IS NOT NULL AND length(NEW.client_company) > 200 THEN
    RAISE EXCEPTION 'client_company too long';
  END IF;
  IF NEW.site_address IS NOT NULL AND length(NEW.site_address) > 500 THEN
    RAISE EXCEPTION 'site_address too long';
  END IF;
  IF NEW.client_notes IS NOT NULL AND length(NEW.client_notes) > 5000 THEN
    RAISE EXCEPTION 'client_notes too long';
  END IF;

  RETURN NEW;
END;
$$;