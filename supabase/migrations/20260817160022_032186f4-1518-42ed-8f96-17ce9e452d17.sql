CREATE TABLE public.transport_truck_rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  label text NOT NULL,
  price_per_trip numeric(10,2) NOT NULL CHECK (price_per_trip >= 0),
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.transport_truck_rates TO authenticated;
GRANT SELECT ON public.transport_truck_rates TO anon;
GRANT ALL ON public.transport_truck_rates TO service_role;

ALTER TABLE public.transport_truck_rates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tarifs de transport lisibles par tous"
  ON public.transport_truck_rates FOR SELECT USING (true);

CREATE POLICY "Admins gerent les tarifs de transport"
  ON public.transport_truck_rates FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_transport_truck_rates_updated_at
  BEFORE UPDATE ON public.transport_truck_rates
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

INSERT INTO public.transport_truck_rates (code, label, price_per_trip, sort_order) VALUES
  ('traileur', 'Traileur', 35.00, 1),
  ('10_roues', '10 roues', 70.00, 2),
  ('12_roues', '12 roues', 80.00, 3),
  ('semi_2_essieux', 'Semi 2 essieux', 105.00, 4),
  ('semi_3_essieux', 'Semi 3 essieux', 130.00, 5),
  ('semi_4_essieux', 'Semi 4 essieux', 155.00, 6);

CREATE TABLE public.transport_tax_rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  label text NOT NULL,
  rate numeric(8,5) NOT NULL CHECK (rate >= 0 AND rate <= 1),
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.transport_tax_rates TO authenticated;
GRANT SELECT ON public.transport_tax_rates TO anon;
GRANT ALL ON public.transport_tax_rates TO service_role;

ALTER TABLE public.transport_tax_rates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Taux de taxes lisibles par tous"
  ON public.transport_tax_rates FOR SELECT USING (true);

CREATE POLICY "Admins gerent les taux de taxes"
  ON public.transport_tax_rates FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_transport_tax_rates_updated_at
  BEFORE UPDATE ON public.transport_tax_rates
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

INSERT INTO public.transport_tax_rates (code, label, rate, sort_order) VALUES
  ('tps', 'TPS', 0.05000, 1),
  ('tvq', 'TVQ', 0.09975, 2);

ALTER TABLE public.transport_requests
  ADD COLUMN IF NOT EXISTS truck_rate_code text,
  ADD COLUMN IF NOT EXISTS truck_rate_label text,
  ADD COLUMN IF NOT EXISTS truck_rate_per_trip numeric(10,2),
  ADD COLUMN IF NOT EXISTS transport_subtotal numeric(12,2),
  ADD COLUMN IF NOT EXISTS transport_tps_rate numeric(8,5),
  ADD COLUMN IF NOT EXISTS transport_tvq_rate numeric(8,5),
  ADD COLUMN IF NOT EXISTS transport_tps_amount numeric(12,2),
  ADD COLUMN IF NOT EXISTS transport_tvq_amount numeric(12,2),
  ADD COLUMN IF NOT EXISTS transport_total numeric(12,2);