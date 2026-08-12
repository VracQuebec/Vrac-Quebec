CREATE OR REPLACE FUNCTION public.submissions_touch_availability()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Confirmation explicite par un administrateur (bouton de confirmation).
  IF NEW.availability_updated_at IS DISTINCT FROM OLD.availability_updated_at THEN
    IF NEW.availability_updated_at IS NOT NULL AND NEW.availability_updated_at > now() THEN
      NEW.availability_updated_at := now();
    END IF;
    RETURN NEW;
  END IF;

  -- Modification réelle d'une information de disponibilité.
  IF NEW.availability_status   IS DISTINCT FROM OLD.availability_status
     OR NEW.availability_note  IS DISTINCT FROM OLD.availability_note
     OR NEW.remaining_capacity IS DISTINCT FROM OLD.remaining_capacity
     OR NEW.opening_hours      IS DISTINCT FROM OLD.opening_hours THEN
    NEW.availability_updated_at := now();
  END IF;

  RETURN NEW;
END;
$function$;