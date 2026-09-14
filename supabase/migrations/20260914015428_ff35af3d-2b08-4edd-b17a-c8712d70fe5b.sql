CREATE TABLE public.qualification_confirmations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id uuid NOT NULL,
  category text NOT NULL,
  subject text NOT NULL,
  previous_value jsonb,
  proposed_value jsonb,
  confirmed_value jsonb,
  decision text NOT NULL CHECK (decision IN ('ACCEPTED','REFUSED','UNKNOWN','CONFIRMED','CORRECTED')),
  source text NOT NULL DEFAULT 'admin_manual',
  confidence_before_confirmation text,
  original_text text,
  supersedes_id uuid REFERENCES public.qualification_confirmations(id),
  note text,
  confirmed_by uuid NOT NULL,
  confirmed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_qualif_conf_submission ON public.qualification_confirmations(submission_id, category, subject, created_at DESC);

GRANT SELECT, INSERT ON public.qualification_confirmations TO authenticated;
GRANT ALL ON public.qualification_confirmations TO service_role;

ALTER TABLE public.qualification_confirmations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read qualification journal"
  ON public.qualification_confirmations FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins append qualification journal"
  ON public.qualification_confirmations FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin') AND confirmed_by = auth.uid());

CREATE OR REPLACE FUNCTION public.qualification_journal_immutable()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'Le journal de qualification est immuable : créez une nouvelle entrée de correction.';
END;
$$;

CREATE TRIGGER qualification_confirmations_no_update
  BEFORE UPDATE OR DELETE ON public.qualification_confirmations
  FOR EACH ROW EXECUTE FUNCTION public.qualification_journal_immutable();

CREATE TABLE public.qualification_term_proposals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  term text NOT NULL,
  term_norm text NOT NULL,
  context text,
  occurrences integer NOT NULL DEFAULT 1,
  proposed_material_key text,
  decision text CHECK (decision IN ('ALIAS_CREATED','ASSOCIATED','LEFT_UNKNOWN')),
  resolved_by uuid,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_qualif_term_norm ON public.qualification_term_proposals(term_norm);

GRANT SELECT, INSERT, UPDATE ON public.qualification_term_proposals TO authenticated;
GRANT ALL ON public.qualification_term_proposals TO service_role;

ALTER TABLE public.qualification_term_proposals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read term proposals"
  ON public.qualification_term_proposals FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins insert term proposals"
  ON public.qualification_term_proposals FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins update term proposals"
  ON public.qualification_term_proposals FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.qualification_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER qualification_term_proposals_touch
  BEFORE UPDATE ON public.qualification_term_proposals
  FOR EACH ROW EXECUTE FUNCTION public.qualification_touch_updated_at();