-- CRM-01 — Catalogue commercial et paramètres de plateforme (additif, aucune donnée existante touchée)

CREATE TABLE public.platform_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  description text,
  billing_interval text NOT NULL DEFAULT 'month' CHECK (billing_interval IN ('month','year')),
  currency text NOT NULL DEFAULT 'CAD',
  price_cents integer CHECK (price_cents IS NULL OR price_cents >= 0),
  features jsonb NOT NULL DEFAULT '[]'::jsonb,
  audience text NOT NULL DEFAULT 'entreprise' CHECK (audience IN ('entreprise','demandeur')),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','active','archived')),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.platform_plans TO authenticated;
GRANT ALL ON public.platform_plans TO service_role;
ALTER TABLE public.platform_plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins gèrent les forfaits" ON public.platform_plans
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.platform_sectors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  description text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.platform_sectors TO authenticated;
GRANT ALL ON public.platform_sectors TO service_role;
ALTER TABLE public.platform_sectors ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins gèrent les secteurs" ON public.platform_sectors
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Membres lisent les secteurs actifs" ON public.platform_sectors
  FOR SELECT TO authenticated USING (is_active);

CREATE TABLE public.platform_company_sectors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.jsc_companies(id) ON DELETE CASCADE,
  sector_id uuid NOT NULL REFERENCES public.platform_sectors(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, sector_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.platform_company_sectors TO authenticated;
GRANT ALL ON public.platform_company_sectors TO service_role;
ALTER TABLE public.platform_company_sectors ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins gèrent les secteurs des entreprises" ON public.platform_company_sectors
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Membres lisent les secteurs de leur entreprise" ON public.platform_company_sectors
  FOR SELECT TO authenticated USING (public.fleet_can_access(company_id));

CREATE TABLE public.platform_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.jsc_companies(id) ON DELETE CASCADE,
  plan_id uuid NOT NULL REFERENCES public.platform_plans(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','trialing','active','past_due','canceled')),
  amount_cents integer CHECK (amount_cents IS NULL OR amount_cents >= 0),
  currency text NOT NULL DEFAULT 'CAD',
  started_at timestamptz,
  current_period_end timestamptz,
  last_payment_failed_at timestamptz,
  is_test boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.platform_subscriptions TO authenticated;
GRANT ALL ON public.platform_subscriptions TO service_role;
ALTER TABLE public.platform_subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins gèrent les abonnements" ON public.platform_subscriptions
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Membres lisent l'abonnement de leur entreprise" ON public.platform_subscriptions
  FOR SELECT TO authenticated USING (public.fleet_can_access(company_id));
CREATE INDEX idx_platform_subscriptions_company ON public.platform_subscriptions (company_id);
CREATE INDEX idx_platform_subscriptions_status ON public.platform_subscriptions (status);

CREATE TABLE public.platform_change_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope text NOT NULL,
  entity_table text NOT NULL,
  entity_id uuid,
  action text NOT NULL,
  changes jsonb NOT NULL DEFAULT '{}'::jsonb,
  company_id uuid,
  actor_id uuid,
  actor_email text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.platform_change_log TO authenticated;
GRANT ALL ON public.platform_change_log TO service_role;
ALTER TABLE public.platform_change_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins lisent le journal" ON public.platform_change_log
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins écrivent le journal" ON public.platform_change_log
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin') AND actor_id = auth.uid());
CREATE INDEX idx_platform_change_log_created ON public.platform_change_log (created_at DESC);

-- Un forfait incomplet ne peut pas être activé.
CREATE OR REPLACE FUNCTION public.platform_plans_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  IF NEW.status = 'active' THEN
    IF NEW.price_cents IS NULL
       OR coalesce(btrim(NEW.name), '') = ''
       OR coalesce(btrim(NEW.description), '') = ''
       OR jsonb_array_length(coalesce(NEW.features, '[]'::jsonb)) = 0 THEN
      RAISE EXCEPTION 'Forfait incomplet : prix, description et fonctionnalités requis avant activation.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_platform_plans_guard
BEFORE INSERT OR UPDATE ON public.platform_plans
FOR EACH ROW EXECUTE FUNCTION public.platform_plans_guard();

CREATE OR REPLACE FUNCTION public.platform_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_platform_sectors_touch BEFORE UPDATE ON public.platform_sectors
FOR EACH ROW EXECUTE FUNCTION public.platform_touch_updated_at();
CREATE TRIGGER trg_platform_subscriptions_touch BEFORE UPDATE ON public.platform_subscriptions
FOR EACH ROW EXECUTE FUNCTION public.platform_touch_updated_at();