-- CRM-02 : abonnement mensuel en MODE TEST (additif, réversible).
-- Aucune donnée métier existante n'est modifiée.

-- 1) Catalogue : offre technique de test isolée + versionnage
ALTER TABLE public.platform_plans
  ADD COLUMN IF NOT EXISTS is_test boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS provider_price_id text,
  ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS tax_note text;

-- 2) Abonnements : références prestataire, périodes, synchronisation
ALTER TABLE public.platform_subscriptions
  ADD COLUMN IF NOT EXISTS environment text NOT NULL DEFAULT 'sandbox',
  ADD COLUMN IF NOT EXISTS provider text NOT NULL DEFAULT 'stripe',
  ADD COLUMN IF NOT EXISTS provider_customer_id text,
  ADD COLUMN IF NOT EXISTS provider_subscription_id text,
  ADD COLUMN IF NOT EXISTS price_ref text,
  ADD COLUMN IF NOT EXISTS plan_version integer,
  ADD COLUMN IF NOT EXISTS billing_status text,
  ADD COLUMN IF NOT EXISTS billing_email text,
  ADD COLUMN IF NOT EXISTS current_period_start timestamptz,
  ADD COLUMN IF NOT EXISTS cancel_at_period_end boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS cancel_at timestamptz,
  ADD COLUMN IF NOT EXISTS ended_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_synced_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_event_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_error text,
  ADD COLUMN IF NOT EXISTS created_by uuid;

CREATE UNIQUE INDEX IF NOT EXISTS platform_subscriptions_provider_sub_uidx
  ON public.platform_subscriptions (provider_subscription_id)
  WHERE provider_subscription_id IS NOT NULL;

-- Un seul abonnement vivant par entreprise et environnement (anti double-clic).
CREATE UNIQUE INDEX IF NOT EXISTS platform_subscriptions_live_one_uidx
  ON public.platform_subscriptions (company_id, environment)
  WHERE status IN ('trialing','active','past_due','incomplete');

CREATE INDEX IF NOT EXISTS platform_subscriptions_company_idx
  ON public.platform_subscriptions (company_id, environment, created_at DESC);

-- 3) Journal des événements du prestataire (idempotence, ordre, reprise)
CREATE TABLE IF NOT EXISTS public.platform_billing_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL DEFAULT 'stripe',
  environment text NOT NULL,
  provider_event_id text NOT NULL,
  event_type text NOT NULL,
  provider_subscription_id text,
  company_id uuid REFERENCES public.jsc_companies(id) ON DELETE SET NULL,
  event_created_at timestamptz,
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  status text NOT NULL DEFAULT 'received',
  error text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE UNIQUE INDEX IF NOT EXISTS platform_billing_events_uidx
  ON public.platform_billing_events (provider, environment, provider_event_id);

GRANT SELECT ON public.platform_billing_events TO authenticated;
GRANT ALL ON public.platform_billing_events TO service_role;
ALTER TABLE public.platform_billing_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "billing events admin read"
  ON public.platform_billing_events FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "billing events service write"
  ON public.platform_billing_events FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- 4) Décision d'accès centralisée côté serveur
CREATE OR REPLACE FUNCTION public.platform_is_billing_manager(_company_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_role(auth.uid(), 'admin')
      OR EXISTS (
        SELECT 1 FROM public.jsc_company_members m
        WHERE m.company_id = _company_id
          AND m.user_id = auth.uid()
          AND COALESCE(m.is_active, true)
          AND m.archived_at IS NULL
          AND m.role IN ('proprietaire','owner','admin','facturation','comptabilite')
      );
$$;

CREATE OR REPLACE FUNCTION public.platform_is_company_member(_company_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_role(auth.uid(), 'admin')
      OR EXISTS (
        SELECT 1 FROM public.jsc_company_members m
        WHERE m.company_id = _company_id
          AND m.user_id = auth.uid()
          AND COALESCE(m.is_active, true)
          AND m.archived_at IS NULL
      );
$$;

-- Abonnement couvrant : payé et période en cours, ou annulation programmée non échue.
CREATE OR REPLACE FUNCTION public.platform_subscription_covers(_company_id uuid, _environment text DEFAULT 'sandbox')
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.platform_subscriptions s
    WHERE s.company_id = _company_id
      AND s.environment = _environment
      AND (
        (s.status IN ('active','trialing','past_due')
          AND (s.current_period_end IS NULL OR s.current_period_end > now()))
        OR (s.status = 'canceled' AND s.current_period_end > now())
      )
  );
$$;

-- utilisateur autorisé + entreprise + rôle + capacité + droit d'abonnement
CREATE OR REPLACE FUNCTION public.platform_has_capability(
  _company_id uuid, _capability text, _environment text DEFAULT 'sandbox')
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.platform_is_company_member(_company_id)
     AND public.platform_subscription_covers(_company_id, _environment)
     AND EXISTS (
       SELECT 1
       FROM public.platform_subscriptions s
       JOIN public.platform_plans p ON p.id = s.plan_id
       WHERE s.company_id = _company_id
         AND s.environment = _environment
         AND s.status IN ('active','trialing','past_due','canceled')
         AND (s.current_period_end IS NULL OR s.current_period_end > now())
         AND p.features ? _capability
     );
$$;

REVOKE EXECUTE ON FUNCTION public.platform_has_capability(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.platform_has_capability(uuid, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.platform_subscription_covers(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.platform_is_billing_manager(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.platform_is_company_member(uuid) TO authenticated, service_role;

-- 5) Lecture de l'abonnement réservée aux responsables de facturation
CREATE POLICY "subscriptions billing managers read"
  ON public.platform_subscriptions FOR SELECT TO authenticated
  USING (public.platform_is_billing_manager(company_id));
