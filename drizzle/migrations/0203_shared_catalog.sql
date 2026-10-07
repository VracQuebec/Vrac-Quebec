CREATE TABLE public.shared_catalog_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN ('supplier','expense_category','unit_category')),
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 2 AND 120),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  source_company_id uuid NOT NULL,
  source_id uuid,
  status text NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed','approved','rejected')),
  proposed_by uuid,
  decided_by uuid,
  decided_at timestamptz,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX shared_catalog_active_name ON public.shared_catalog_items (kind, lower(btrim(name))) WHERE status IN ('proposed','approved');
GRANT SELECT ON public.shared_catalog_items TO authenticated;
GRANT ALL ON public.shared_catalog_items TO service_role;
ALTER TABLE public.shared_catalog_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY sci_read ON public.shared_catalog_items FOR SELECT TO authenticated
  USING (status = 'approved' OR public.has_role(auth.uid(),'admin') OR public.entcrm_role(source_company_id) IS NOT NULL);

-- Équipements personnalisés : privés à l'entreprise jusqu'à approbation
ALTER TABLE public.fleet_unit_categories_custom ADD COLUMN company_id uuid;
ALTER TABLE public.fleet_unit_categories_custom ADD COLUMN status text NOT NULL DEFAULT 'approved' CHECK (status IN ('private','approved'));
ALTER TABLE public.fleet_unit_categories_custom ALTER COLUMN status SET DEFAULT 'private';
DROP INDEX IF EXISTS public.fleet_unit_categories_custom_label_key;
DO $$ DECLARE r record; BEGIN
  FOR r IN SELECT polname FROM pg_policy WHERE polrelid='public.fleet_unit_categories_custom'::regclass LOOP
    EXECUTE format('DROP POLICY %I ON public.fleet_unit_categories_custom', r.polname);
  END LOOP;
END $$;
CREATE POLICY fucc_read ON public.fleet_unit_categories_custom FOR SELECT TO authenticated
  USING (status = 'approved' OR public.has_role(auth.uid(),'admin') OR (company_id IS NOT NULL AND public.entcrm_role(company_id) IS NOT NULL));
CREATE POLICY fucc_insert ON public.fleet_unit_categories_custom FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid() AND status = 'private' AND company_id IS NOT NULL AND public.entcrm_role(company_id) IS NOT NULL);

CREATE OR REPLACE FUNCTION public.catalog_propose(_kind text, _company uuid, _source uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE nm text; pl jsonb := '{}'::jsonb; nid uuid;
BEGIN
  IF public.entcrm_role(_company) IS NULL AND NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Accès refusé' USING ERRCODE='42501'; END IF;
  IF _kind = 'supplier' THEN
    SELECT c.name, jsonb_strip_nulls(jsonb_build_object('phone',c.phone,'city',c.city)) INTO nm, pl
      FROM ent_crm_clients c JOIN fin_supplier_profiles s ON s.client_id = c.id WHERE c.id = _source AND c.company_id = _company;
  ELSIF _kind = 'expense_category' THEN
    SELECT name INTO nm FROM fin_categories WHERE id = _source AND company_id = _company;
  ELSIF _kind = 'unit_category' THEN
    SELECT label, jsonb_build_object('value', value) INTO nm, pl FROM fleet_unit_categories_custom WHERE id = _source AND company_id = _company;
  ELSE RAISE EXCEPTION 'Type inconnu'; END IF;
  IF nm IS NULL THEN RAISE EXCEPTION 'Élément introuvable dans cette entreprise' USING ERRCODE='42501'; END IF;
  SELECT id INTO nid FROM shared_catalog_items WHERE kind = _kind AND lower(btrim(name)) = lower(btrim(nm)) AND status IN ('proposed','approved');
  IF nid IS NOT NULL THEN RETURN nid; END IF;
  INSERT INTO shared_catalog_items(kind,name,payload,source_company_id,source_id,proposed_by)
    VALUES (_kind, btrim(nm), pl, _company, _source, auth.uid()) RETURNING id INTO nid;
  PERFORM public.crm_notify('catalog:'||nid, 'administration', 'catalog_proposal', 'normale',
    'Proposition au catalogue commun : '||btrim(nm), 'Un entrepreneur propose de partager cet élément avec tous.', 'shared_catalog', nid, '/admin/catalogue-commun');
  RETURN nid;
END $$;

CREATE OR REPLACE FUNCTION public.catalog_decide(_id uuid, _approve boolean, _name text DEFAULT NULL, _reason text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r shared_catalog_items;
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Réservé au Super Admin' USING ERRCODE='42501'; END IF;
  SELECT * INTO r FROM shared_catalog_items WHERE id = _id FOR UPDATE;
  IF NOT FOUND OR r.status <> 'proposed' THEN RAISE EXCEPTION 'Proposition déjà traitée ou introuvable'; END IF;
  IF NOT _approve AND coalesce(btrim(_reason),'') = '' THEN RAISE EXCEPTION 'Motif requis pour un refus'; END IF;
  UPDATE shared_catalog_items SET status = CASE WHEN _approve THEN 'approved' ELSE 'rejected' END,
    name = coalesce(nullif(btrim(_name),''), name), decided_by = auth.uid(), decided_at = now(), reason = nullif(btrim(_reason),'')
  WHERE id = _id;
  IF _approve AND r.kind = 'unit_category' THEN
    UPDATE fleet_unit_categories_custom SET status = 'approved', label = coalesce(nullif(btrim(_name),''), label) WHERE id = r.source_id;
  END IF;
  UPDATE crm_notifications SET status = 'resolved', resolved_at = now() WHERE dedupe_key = 'catalog:'||_id;
END $$;

CREATE OR REPLACE FUNCTION public.catalog_adopt(_id uuid, _company uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r shared_catalog_items; ex uuid;
BEGIN
  IF NOT public.fin_can_write(_company) THEN RAISE EXCEPTION 'Accès refusé' USING ERRCODE='42501'; END IF;
  SELECT * INTO r FROM shared_catalog_items WHERE id = _id AND status = 'approved';
  IF NOT FOUND THEN RAISE EXCEPTION 'Élément non approuvé'; END IF;
  IF r.kind = 'supplier' THEN
    SELECT c.id INTO ex FROM ent_crm_clients c JOIN fin_supplier_profiles s ON s.client_id = c.id
      WHERE c.company_id = _company AND lower(btrim(c.name)) = lower(r.name) LIMIT 1;
    IF ex IS NOT NULL THEN RETURN ex; END IF;
    RETURN public.fin_supplier_save(_company, NULL, jsonb_build_object('name', r.name, 'phone', r.payload->>'phone', 'city', r.payload->>'city'));
  ELSIF r.kind = 'expense_category' THEN
    SELECT id INTO ex FROM fin_categories WHERE company_id = _company AND lower(btrim(name)) = lower(r.name) LIMIT 1;
    IF ex IS NOT NULL THEN RETURN ex; END IF;
    INSERT INTO fin_categories(company_id, name, created_by) VALUES (_company, r.name, auth.uid()) RETURNING id INTO ex;
    RETURN ex;
  END IF;
  RAISE EXCEPTION 'Cet élément est déjà disponible pour tous';
END $$;

REVOKE ALL ON FUNCTION public.catalog_propose(text,uuid,uuid), public.catalog_decide(uuid,boolean,text,text), public.catalog_adopt(uuid,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.catalog_propose(text,uuid,uuid), public.catalog_decide(uuid,boolean,text,text), public.catalog_adopt(uuid,uuid) TO authenticated;