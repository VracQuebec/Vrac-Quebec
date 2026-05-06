
CREATE TABLE public.entrepreneurs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL DEFAULT '',
  company text DEFAULT '',
  phone text DEFAULT '',
  email text DEFAULT '',
  address text DEFAULT '',
  truck_types text[] DEFAULT '{}',
  map_number text DEFAULT '',
  truck_count text DEFAULT '',
  notes text DEFAULT '',
  user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.entrepreneurs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage entrepreneurs" ON public.entrepreneurs FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin'::app_role)) WITH CHECK (has_role(auth.uid(),'admin'::app_role));

CREATE TABLE public.payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_date text DEFAULT '',
  map_point text DEFAULT '',
  client_name text DEFAULT '',
  client_phone text DEFAULT '',
  client_email text DEFAULT '',
  client_address text DEFAULT '',
  material text DEFAULT '',
  trips text DEFAULT '',
  price_sold numeric,
  charged_to_entrepreneur numeric,
  total numeric,
  entrepreneur_invoiced text DEFAULT '',
  client_invoiced text DEFAULT '',
  client_payment_date text DEFAULT '',
  client_confirmation text DEFAULT '',
  entrepreneur_payment_date text DEFAULT '',
  entrepreneur_confirmation text DEFAULT '',
  notes text DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage payments" ON public.payments FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin'::app_role)) WITH CHECK (has_role(auth.uid(),'admin'::app_role));

CREATE TABLE public.expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category text DEFAULT 'fournitures',
  expense_date text DEFAULT '',
  company text DEFAULT '',
  invoice_number text DEFAULT '',
  tps numeric,
  tvq numeric,
  fees numeric,
  amount_before_tax numeric,
  amount_total numeric,
  notes text DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage expenses" ON public.expenses FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin'::app_role)) WITH CHECK (has_role(auth.uid(),'admin'::app_role));

CREATE INDEX idx_payments_map_point ON public.payments(map_point);
CREATE INDEX idx_entrepreneurs_email ON public.entrepreneurs(email);
