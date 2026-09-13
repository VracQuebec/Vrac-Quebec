
ALTER TABLE public.submission_accepted_materials
  ADD COLUMN IF NOT EXISTS composition_role text
  CHECK (composition_role IS NULL OR composition_role = ANY (ARRAY['principal','secondaire','trace','inconnu']));

ALTER TABLE public.submission_accepted_materials DROP CONSTRAINT IF EXISTS submission_accepted_materials_source_check;
ALTER TABLE public.submission_accepted_materials
  ADD CONSTRAINT submission_accepted_materials_source_check
  CHECK (source = ANY (ARRAY['historical_selection','historical_alias','explicit_free_text','owner_confirmation','admin_confirmation','imported','other','historical','user_manual','user_assistant','admin_manual','inferred_pending_review']));

CREATE TABLE IF NOT EXISTS public.submission_fill_profile (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id uuid NOT NULL UNIQUE REFERENCES public.submissions(id) ON DELETE CASCADE,
  acceptance_scope text NOT NULL DEFAULT 'unknown'
    CHECK (acceptance_scope = ANY (ARRAY['explicit','broad','unknown'])),
  capacity_kind text NOT NULL DEFAULT 'unknown'
    CHECK (capacity_kind = ANY (ARRAY['known','approximate','unlimited','unknown'])),
  capacity_value numeric,
  capacity_unit text CHECK (capacity_unit IS NULL OR capacity_unit = ANY (ARRAY['voyages','tonnes','verges3','m3'])),
  environment_status text NOT NULL DEFAULT 'UNKNOWN'
    CHECK (environment_status = ANY (ARRAY['UNKNOWN','NOT_CHARACTERIZED','CHARACTERIZED','OTHER'])),
  accepted_truck_codes text[],
  heavy_truck_access text CHECK (heavy_truck_access IS NULL OR heavy_truck_access = ANY (ARRAY['oui','non','inconnu'])),
  access_notes text,
  original_text text,
  source text NOT NULL DEFAULT 'inferred_pending_review'
    CHECK (source = ANY (ARRAY['historical','user_manual','user_assistant','admin_manual','inferred_pending_review'])),
  confidence text CHECK (confidence IS NULL OR confidence = ANY (ARRAY['high','medium','low'])),
  confirmed_by uuid,
  confirmed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.submission_fill_profile TO authenticated;
GRANT ALL ON public.submission_fill_profile TO service_role;

ALTER TABLE public.submission_fill_profile ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage fill profiles"
  ON public.submission_fill_profile FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.submission_fill_profile_touch()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER submission_fill_profile_touch
  BEFORE UPDATE ON public.submission_fill_profile
  FOR EACH ROW EXECUTE FUNCTION public.submission_fill_profile_touch();

CREATE INDEX IF NOT EXISTS idx_submission_fill_profile_scope ON public.submission_fill_profile (acceptance_scope);
