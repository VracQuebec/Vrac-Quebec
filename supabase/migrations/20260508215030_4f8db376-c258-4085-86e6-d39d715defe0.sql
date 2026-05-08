CREATE OR REPLACE FUNCTION public.sync_visible_to_entrepreneur()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  normalized_request_type text;
BEGIN
  IF TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND NEW.request_type IS DISTINCT FROM OLD.request_type) THEN
    normalized_request_type := lower(trim(coalesce(NEW.request_type, '')));

    IF normalized_request_type IN ('remblai', 'depot', 'dépôt', 'remblai / dépôt', 'remblai / depot', 'matériel à sortir', 'materiel a sortir') THEN
      NEW.visible_to_entrepreneur := true;
    ELSIF normalized_request_type IN ('vrac', 'livraison') THEN
      NEW.visible_to_entrepreneur := false;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS submissions_sync_visible_to_entrepreneur ON public.submissions;
CREATE TRIGGER submissions_sync_visible_to_entrepreneur
BEFORE INSERT OR UPDATE OF request_type ON public.submissions
FOR EACH ROW
EXECUTE FUNCTION public.sync_visible_to_entrepreneur();