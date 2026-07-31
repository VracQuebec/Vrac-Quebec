ALTER TABLE public.transport_requests ADD COLUMN IF NOT EXISTS jsc_request_id uuid REFERENCES public.jsc_requests(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_transport_requests_jsc_request_id ON public.transport_requests (jsc_request_id);

CREATE OR REPLACE FUNCTION public.jsc_import_transport_request(_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  tr record;
  v_company uuid := public.jsc_default_company_id();
  v_client uuid;
  v_request uuid;
  v_material uuid;
BEGIN
  SELECT * INTO tr FROM public.transport_requests WHERE id = _id;
  IF tr.id IS NULL THEN RETURN NULL; END IF;
  IF tr.jsc_request_id IS NOT NULL THEN RETURN tr.jsc_request_id; END IF;

  SELECT id INTO v_client FROM public.jsc_clients
   WHERE company_id = v_company
     AND ((tr.client_email IS NOT NULL AND lower(email) = lower(tr.client_email))
       OR (tr.client_phone IS NOT NULL AND phone = tr.client_phone))
   LIMIT 1;

  IF v_client IS NULL THEN
    INSERT INTO public.jsc_clients (company_id, name, client_type, contact_name, phone, email, billing_address)
    VALUES (
      v_company,
      COALESCE(NULLIF(tr.client_company, ''), NULLIF(tr.client_name, ''), 'Client sans nom'),
      CASE WHEN COALESCE(tr.client_company, '') <> '' THEN 'entreprise' ELSE 'particulier' END,
      tr.client_name, tr.client_phone, tr.client_email, tr.site_address
    ) RETURNING id INTO v_client;
  END IF;

  SELECT id INTO v_material FROM public.jsc_materials
   WHERE company_id = v_company AND archived_at IS NULL
     AND lower(name) = lower(COALESCE(NULLIF(tr.material_other, ''), tr.material_type, ''))
   LIMIT 1;

  INSERT INTO public.jsc_requests (
    company_id, client_id, source, status, material_id, quantity, quantity_unit,
    delivery_address, city, latitude, longitude, desired_date, notes, internal_notes
  ) VALUES (
    v_company, v_client, COALESCE('legacy:' || tr.source, 'legacy'),
    CASE WHEN tr.status::text IN ('nouvelle','a_rappeler','en_analyse','soumission_envoyee','acceptee','planifiee','terminee','annulee')
         THEN tr.status::text ELSE 'nouvelle' END,
    v_material, tr.quantity, COALESCE(tr.quantity_unit, 'tonne'),
    tr.site_address, tr.site_city, tr.site_latitude, tr.site_longitude,
    tr.desired_date::date, tr.client_notes,
    concat_ws(E'\n', tr.internal_notes,
      'Importé de l''ancien module (' || COALESCE(tr.request_number, tr.id::text) || ')')
  ) RETURNING id INTO v_request;

  UPDATE public.transport_requests SET jsc_request_id = v_request WHERE id = _id;
  RETURN v_request;
END;
$$;

CREATE OR REPLACE FUNCTION public.jsc_bridge_transport_request()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.jsc_import_transport_request(NEW.id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_transport_requests_bridge ON public.transport_requests;
CREATE TRIGGER trg_transport_requests_bridge
  AFTER INSERT ON public.transport_requests
  FOR EACH ROW EXECUTE FUNCTION public.jsc_bridge_transport_request();

REVOKE EXECUTE ON FUNCTION public.jsc_import_transport_request(uuid) FROM anon, authenticated;

COMMENT ON TABLE public.transport_requests IS 'DÉPRÉCIÉ — porte d''entrée héritée. Toute ligne est recopiée dans jsc_requests (modèle officiel unique). Ne plus lire cette table pour le BI.';
COMMENT ON TABLE public.submissions IS 'Domaine distinct « dompes / remblai » (place de marché entrepreneurs). N''est pas un CRM transport : le CRM officiel est jsc_requests.';