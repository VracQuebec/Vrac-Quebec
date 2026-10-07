CREATE TABLE public.fleet_unit_categories_custom (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  value text NOT NULL UNIQUE,
  label text NOT NULL CHECK (char_length(btrim(label)) BETWEEN 2 AND 60),
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX fleet_unit_categories_custom_label_uq ON public.fleet_unit_categories_custom (lower(btrim(label)));
GRANT SELECT, INSERT ON public.fleet_unit_categories_custom TO authenticated;
GRANT ALL ON public.fleet_unit_categories_custom TO service_role;
ALTER TABLE public.fleet_unit_categories_custom ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Lecture catégories partagées" ON public.fleet_unit_categories_custom FOR SELECT TO authenticated USING (true);
CREATE POLICY "Ajout catégorie par utilisateur" ON public.fleet_unit_categories_custom FOR INSERT TO authenticated WITH CHECK (created_by = auth.uid());