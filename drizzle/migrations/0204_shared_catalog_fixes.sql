DROP INDEX IF EXISTS public.fleet_unit_categories_custom_label_uq;
CREATE UNIQUE INDEX fleet_unit_categories_custom_label_company_uq ON public.fleet_unit_categories_custom (coalesce(company_id,'00000000-0000-0000-0000-000000000000'::uuid), lower(btrim(label)));
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
  PERFORM public.crm_notify('catalog:'||nid, 'alerte', 'catalog_proposal', 'normale',
    'Proposition au catalogue commun : '||btrim(nm), 'Un entrepreneur propose de partager cet élément avec tous.', 'shared_catalog', nid, '/admin/catalogue-commun');
  RETURN nid;
END $$;