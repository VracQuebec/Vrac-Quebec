-- NON APPLIQUÉE — à approuver. Additive : une nouvelle table, aucune donnée existante modifiée.
-- Décision par ville sur une combinaison à disponibilité inconnue : « confirmee » ou « exclue ».
-- Une décision ne lance JAMAIS de génération : elle ne fait qu'alimenter la file (après adaptation
-- de seo_city_slots_expected dans une étape distincte, elle aussi à approuver).
CREATE TABLE public.seo_city_slot_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  city_slug text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('material','service')),
  slug text NOT NULL,
  decision text NOT NULL CHECK (decision IN ('confirmee','exclue')),
  reason text NOT NULL CHECK (length(trim(reason)) >= 5),
  decided_by uuid NOT NULL,
  decided_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (city_slug, kind, slug)
);
GRANT SELECT, INSERT, UPDATE ON public.seo_city_slot_decisions TO authenticated;
GRANT ALL ON public.seo_city_slot_decisions TO service_role;
ALTER TABLE public.seo_city_slot_decisions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin lit les décisions" ON public.seo_city_slot_decisions FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY "admin décide" ON public.seo_city_slot_decisions FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(),'admin') AND decided_by = auth.uid());
CREATE POLICY "admin révise" ON public.seo_city_slot_decisions FOR UPDATE TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (decided_by = auth.uid());
-- Retour arrière : DROP TABLE public.seo_city_slot_decisions; (aucune autre table touchée)
