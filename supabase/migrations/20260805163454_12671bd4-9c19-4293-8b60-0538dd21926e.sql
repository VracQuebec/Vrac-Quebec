
-- 1) Backfill : la grille de prix devient la source unique (mêmes montants)
INSERT INTO public.jsc_material_prices (material_id, unit, purchase_price, selling_price, is_preferred, is_active, company_id)
SELECT m.id, COALESCE(m.unit,'tonne'), 0, m.selling_price, true, true, m.company_id
FROM public.jsc_materials m
WHERE m.archived_at IS NULL AND COALESCE(m.selling_price,0) > 0
  AND NOT EXISTS (
    SELECT 1 FROM public.jsc_material_prices p
    WHERE p.material_id = m.id AND p.is_active AND p.archived_at IS NULL
  );

-- 2) Synchronisation fiche matériau -> grille de prix (aucun autre tarif ailleurs)
CREATE OR REPLACE FUNCTION public.jsc_sync_material_price()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF COALESCE(NEW.selling_price,0) <= 0 THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND COALESCE(OLD.selling_price,0) = COALESCE(NEW.selling_price,0) THEN
    RETURN NEW;
  END IF;

  UPDATE public.jsc_material_prices
     SET selling_price = NEW.selling_price, updated_at = now()
   WHERE material_id = NEW.id AND is_active AND archived_at IS NULL AND is_preferred;

  IF NOT FOUND THEN
    INSERT INTO public.jsc_material_prices (material_id, unit, purchase_price, selling_price, is_preferred, is_active, company_id)
    VALUES (NEW.id, COALESCE(NEW.unit,'tonne'), 0, NEW.selling_price, true, true, NEW.company_id);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS jsc_materials_sync_price ON public.jsc_materials;
CREATE TRIGGER jsc_materials_sync_price
AFTER INSERT OR UPDATE OF selling_price ON public.jsc_materials
FOR EACH ROW EXECUTE FUNCTION public.jsc_sync_material_price();

-- 3) Protection des endpoints publics
CREATE TABLE IF NOT EXISTS public.public_request_guard (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope text NOT NULL,
  identity text NOT NULL,
  fingerprint text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS public_request_guard_lookup
  ON public.public_request_guard (scope, identity, created_at DESC);
CREATE INDEX IF NOT EXISTS public_request_guard_fingerprint
  ON public.public_request_guard (scope, fingerprint, created_at DESC);

GRANT ALL ON public.public_request_guard TO service_role;
ALTER TABLE public.public_request_guard ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can read guard log" ON public.public_request_guard;
CREATE POLICY "Admins can read guard log"
ON public.public_request_guard FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'));
GRANT SELECT ON public.public_request_guard TO authenticated;
