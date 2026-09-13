-- ============================================================
-- 1) CONFIDENTIALITÉ : ANNONCES PLACE DE MARCHÉ
-- ============================================================
CREATE OR REPLACE VIEW public.jsc_listings_public AS
SELECT id, title, listing_type, material_label, quantity, quantity_unit,
       price, price_unit, city, region, description, available_from,
       status, created_at, updated_at
FROM public.jsc_listings
WHERE is_active AND status = 'active' AND archived_at IS NULL;

GRANT SELECT ON public.jsc_listings_public TO anon, authenticated, service_role;

DROP POLICY IF EXISTS "Public reads active listings" ON public.jsc_listings;
CREATE POLICY "Authenticated reads active listings"
  ON public.jsc_listings FOR SELECT TO authenticated
  USING (is_active AND status = 'active' AND archived_at IS NULL);

-- ============================================================
-- 2) CONFIDENTIALITÉ : PHOTOS DE PARTENAIRES
-- ============================================================
CREATE OR REPLACE FUNCTION public.mkt_photo_object_is_public(_name text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.mkt_partner_photos p
    WHERE p.storage_path = _name AND p.is_public
  );
$$;

REVOKE ALL ON FUNCTION public.mkt_photo_object_is_public(text) FROM public;
GRANT EXECUTE ON FUNCTION public.mkt_photo_object_is_public(text) TO anon, authenticated, service_role;

DROP POLICY IF EXISTS "Authenticated read partner photos" ON storage.objects;

DROP POLICY IF EXISTS "Public reads public partner photos" ON storage.objects;
CREATE POLICY "Public reads public partner photos"
  ON storage.objects FOR SELECT TO anon, authenticated
  USING (bucket_id = 'partner-photos' AND public.mkt_photo_object_is_public(name));

DROP POLICY IF EXISTS "Members read own partner photos" ON storage.objects;
CREATE POLICY "Members read own partner photos"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'partner-photos' AND public.mkt_can_manage_photo_object(name));

