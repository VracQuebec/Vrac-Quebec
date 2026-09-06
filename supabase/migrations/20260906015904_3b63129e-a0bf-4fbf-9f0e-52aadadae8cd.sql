ALTER TABLE public.mkt_pricing_rules
  ADD COLUMN IF NOT EXISTS scope text NOT NULL DEFAULT 'partenaire',
  ADD COLUMN IF NOT EXISTS subscription_amount numeric,
  ADD COLUMN IF NOT EXISTS credits integer,
  ADD COLUMN IF NOT EXISTS is_default boolean NOT NULL DEFAULT false;

DO $$ BEGIN
  ALTER TABLE public.mkt_pricing_rules ADD CONSTRAINT mkt_pricing_rules_scope_check
    CHECK (scope IN ('partenaire','client','les_deux'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.mkt_commissions
  ADD COLUMN IF NOT EXISTS model text,
  ADD COLUMN IF NOT EXISTS label text,
  ADD COLUMN IF NOT EXISTS contested_at timestamptz,
  ADD COLUMN IF NOT EXISTS invoice_note text;

CREATE TABLE IF NOT EXISTS public.mkt_partner_credits (
  company_id uuid PRIMARY KEY REFERENCES public.jsc_companies(id) ON DELETE CASCADE,
  balance integer NOT NULL DEFAULT 0,
  last_topup_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.mkt_partner_credits TO authenticated;
GRANT ALL ON public.mkt_partner_credits TO service_role;
ALTER TABLE public.mkt_partner_credits ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY mkt_partner_credits_admin ON public.mkt_partner_credits
    FOR ALL TO authenticated USING (public.mkt_is_admin()) WITH CHECK (public.mkt_is_admin());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY mkt_partner_credits_member ON public.mkt_partner_credits
    FOR SELECT TO authenticated USING (public.mkt_is_member(company_id));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Règle applicable : entreprise + catégorie > entreprise > catégorie > globale
CREATE OR REPLACE FUNCTION public.mkt_resolve_pricing_rule(
  _company_id uuid, _category_id uuid DEFAULT NULL, _at date DEFAULT CURRENT_DATE
) RETURNS public.mkt_pricing_rules
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT r.* FROM public.mkt_pricing_rules r
  WHERE r.status = 'actif'
    AND (r.valid_from IS NULL OR r.valid_from <= _at)
    AND (r.valid_until IS NULL OR r.valid_until >= _at)
    AND (r.company_id IS NULL OR r.company_id = _company_id)
    AND (r.category_id IS NULL OR r.category_id = _category_id)
  ORDER BY
    (r.company_id IS NOT NULL)::int * 2 + (r.category_id IS NOT NULL)::int DESC,
    r.priority DESC, r.created_at DESC
  LIMIT 1;
$$;
REVOKE EXECUTE ON FUNCTION public.mkt_resolve_pricing_rule(uuid, uuid, date) FROM anon;

CREATE OR REPLACE FUNCTION public.mkt_compute_commission(_award_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  a public.mkt_awards;
  r public.mkt_pricing_rules;
  cat uuid;
  base numeric;
  montant numeric;
  existing public.mkt_commissions;
BEGIN
  SELECT * INTO a FROM public.mkt_awards WHERE id = _award_id;
  IF a.id IS NULL THEN RETURN NULL; END IF;

  SELECT existing_c.* INTO existing FROM public.mkt_commissions existing_c WHERE existing_c.award_id = a.id LIMIT 1;
  -- jamais rétroactif : une commission déjà facturée ou payée reste intacte
  IF existing.id IS NOT NULL AND existing.status NOT IN ('a_confirmer') THEN
    RETURN existing.id;
  END IF;

  SELECT COALESCE(l.category_id, q.category_id) INTO cat
  FROM public.mkt_quote_requests q
  LEFT JOIN public.mkt_request_lots l ON l.id = a.lot_id
  WHERE q.id = a.request_id;

  r := public.mkt_resolve_pricing_rule(a.company_id, cat, CURRENT_DATE);
  base := COALESCE(a.final_amount, a.amount, 0);

  IF r.id IS NULL THEN
    montant := 0;
  ELSE
    montant := CASE r.model
      WHEN 'commission_pourcentage' THEN base * COALESCE(r.rate_percent, 0) / 100
      WHEN 'marge'                  THEN base * COALESCE(r.rate_percent, 0) / 100
      WHEN 'commission_fixe'        THEN COALESCE(r.fixed_amount, 0)
      WHEN 'frais_par_lead'         THEN COALESCE(r.fixed_amount, 0)
      WHEN 'frais_deblocage'        THEN COALESCE(r.fixed_amount, 0)
      WHEN 'abonnement'             THEN 0
      WHEN 'credits'                THEN 0
      WHEN 'gratuit'                THEN 0
      ELSE COALESCE(r.fixed_amount, base * COALESCE(r.rate_percent, 0) / 100)
    END;
    IF r.min_amount IS NOT NULL AND montant < r.min_amount THEN montant := r.min_amount; END IF;
    IF r.max_amount IS NOT NULL AND montant > r.max_amount THEN montant := r.max_amount; END IF;
  END IF;

  IF existing.id IS NULL THEN
    INSERT INTO public.mkt_commissions (
      award_id, request_id, company_id, rule_id, rule_snapshot, model, label,
      base_amount, amount, status
    ) VALUES (
      a.id, a.request_id, a.company_id, r.id, COALESCE(to_jsonb(r), '{}'::jsonb), r.model, r.label,
      base, ROUND(montant, 2), 'a_confirmer'
    ) RETURNING id INTO existing.id;
  ELSE
    UPDATE public.mkt_commissions SET
      rule_id = r.id, rule_snapshot = COALESCE(to_jsonb(r), '{}'::jsonb),
      model = r.model, label = r.label,
      base_amount = base, amount = ROUND(montant, 2), updated_at = now()
    WHERE id = existing.id;
  END IF;

  RETURN existing.id;
END; $$;
REVOKE EXECUTE ON FUNCTION public.mkt_compute_commission(uuid) FROM anon;

CREATE OR REPLACE FUNCTION public.mkt_award_commission_trg()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.mkt_compute_commission(NEW.id);
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS mkt_awards_commission ON public.mkt_awards;
CREATE TRIGGER mkt_awards_commission
AFTER INSERT OR UPDATE OF amount, final_amount, status ON public.mkt_awards
FOR EACH ROW EXECUTE FUNCTION public.mkt_award_commission_trg();

CREATE OR REPLACE FUNCTION public.mkt_set_commission_status(
  _commission_id uuid, _status text, _note text DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.mkt_is_admin() THEN RAISE EXCEPTION 'Accès refusé'; END IF;
  UPDATE public.mkt_commissions SET
    status = _status,
    invoiced_at = CASE WHEN _status = 'facturee' THEN COALESCE(invoiced_at, now()) ELSE invoiced_at END,
    paid_at = CASE WHEN _status = 'payee' THEN COALESCE(paid_at, now()) ELSE paid_at END,
    contested_at = CASE WHEN _status = 'contestee' THEN now() ELSE contested_at END,
    invoice_note = COALESCE(_note, invoice_note),
    updated_at = now()
  WHERE id = _commission_id;
END; $$;
REVOKE EXECUTE ON FUNCTION public.mkt_set_commission_status(uuid, text, text) FROM anon;

CREATE OR REPLACE FUNCTION public.mkt_commission_board()
RETURNS TABLE (
  id uuid, request_id uuid, request_number text, request_title text,
  company_id uuid, partner_name text, model text, label text,
  base_amount numeric, amount numeric, status text,
  awarded_at timestamptz, invoiced_at timestamptz, paid_at timestamptz, created_at timestamptz
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT c.id, c.request_id, q.request_number, q.title,
         c.company_id, COALESCE(p.trade_name, co.name), c.model, c.label,
         c.base_amount, c.amount, c.status,
         a.awarded_at, c.invoiced_at, c.paid_at, c.created_at
  FROM public.mkt_commissions c
  LEFT JOIN public.mkt_quote_requests q ON q.id = c.request_id
  LEFT JOIN public.mkt_awards a ON a.id = c.award_id
  LEFT JOIN public.mkt_partners p ON p.company_id = c.company_id
  LEFT JOIN public.jsc_companies co ON co.id = c.company_id
  WHERE public.mkt_is_admin()
  ORDER BY c.created_at DESC
  LIMIT 500;
$$;
REVOKE EXECUTE ON FUNCTION public.mkt_commission_board() FROM anon;