-- Trigger to auto-set visible_to_entrepreneur based on request_type
CREATE OR REPLACE FUNCTION public.sync_visible_to_entrepreneur()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND NEW.request_type IS DISTINCT FROM OLD.request_type) THEN
    IF NEW.request_type IN ('remblai', 'depot') THEN
      NEW.visible_to_entrepreneur := true;
    ELSIF NEW.request_type = 'vrac' THEN
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

-- Backfill existing rows
UPDATE public.submissions SET visible_to_entrepreneur = true
  WHERE request_type IN ('remblai', 'depot') AND visible_to_entrepreneur IS DISTINCT FROM true;
UPDATE public.submissions SET visible_to_entrepreneur = false
  WHERE request_type = 'vrac' AND visible_to_entrepreneur IS DISTINCT FROM false;