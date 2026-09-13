
ALTER TABLE public.material_catalog
  ADD COLUMN IF NOT EXISTS short_name text,
  ADD COLUMN IF NOT EXISTS subfamily text,
  ADD COLUMN IF NOT EXISTS visible_simple boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS visible_detailed boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS requires_granulometry boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS requires_dimensions boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS requires_qualification boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS destination_types text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS regulatory_level text NOT NULL DEFAULT 'standard',
  ADD COLUMN IF NOT EXISTS legacy_key text,
  ADD COLUMN IF NOT EXISTS search_terms text[] NOT NULL DEFAULT '{}';

ALTER TABLE public.material_catalog
  DROP CONSTRAINT IF EXISTS material_catalog_regulatory_level_check;
ALTER TABLE public.material_catalog
  ADD CONSTRAINT material_catalog_regulatory_level_check
  CHECK (regulatory_level IN ('standard','validation_requise','documentation_requise','non_admissible'));

CREATE TABLE IF NOT EXISTS public.material_granulometries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  label_fr text NOT NULL,
  display_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.material_granulometries TO authenticated;
GRANT SELECT ON public.material_granulometries TO anon;
GRANT ALL ON public.material_granulometries TO service_role;
ALTER TABLE public.material_granulometries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "granulometries readable" ON public.material_granulometries;
CREATE POLICY "granulometries readable" ON public.material_granulometries
  FOR SELECT USING (true);
DROP POLICY IF EXISTS "granulometries admin manage" ON public.material_granulometries;
CREATE POLICY "granulometries admin manage" ON public.material_granulometries
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));

ALTER TABLE public.material_aliases
  ADD COLUMN IF NOT EXISTS granulometry_id uuid REFERENCES public.material_granulometries(id),
  ADD COLUMN IF NOT EXISTS auto_match_allowed boolean NOT NULL DEFAULT false;

ALTER TABLE public.submission_accepted_materials
  ADD COLUMN IF NOT EXISTS granulometry_id uuid REFERENCES public.material_granulometries(id),
  ADD COLUMN IF NOT EXISTS size_min_mm numeric,
  ADD COLUMN IF NOT EXISTS size_max_mm numeric,
  ADD COLUMN IF NOT EXISTS percentage numeric,
  ADD COLUMN IF NOT EXISTS source_field text,
  ADD COLUMN IF NOT EXISTS resolution_method text;

CREATE UNIQUE INDEX IF NOT EXISTS submission_accepted_materials_uniq
  ON public.submission_accepted_materials (
    submission_id, material_id,
    COALESCE(granulometry_id, '00000000-0000-0000-0000-000000000000'::uuid)
  );

ALTER TABLE public.material_review_queue
  ADD COLUMN IF NOT EXISTS reason text,
  ADD COLUMN IF NOT EXISTS context jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE UNIQUE INDEX IF NOT EXISTS material_review_queue_uniq
  ON public.material_review_queue (submission_id, source_field, original_text);

ALTER TABLE public.submission_material_conditions
  ADD COLUMN IF NOT EXISTS regulatory_level text NOT NULL DEFAULT 'standard';

CREATE UNIQUE INDEX IF NOT EXISTS submission_material_conditions_uniq
  ON public.submission_material_conditions (submission_id, condition_key);

ALTER TABLE public.submission_environmental_info
  ADD COLUMN IF NOT EXISTS environmental_status text NOT NULL DEFAULT 'inconnu';
ALTER TABLE public.submission_environmental_info
  DROP CONSTRAINT IF EXISTS submission_environmental_info_status_check;
ALTER TABLE public.submission_environmental_info
  ADD CONSTRAINT submission_environmental_info_status_check
  CHECK (environmental_status IN ('inconnu','non_caracterise','caracterise','autre_statut_reglementaire'));
