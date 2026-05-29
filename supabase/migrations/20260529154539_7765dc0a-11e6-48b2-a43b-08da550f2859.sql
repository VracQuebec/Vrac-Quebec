-- Add tax handling to lead_trips
ALTER TABLE public.lead_trips
  ADD COLUMN IF NOT EXISTS taxable boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS tps_rate numeric NOT NULL DEFAULT 0.05,
  ADD COLUMN IF NOT EXISTS tvq_rate numeric NOT NULL DEFAULT 0.09975,
  ADD COLUMN IF NOT EXISTS tps_amount numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tvq_amount numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_with_tax numeric NOT NULL DEFAULT 0;

-- Trigger to keep tax amounts in sync with subtotal (total_price = HT)
CREATE OR REPLACE FUNCTION public.compute_lead_trip_taxes()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  subtotal numeric := COALESCE(NEW.total_price, 0);
BEGIN
  IF NEW.taxable THEN
    NEW.tps_amount := ROUND((subtotal * COALESCE(NEW.tps_rate, 0.05))::numeric, 2);
    NEW.tvq_amount := ROUND((subtotal * COALESCE(NEW.tvq_rate, 0.09975))::numeric, 2);
  ELSE
    NEW.tps_amount := 0;
    NEW.tvq_amount := 0;
  END IF;
  NEW.total_with_tax := ROUND((subtotal + NEW.tps_amount + NEW.tvq_amount)::numeric, 2);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS lead_trips_compute_taxes ON public.lead_trips;
CREATE TRIGGER lead_trips_compute_taxes
BEFORE INSERT OR UPDATE OF total_price, taxable, tps_rate, tvq_rate
ON public.lead_trips
FOR EACH ROW
EXECUTE FUNCTION public.compute_lead_trip_taxes();

-- Backfill existing rows: keep them non-taxable so totals don't change retroactively
UPDATE public.lead_trips
SET total_with_tax = total_price
WHERE total_with_tax = 0 AND total_price <> 0;