CREATE TABLE public.material_synonyms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  expression text NOT NULL,
  expression_norm text NOT NULL,
  material_keys text[] NOT NULL DEFAULT '{}',
  normalized_material_id uuid NULL REFERENCES public.material_catalog(id) ON DELETE SET NULL,
  normalized_family_id uuid NULL REFERENCES public.material_families(id) ON DELETE SET NULL,
  confidence text NOT NULL DEFAULT 'moyenne',
  region text NOT NULL DEFAULT 'QC',
  language text NOT NULL DEFAULT 'fr',
  is_active boolean NOT NULL DEFAULT true,
  validated_by_admin boolean NOT NULL DEFAULT false,
  notes text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (expression_norm, region, language)
);

GRANT SELECT ON public.material_synonyms TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.material_synonyms TO authenticated;
GRANT ALL ON public.material_synonyms TO service_role;

ALTER TABLE public.material_synonyms ENABLE ROW LEVEL SECURITY;

CREATE POLICY "material_synonyms_read_authenticated"
  ON public.material_synonyms FOR SELECT TO authenticated USING (true);

CREATE POLICY "material_synonyms_admin_write"
  ON public.material_synonyms FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER material_synonyms_touch
  BEFORE UPDATE ON public.material_synonyms
  FOR EACH ROW EXECUTE FUNCTION public.transport_touch_updated_at();