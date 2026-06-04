
-- Add amount_paid column and auto-generate invoice numbers for lead_trips

ALTER TABLE public.lead_trips
  ADD COLUMN IF NOT EXISTS amount_paid numeric NOT NULL DEFAULT 0;

CREATE SEQUENCE IF NOT EXISTS public.lead_trips_invoice_seq START 1;

CREATE OR REPLACE FUNCTION public.assign_lead_trip_invoice_number()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.invoice_number IS NULL OR btrim(NEW.invoice_number) = '' THEN
    NEW.invoice_number := 'F-' || lpad(nextval('public.lead_trips_invoice_seq')::text, 4, '0');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_lead_trips_invoice_number ON public.lead_trips;
CREATE TRIGGER trg_lead_trips_invoice_number
  BEFORE INSERT ON public.lead_trips
  FOR EACH ROW EXECUTE FUNCTION public.assign_lead_trip_invoice_number();

-- Initialize sequence to be ahead of any existing manually numbered invoices
DO $$
DECLARE max_n int;
BEGIN
  SELECT COALESCE(MAX((regexp_replace(invoice_number, '\D', '', 'g'))::int), 0)
    INTO max_n
  FROM public.lead_trips
  WHERE invoice_number ~ '\d';
  IF max_n > 0 THEN
    PERFORM setval('public.lead_trips_invoice_seq', max_n);
  END IF;
END $$;
