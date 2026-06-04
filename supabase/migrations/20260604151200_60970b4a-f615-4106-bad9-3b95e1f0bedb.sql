-- Lock billing to admins only and add due date support
DROP POLICY IF EXISTS "Entrepreneurs can read their own trips" ON public.lead_trips;

ALTER TABLE public.lead_trips
  ADD COLUMN IF NOT EXISTS due_date date,
  ADD COLUMN IF NOT EXISTS due_days integer NOT NULL DEFAULT 30;

CREATE OR REPLACE FUNCTION public.compute_lead_trip_due_date()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.due_date IS NULL AND NEW.delivery_date IS NOT NULL THEN
    NEW.due_date := (NEW.delivery_date + COALESCE(NEW.due_days, 30))::date;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_lead_trips_due_date ON public.lead_trips;
CREATE TRIGGER trg_lead_trips_due_date
  BEFORE INSERT OR UPDATE OF delivery_date, due_days, due_date ON public.lead_trips
  FOR EACH ROW EXECUTE FUNCTION public.compute_lead_trip_due_date();

-- Backfill due_date for existing rows
UPDATE public.lead_trips
SET due_date = (delivery_date + COALESCE(due_days, 30))::date
WHERE due_date IS NULL AND delivery_date IS NOT NULL;