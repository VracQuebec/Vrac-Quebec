
-- 13. PRIX MATERIAUX + TRANSPORT
CREATE TABLE public.mkt_supply_prices (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  category_id uuid references public.mkt_service_categories(id) on delete set null,
  material_label text not null,
  unit text not null default 'tonne',
  price numeric not null default 0,
  min_fee numeric not null default 0,
  surcharge_percent numeric not null default 0,
  pickup_address text,
  pickup_city text,
  latitude numeric,
  longitude numeric,
  is_taxable boolean not null default true,
  valid_from date,
  valid_until date,
  notes text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.mkt_supply_prices TO authenticated;
GRANT ALL ON public.mkt_supply_prices TO service_role;
ALTER TABLE public.mkt_supply_prices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "supply_prices_admin" ON public.mkt_supply_prices FOR ALL TO authenticated USING (public.mkt_is_admin()) WITH CHECK (public.mkt_is_admin());
CREATE POLICY "supply_prices_member" ON public.mkt_supply_prices FOR ALL TO authenticated USING (public.mkt_is_member(company_id)) WITH CHECK (public.mkt_is_member(company_id));
CREATE TRIGGER mkt_supply_prices_touch BEFORE UPDATE ON public.mkt_supply_prices FOR EACH ROW EXECUTE FUNCTION public.mkt_touch();

CREATE TABLE public.mkt_transport_rates (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  truck_type text not null default '10_roues',
  price_model text not null default 'voyage',
  price numeric not null default 0,
  price_per_km numeric not null default 0,
  min_fee numeric not null default 0,
  surcharge_percent numeric not null default 0,
  capacity_tonnes numeric,
  capacity_verges numeric,
  max_distance_km numeric,
  base_city text,
  latitude numeric,
  longitude numeric,
  valid_from date,
  valid_until date,
  notes text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.mkt_transport_rates TO authenticated;
GRANT ALL ON public.mkt_transport_rates TO service_role;
ALTER TABLE public.mkt_transport_rates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "transport_rates_admin" ON public.mkt_transport_rates FOR ALL TO authenticated USING (public.mkt_is_admin()) WITH CHECK (public.mkt_is_admin());
CREATE POLICY "transport_rates_member" ON public.mkt_transport_rates FOR ALL TO authenticated USING (public.mkt_is_member(company_id)) WITH CHECK (public.mkt_is_member(company_id));
CREATE TRIGGER mkt_transport_rates_touch BEFORE UPDATE ON public.mkt_transport_rates FOR EACH ROW EXECUTE FUNCTION public.mkt_touch();

CREATE TABLE public.mkt_deals (
  id uuid primary key default gen_random_uuid(),
  request_id uuid references public.mkt_quote_requests(id) on delete cascade,
  mode text not null default 'manuel',
  supplier_company_id uuid,
  carrier_company_id uuid,
  supply_price_id uuid references public.mkt_supply_prices(id) on delete set null,
  transport_rate_id uuid references public.mkt_transport_rates(id) on delete set null,
  material_label text,
  quantity numeric,
  unit text default 'tonne',
  truck_type text,
  trips integer,
  distance_km numeric,
  material_cost numeric not null default 0,
  transport_cost numeric not null default 0,
  margin_percent numeric not null default 0,
  margin_amount numeric not null default 0,
  subtotal numeric not null default 0,
  gst numeric not null default 0,
  qst numeric not null default 0,
  total numeric not null default 0,
  breakdown jsonb not null default '{}'::jsonb,
  status text not null default 'brouillon',
  notes text,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.mkt_deals TO authenticated;
GRANT ALL ON public.mkt_deals TO service_role;
ALTER TABLE public.mkt_deals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "deals_admin" ON public.mkt_deals FOR ALL TO authenticated USING (public.mkt_is_admin()) WITH CHECK (public.mkt_is_admin());
CREATE TRIGGER mkt_deals_touch BEFORE UPDATE ON public.mkt_deals FOR EACH ROW EXECUTE FUNCTION public.mkt_touch();

-- 16. NOTIFICATIONS
CREATE TABLE public.mkt_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  company_id uuid,
  audience text not null default 'client',
  event text not null,
  title text not null,
  body text,
  level text not null default 'info',
  request_id uuid references public.mkt_quote_requests(id) on delete cascade,
  link text,
  data jsonb not null default '{}'::jsonb,
  channels text[] not null default array['app']::text[],
  read_at timestamptz,
  created_at timestamptz not null default now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.mkt_notifications TO authenticated;
GRANT ALL ON public.mkt_notifications TO service_role;
ALTER TABLE public.mkt_notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mkt_notifications_admin" ON public.mkt_notifications FOR ALL TO authenticated USING (public.mkt_is_admin()) WITH CHECK (public.mkt_is_admin());
CREATE POLICY "mkt_notifications_own" ON public.mkt_notifications FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.mkt_is_member(company_id));
CREATE POLICY "mkt_notifications_own_update" ON public.mkt_notifications FOR UPDATE TO authenticated USING (user_id = auth.uid() OR public.mkt_is_member(company_id)) WITH CHECK (user_id = auth.uid() OR public.mkt_is_member(company_id));
CREATE INDEX mkt_notifications_user_idx ON public.mkt_notifications(user_id, created_at DESC);

CREATE TABLE public.mkt_notification_prefs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique,
  company_id uuid,
  app_enabled boolean not null default true,
  email_enabled boolean not null default true,
  sms_enabled boolean not null default false,
  muted_events text[] not null default array[]::text[],
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.mkt_notification_prefs TO authenticated;
GRANT ALL ON public.mkt_notification_prefs TO service_role;
ALTER TABLE public.mkt_notification_prefs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mkt_prefs_own" ON public.mkt_notification_prefs FOR ALL TO authenticated USING (user_id = auth.uid() OR public.mkt_is_admin()) WITH CHECK (user_id = auth.uid() OR public.mkt_is_admin());
CREATE TRIGGER mkt_prefs_touch BEFORE UPDATE ON public.mkt_notification_prefs FOR EACH ROW EXECUTE FUNCTION public.mkt_touch();

-- 19. AUTOMATISATIONS
CREATE TABLE public.mkt_automation_rules (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  label text not null,
  description text,
  is_active boolean not null default true,
  delay_hours integer not null default 24,
  max_runs integer not null default 3,
  params jsonb not null default '{}'::jsonb,
  last_run_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.mkt_automation_rules TO authenticated;
GRANT ALL ON public.mkt_automation_rules TO service_role;
ALTER TABLE public.mkt_automation_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mkt_auto_rules_admin" ON public.mkt_automation_rules FOR ALL TO authenticated USING (public.mkt_is_admin()) WITH CHECK (public.mkt_is_admin());
CREATE TRIGGER mkt_auto_rules_touch BEFORE UPDATE ON public.mkt_automation_rules FOR EACH ROW EXECUTE FUNCTION public.mkt_touch();

CREATE TABLE public.mkt_automation_runs (
  id uuid primary key default gen_random_uuid(),
  rule_key text not null,
  request_id uuid references public.mkt_quote_requests(id) on delete cascade,
  company_id uuid,
  action text not null,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
GRANT SELECT, INSERT ON public.mkt_automation_runs TO authenticated;
GRANT ALL ON public.mkt_automation_runs TO service_role;
ALTER TABLE public.mkt_automation_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mkt_auto_runs_admin" ON public.mkt_automation_runs FOR ALL TO authenticated USING (public.mkt_is_admin()) WITH CHECK (public.mkt_is_admin());
CREATE INDEX mkt_auto_runs_idx ON public.mkt_automation_runs(rule_key, request_id, created_at DESC);

INSERT INTO public.mkt_automation_rules (key, label, description, delay_hours, params) VALUES
 ('sans_soumission','Aucune soumission reçue','Invite d''autres entreprises et alerte l''administration lorsqu''une demande distribuée n''a reçu aucune soumission.',48,'{"invite_extra":3}'),
 ('invitation_sans_reponse','Entrepreneur sans réponse','Rappel envoyé à un entrepreneur invité qui n''a pas répondu.',24,'{}'),
 ('soumission_expire','Soumission bientôt expirée','Notification lorsque la validité d''une soumission approche.',48,'{}'),
 ('client_sans_decision','Client sans décision','Relance du client qui a reçu des soumissions sans y répondre.',72,'{}'),
 ('attribution_confirmation','Confirmation d''attribution','Demande de confirmation au client et à l''entreprise après une attribution.',24,'{}'),
 ('projet_termine','Après réalisation','Demande d''évaluation, confirmation du montant final et déclenchement de la commission.',24,'{}');
