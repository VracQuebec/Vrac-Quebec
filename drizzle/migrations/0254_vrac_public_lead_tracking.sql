ALTER TABLE public.submissions
  ADD COLUMN IF NOT EXISTS public_lead_token uuid,
  ADD COLUMN IF NOT EXISTS quote_calc_status text,
  ADD COLUMN IF NOT EXISTS quote_calc_error text,
  ADD COLUMN IF NOT EXISTS quote_calc_at timestamptz,
  ADD COLUMN IF NOT EXISTS quote_client_decision text,
  ADD COLUMN IF NOT EXISTS quote_decision_at timestamptz,
  ADD COLUMN IF NOT EXISTS form_answers jsonb;
CREATE UNIQUE INDEX IF NOT EXISTS submissions_public_lead_token_key ON public.submissions(public_lead_token) WHERE public_lead_token IS NOT NULL;
ALTER TABLE public.submissions ADD CONSTRAINT submissions_quote_calc_status_check
  CHECK (quote_calc_status IS NULL OR quote_calc_status IN ('en_cours','calculee','echec','manuel'));
ALTER TABLE public.submissions ADD CONSTRAINT submissions_quote_client_decision_check
  CHECK (quote_client_decision IS NULL OR quote_client_decision IN ('en_attente','acceptee','refusee','rappel'));
COMMENT ON COLUMN public.submissions.public_lead_token IS 'Jeton secret du parcours public achat vrac : une seule demande par parcours (mises à jour sans doublon). Écrit seulement par quote-submit.';
COMMENT ON COLUMN public.submissions.quote_calc_status IS 'Résultat du calcul automatique, distinct du statut de suivi CRM (status).';
COMMENT ON COLUMN public.submissions.quote_client_decision IS 'Décision du client sur la soumission, distincte du statut CRM. Une demande de prix n''est jamais une acceptation.';