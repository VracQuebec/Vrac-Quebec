-- Add manual lead creation fields to submissions
ALTER TABLE public.submissions
  ADD COLUMN IF NOT EXISTS lead_source text,
  ADD COLUMN IF NOT EXISTS lead_category text,
  ADD COLUMN IF NOT EXISTS company text,
  ADD COLUMN IF NOT EXISTS city text,
  ADD COLUMN IF NOT EXISTS province text DEFAULT 'QC',
  ADD COLUMN IF NOT EXISTS desired_date date,
  ADD COLUMN IF NOT EXISTS created_by uuid,
  ADD COLUMN IF NOT EXISTS creation_origin text NOT NULL DEFAULT 'public_form';

CREATE INDEX IF NOT EXISTS idx_submissions_lead_source ON public.submissions(lead_source);
CREATE INDEX IF NOT EXISTS idx_submissions_creation_origin ON public.submissions(creation_origin);
CREATE INDEX IF NOT EXISTS idx_submissions_phone ON public.submissions(phone);
CREATE INDEX IF NOT EXISTS idx_submissions_email ON public.submissions(email);

-- Update trigger to also force-reset new manual fields for non-admin (public) inserts
CREATE OR REPLACE FUNCTION public.enforce_submission_insert_defaults()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NOT NULL AND public.has_role(auth.uid(), 'admin'::app_role) THEN
    RETURN NEW;
  END IF;

  NEW.status := 'nouveau';
  NEW.priority := 'normal';
  NEW.internal_notes := '';
  NEW.dompe_number := '';
  NEW.visible_to_entrepreneur := false;
  NEW.show_on_admin_map := true;
  NEW.assigned_entrepreneur := NULL;
  NEW.geocoding_status := 'pending';
  NEW.geocoding_provider := 'nominatim';
  NEW.formatted_address := NULL;
  NEW.place_id := NULL;
  NEW.location_type := NULL;
  NEW.latitude := NULL;
  NEW.longitude := NULL;
  NEW.postal_latitude := NULL;
  NEW.postal_longitude := NULL;
  NEW.latitude_old := NULL;
  NEW.longitude_old := NULL;
  NEW.postal_latitude_old := NULL;
  NEW.postal_longitude_old := NULL;
  -- Manual-creation fields: never trust public input
  NEW.creation_origin := 'public_form';
  NEW.created_by := NULL;
  NEW.lead_source := NULL;
  NEW.lead_category := NULL;

  RETURN NEW;
END;
$function$;