-- ============================================================
-- 3) TAXONOMIE : FAMILLES ET SOUS-FAMILLES (additif, non activé)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.material_families (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id uuid REFERENCES public.material_families(id) ON DELETE RESTRICT,
  code text NOT NULL UNIQUE,
  name_fr text NOT NULL,
  level text NOT NULL DEFAULT 'famille' CHECK (level IN ('famille','sous_famille')),
  description text,
  display_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.material_families TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.material_families TO authenticated;
GRANT ALL ON public.material_families TO service_role;

ALTER TABLE public.material_families ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Everyone reads active material families" ON public.material_families;
CREATE POLICY "Everyone reads active material families"
  ON public.material_families FOR SELECT TO anon, authenticated
  USING (is_active OR public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins manage material families" ON public.material_families;
CREATE POLICY "Admins manage material families"
  ON public.material_families FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP TRIGGER IF EXISTS trg_material_families_updated_at ON public.material_families;
CREATE TRIGGER trg_material_families_updated_at
  BEFORE UPDATE ON public.material_families
  FOR EACH ROW EXECUTE FUNCTION public.material_touch_updated_at();

-- Familles (aucune donnée historique touchée : table neuve)
INSERT INTO public.material_families (code, name_fr, level, display_order) VALUES
  ('TERRE', 'Terres', 'famille', 10),
  ('SABLE', 'Sables', 'famille', 20),
  ('GRANULATS', 'Granulats et pierres', 'famille', 30),
  ('REMBLAI', 'Matériaux de remblai', 'famille', 40),
  ('ROCHE', 'Roches', 'famille', 50),
  ('BETON_MACONNERIE', 'Béton et maçonnerie', 'famille', 60),
  ('ASPHALTE', 'Asphalte', 'famille', 70),
  ('ORGANIQUE', 'Matières organiques', 'famille', 80),
  ('SPECIAUX', 'Matériaux spéciaux', 'famille', 90),
  ('INCONNU', 'À qualifier', 'famille', 999)
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.material_families (parent_id, code, name_fr, level, display_order)
SELECT f.id, v.code, v.name_fr, 'sous_famille', v.display_order
FROM (VALUES
  ('TERRE','TERRE_VEGETALE','Terre végétale',10),
  ('TERRE','TERRE_NOIRE','Terre noire',20),
  ('TERRE','TERRE_REMPLISSAGE','Terre de remplissage',30),
  ('TERRE','TERRE_EXCAVATION','Terre d''excavation',40),
  ('TERRE','TERRE_ARGILEUSE','Terre argileuse',50),
  ('TERRE','TERRE_SABLONNEUSE','Terre sablonneuse',60),
  ('TERRE','TERRE_PIERREUSE','Terre avec petites pierres',70),
  ('TERRE','TERRE_AUTRE','Autres terres',99),
  ('SABLE','SABLE_GENERIQUE','Sable',10),
  ('SABLE','SABLE_NATUREL','Sable naturel',20),
  ('SABLE','SABLE_TAMISE','Sable tamisé',30),
  ('SABLE','SABLE_REMPLISSAGE','Sable de remplissage',40),
  ('SABLE','SABLE_COMPACTION','Sable à compaction',50),
  ('SABLE','SABLE_AUTRE','Autres sables',99),
  ('GRANULATS','GRANULAT_GRAVIER','Gravier',10),
  ('GRANULATS','GRANULAT_PIERRE','Pierre',20),
  ('GRANULATS','GRANULAT_PIERRE_CONCASSEE','Pierre concassée',30),
  ('GRANULATS','GRANULAT_PIERRE_NETTE','Pierre nette',40),
  ('GRANULATS','GRANULAT_MATERIAU_GRANULAIRE','Matériaux granulaires',50),
  ('GRANULATS','GRANULAT_AUTRE','Autres granulats',99),
  ('REMBLAI','REMBLAI_PROPRE','Remblai propre',10),
  ('REMBLAI','REMBLAI_EXCAVATION','Matériaux d''excavation',20),
  ('REMBLAI','REMBLAI_TERRE_PIERRE','Mélange terre/pierre',30),
  ('REMBLAI','REMBLAI_GRANULAIRE','Matériaux granulaires',40),
  ('REMBLAI','REMBLAI_AUTRE','Autres matériaux admissibles',99)
) AS v(parent_code, code, name_fr, display_order)
JOIN public.material_families f ON f.code = v.parent_code AND f.level = 'famille'
ON CONFLICT (code) DO NOTHING;

-- Lien facultatif catalogue -> famille (colonne neuve, nullable)
ALTER TABLE public.material_catalog
  ADD COLUMN IF NOT EXISTS family_id uuid REFERENCES public.material_families(id) ON DELETE SET NULL;

UPDATE public.material_catalog c
SET family_id = f.id
FROM public.material_families f
WHERE f.level = 'famille' AND f.code = c.family AND c.family_id IS NULL;

-- ============================================================
-- 4) PRÉPARATION DU FUTUR MOTEUR DE CORRESPONDANCE (non activé)
-- ============================================================
CREATE OR REPLACE VIEW public.material_matching_candidates AS
SELECT
  s.id               AS submission_id,
  s.city,
  s.latitude,
  s.longitude,
  s.status           AS crm_status,
  s.availability_status,
  s.availability_updated_at,
  public.is_usable_fill_request(s, false) AS is_usable,
  COALESCE(
    array_agg(DISTINCT sam.material_id) FILTER (WHERE sam.material_id IS NOT NULL AND sam.stance = 'accepted'),
    ARRAY[]::uuid[]
  ) AS accepted_material_ids,
  COALESCE(
    array_agg(DISTINCT mc.family) FILTER (WHERE mc.family IS NOT NULL AND sam.stance = 'accepted'),
    ARRAY[]::text[]
  ) AS accepted_families
FROM public.submissions s
LEFT JOIN public.submission_accepted_materials sam ON sam.submission_id = s.id
LEFT JOIN public.material_catalog mc ON mc.id = sam.material_id
WHERE public.is_fill_request_type(s.request_type)
GROUP BY s.id;

REVOKE ALL ON public.material_matching_candidates FROM anon, authenticated;
GRANT SELECT ON public.material_matching_candidates TO service_role;

COMMENT ON VIEW public.material_matching_candidates IS
  'Préparation du futur moteur de correspondance. Non branché aux surfaces publiques. Lecture serveur uniquement.';