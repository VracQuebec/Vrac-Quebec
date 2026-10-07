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
  UPDATE crm_notifications SET status = 'done', resolved_at = now() WHERE dedupe_key = 'catalog:'||_id;
END $$;