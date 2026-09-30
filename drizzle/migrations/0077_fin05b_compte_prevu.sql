-- FIN-05B — Compte de paiement prévu par obligation (table séparée : aucune modification des obligations ni des RPC fin_*).
CREATE TABLE public.fin_obligation_accounts (
  obligation_id uuid PRIMARY KEY REFERENCES public.fin_obligations(id),
  company_id uuid NOT NULL REFERENCES public.jsc_companies(id),
  account_id uuid REFERENCES public.fin_accounts(id),
  archived_at timestamptz,
  updated_by uuid DEFAULT auth.uid(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.fin_obligation_accounts TO authenticated;
GRANT ALL ON public.fin_obligation_accounts TO service_role;
ALTER TABLE public.fin_obligation_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fin05 lecture" ON public.fin_obligation_accounts FOR SELECT TO authenticated USING (public.fin_can_read(company_id));
CREATE POLICY "fin05 ajout" ON public.fin_obligation_accounts FOR INSERT TO authenticated WITH CHECK (public.fin_can_write(company_id));
CREATE POLICY "fin05 modification" ON public.fin_obligation_accounts FOR UPDATE TO authenticated USING (public.fin_can_write(company_id)) WITH CHECK (public.fin_can_write(company_id));
CREATE TRIGGER fin05_same_company BEFORE INSERT OR UPDATE ON public.fin_obligation_accounts FOR EACH ROW EXECUTE FUNCTION public.fin05_same_company();