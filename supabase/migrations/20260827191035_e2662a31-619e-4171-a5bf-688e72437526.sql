ALTER TABLE public.lead_trips ADD COLUMN IF NOT EXISTS tonnage numeric;

CREATE OR REPLACE FUNCTION public.crm_resolve_lead_trip_deleted()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  PERFORM public.crm_resolve('lead_trip', OLD.id);
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS crm_notify_lead_trip_del ON public.lead_trips;
CREATE TRIGGER crm_notify_lead_trip_del
AFTER DELETE ON public.lead_trips
FOR EACH ROW EXECUTE FUNCTION public.crm_resolve_lead_trip_deleted();