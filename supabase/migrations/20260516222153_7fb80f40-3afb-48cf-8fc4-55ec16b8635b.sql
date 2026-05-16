-- Lead trips / billing table
CREATE TABLE public.lead_trips (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id uuid NOT NULL REFERENCES public.submissions(id) ON DELETE CASCADE,
  entrepreneur_id uuid REFERENCES public.entrepreneurs(id) ON DELETE SET NULL,
  material text NOT NULL DEFAULT '',
  trip_type text NOT NULL DEFAULT 'vrac',
  trips_count numeric NOT NULL DEFAULT 1,
  price_per_trip numeric NOT NULL DEFAULT 0,
  total_price numeric NOT NULL DEFAULT 0,
  delivery_date date,
  invoice_number text NOT NULL DEFAULT '',
  payment_status text NOT NULL DEFAULT 'non_facture',
  payment_date date,
  payment_method text NOT NULL DEFAULT '',
  notes text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_lead_trips_submission ON public.lead_trips(submission_id);
CREATE INDEX idx_lead_trips_status ON public.lead_trips(payment_status);
CREATE INDEX idx_lead_trips_entrepreneur ON public.lead_trips(entrepreneur_id);

ALTER TABLE public.lead_trips ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage lead_trips"
ON public.lead_trips FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER lead_trips_touch_updated_at
BEFORE UPDATE ON public.lead_trips
FOR EACH ROW EXECUTE FUNCTION public.touch_lead_statuses_updated_at();