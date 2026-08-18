CREATE OR REPLACE FUNCTION public.submissions_fill_site_sheet()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  trucks text[];
  note text;
BEGIN
  -- 1. Camions acceptés : repris de l'accessibilité déclarée par le client.
  IF (NEW.truck_types_allowed IS NULL OR array_length(NEW.truck_types_allowed, 1) IS NULL)
     AND NEW.accessibility IS NOT NULL
     AND array_length(NEW.accessibility, 1) > 0 THEN
    SELECT array_agg(DISTINCT t) INTO trucks
      FROM unnest(NEW.accessibility) AS t
     WHERE coalesce(btrim(t), '') <> '';
    IF trucks IS NOT NULL AND array_length(trucks, 1) > 0 THEN
      NEW.truck_types_allowed := trucks;
    END IF;
  END IF;

  -- 2. Coordonnées du site : repli sur le géocodage par code postal déjà enregistré.
  IF NEW.latitude IS NULL AND NEW.longitude IS NULL
     AND NEW.postal_latitude IS NOT NULL AND NEW.postal_longitude IS NOT NULL THEN
    NEW.latitude := NEW.postal_latitude;
    NEW.longitude := NEW.postal_longitude;
    IF coalesce(btrim(NEW.geocoding_status), '') = '' THEN
      NEW.geocoding_status := 'validated_postal';
    END IF;
  END IF;

  -- 3. Note visible aux entrepreneurs : uniquement des informations réellement fournies.
  IF coalesce(btrim(NEW.availability_note), '') = '' THEN
    note := concat_ws(E'\n',
      nullif(btrim(coalesce(NEW.quantity, '')), ''),
      CASE WHEN NEW.desired_date IS NOT NULL
           THEN 'Date souhaitée : ' || to_char(NEW.desired_date, 'YYYY-MM-DD') END,
      nullif(btrim(coalesce(NEW.delivery_timeframe, '')), '')
    );
    IF coalesce(btrim(coalesce(note, '')), '') <> '' THEN
      NEW.availability_note := note;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS zz_submissions_fill_site_sheet ON public.submissions;
CREATE TRIGGER zz_submissions_fill_site_sheet
BEFORE INSERT OR UPDATE ON public.submissions
FOR EACH ROW EXECUTE FUNCTION public.submissions_fill_site_sheet();