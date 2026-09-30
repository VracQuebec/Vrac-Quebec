-- FIN-05 — Trésorerie, budgets, réserves, scénarios. Aucune écriture sur obligations/règlements.
CREATE TABLE public.fin_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.jsc_companies(id),
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 120),
  kind text NOT NULL DEFAULT 'bank' CHECK (kind IN ('bank','cash','card','credit')),
  currency text NOT NULL DEFAULT 'CAD' CHECK (currency ~ '^[A-Z]{3}$'),
  included boolean NOT NULL DEFAULT true,
  credit_limit numeric(14,2),
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz
);
CREATE TABLE public.fin_balances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.jsc_companies(id),
  account_id uuid NOT NULL REFERENCES public.fin_accounts(id),
  amount numeric(14,2) NOT NULL,
  as_of date NOT NULL,
  source text NOT NULL CHECK (length(trim(source)) BETWEEN 1 AND 200),
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.fin_expected_inflows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.jsc_companies(id),
  account_id uuid REFERENCES public.fin_accounts(id),
  amount numeric(14,2) NOT NULL CHECK (amount > 0),
  received numeric(14,2) NOT NULL DEFAULT 0 CHECK (received >= 0),
  expected_on date NOT NULL,
  counterparty text NOT NULL CHECK (length(trim(counterparty)) BETWEEN 1 AND 200),
  certainty text NOT NULL DEFAULT 'probable' CHECK (certainty IN ('certain','probable','possible')),
  kind text NOT NULL DEFAULT 'revenue' CHECK (kind IN ('revenue','transfer_in','credit')),
  note text,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz
);
CREATE TABLE public.fin_transfers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.jsc_companies(id),
  from_account uuid NOT NULL REFERENCES public.fin_accounts(id),
  to_account uuid NOT NULL REFERENCES public.fin_accounts(id),
  amount numeric(14,2) NOT NULL CHECK (amount > 0),
  planned_on date NOT NULL,
  note text,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz,
  CHECK (from_account <> to_account)
);
CREATE TABLE public.fin_budgets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.jsc_companies(id),
  category_id uuid REFERENCES public.fin_categories(id),
  truck_id uuid REFERENCES public.jsc_trucks(id),
  project_id uuid REFERENCES public.ent_crm_projects(id),
  period_from date NOT NULL,
  period_to date NOT NULL,
  amount numeric(14,2) NOT NULL CHECK (amount >= 0),
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz,
  CHECK (period_to >= period_from)
);
CREATE TABLE public.fin_reserves (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.jsc_companies(id),
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 120),
  kind text NOT NULL DEFAULT 'autre' CHECK (kind IN ('assurance','reparation','autre')),
  target numeric(14,2) NOT NULL CHECK (target > 0),
  reserved numeric(14,2) NOT NULL DEFAULT 0 CHECK (reserved >= 0),
  target_date date NOT NULL,
  obligation_id uuid REFERENCES public.fin_obligations(id),
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz
);
CREATE TABLE public.fin_scenarios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.jsc_companies(id),
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 120),
  hypotheses jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(hypotheses) = 'array'),
  source_hash text,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz
);

DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['fin_accounts','fin_balances','fin_expected_inflows','fin_transfers','fin_budgets','fin_reserves','fin_scenarios'] LOOP
    EXECUTE format('GRANT SELECT, INSERT, UPDATE ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY "fin05 lecture" ON public.%I FOR SELECT TO authenticated USING (public.fin_can_read(company_id))', t);
    EXECUTE format('CREATE POLICY "fin05 ajout" ON public.%I FOR INSERT TO authenticated WITH CHECK (public.fin_can_write(company_id))', t);
    EXECUTE format('CREATE POLICY "fin05 modification" ON public.%I FOR UPDATE TO authenticated USING (public.fin_can_write(company_id)) WITH CHECK (public.fin_can_write(company_id))', t);
    EXECUTE format('CREATE INDEX ON public.%I (company_id)', t);
  END LOOP;
END $$;

-- Cohérence : les références liées appartiennent à la même entreprise (aucune fuite entre entreprises).
CREATE OR REPLACE FUNCTION public.fin05_same_company() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record;
BEGIN
  FOR r IN SELECT * FROM (VALUES
    ('fin_accounts', to_jsonb(NEW)->>'account_id'), ('fin_accounts', to_jsonb(NEW)->>'from_account'), ('fin_accounts', to_jsonb(NEW)->>'to_account'),
    ('fin_categories', to_jsonb(NEW)->>'category_id'), ('jsc_trucks', to_jsonb(NEW)->>'truck_id'),
    ('ent_crm_projects', to_jsonb(NEW)->>'project_id'), ('fin_obligations', to_jsonb(NEW)->>'obligation_id')) v(tbl, rid)
  WHERE rid IS NOT NULL LOOP
    IF NOT EXISTS (SELECT 1 FROM jsonb_to_record((SELECT to_jsonb(x) FROM (SELECT 1) x)) AS d(a int)) THEN NULL; END IF;
    EXECUTE format('SELECT 1 FROM public.%I WHERE id = $1 AND company_id = $2', r.tbl) USING r.rid::uuid, NEW.company_id;
    GET DIAGNOSTICS r.rid = ROW_COUNT;
    IF r.rid::int = 0 THEN RAISE EXCEPTION 'Référence hors entreprise' USING ERRCODE = '42501'; END IF;
  END LOOP;
  IF TG_OP = 'UPDATE' AND NEW.company_id <> OLD.company_id THEN RAISE EXCEPTION 'Entreprise non modifiable' USING ERRCODE = '42501'; END IF;
  RETURN NEW;
END $$;
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['fin_balances','fin_expected_inflows','fin_transfers','fin_budgets','fin_reserves','fin_accounts','fin_scenarios'] LOOP
    EXECUTE format('CREATE TRIGGER fin05_same_company BEFORE INSERT OR UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.fin05_same_company()', t);
  END LOOP;
END $$;