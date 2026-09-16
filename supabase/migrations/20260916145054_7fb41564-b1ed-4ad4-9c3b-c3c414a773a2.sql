-- 1) Demandes ERP Transport JSC
CREATE OR REPLACE FUNCTION public.crm_notify_jsc_request()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_client text;
  v_material text;
BEGIN
  SELECT name INTO v_client FROM public.jsc_clients WHERE id = NEW.client_id;
  SELECT name INTO v_material FROM public.jsc_materials WHERE id = NEW.material_id;

  PERFORM public.crm_notify(
    'jsc_request:new:' || NEW.id::text,
    'lead', 'jsc_request_new', 'importante',
    'Nouvelle demande — ' || coalesce(v_client, 'Client'),
    concat_ws(' · ',
      nullif(coalesce(v_material, ''), ''),
      nullif(concat_ws(' ', NEW.quantity::text, NEW.quantity_unit), ''),
      nullif(coalesce(NEW.city, NEW.delivery_address, ''), ''),
      nullif('Source : ' || coalesce(NEW.source, 'interne'), '')
    ),
    'jsc_request', NEW.id,
    '/admin/jsc?demande=' || NEW.id::text,
    v_client, NEW.request_number, now(),
    jsonb_build_object(
      'source', NEW.source, 'status', NEW.status,
      'city', NEW.city, 'desired_date', NEW.desired_date
    ),
    true
  );
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS crm_notify_jsc_request_t ON public.jsc_requests;
CREATE TRIGGER crm_notify_jsc_request_t
AFTER INSERT ON public.jsc_requests
FOR EACH ROW EXECUTE FUNCTION public.crm_notify_jsc_request();

-- 2) Demandes publiées sur la place de marché (jsc_public_requests)
CREATE OR REPLACE FUNCTION public.crm_notify_jsc_public_request()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_client text;
BEGIN
  SELECT name INTO v_client FROM public.jsc_clients WHERE id = NEW.client_id;

  PERFORM public.crm_notify(
    'jsc_public_request:new:' || NEW.id::text,
    'lead', 'public_request_new', 'importante',
    'Nouvelle demande publique — ' || coalesce(NEW.title, coalesce(v_client, 'Client')),
    concat_ws(' · ',
      nullif(coalesce(NEW.material_label, ''), ''),
      nullif(concat_ws(' ', NEW.quantity::text, NEW.quantity_unit), ''),
      nullif(coalesce(NEW.delivery_city, NEW.delivery_address, ''), '')
    ),
    'jsc_public_request', NEW.id,
    '/admin/jsc?demande_publique=' || NEW.id::text,
    v_client, NULL, now(),
    jsonb_build_object(
      'status', NEW.status, 'visibility', NEW.visibility,
      'city', NEW.delivery_city, 'desired_date', NEW.desired_date
    ),
    true
  );
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS crm_notify_jsc_public_request_t ON public.jsc_public_requests;
CREATE TRIGGER crm_notify_jsc_public_request_t
AFTER INSERT ON public.jsc_public_requests
FOR EACH ROW EXECUTE FUNCTION public.crm_notify_jsc_public_request();

-- 3) Demandes de soumission de la place de marché
CREATE OR REPLACE FUNCTION public.crm_notify_mkt_quote_request()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_category text;
BEGIN
  SELECT name INTO v_category FROM public.mkt_service_categories WHERE id = NEW.category_id;

  PERFORM public.crm_notify(
    'mkt_request:new:' || NEW.id::text,
    'soumission', 'mkt_request_new', 'importante',
    'Nouvelle demande de soumission — ' || coalesce(NEW.organization_name, NEW.contact_name, 'Client'),
    concat_ws(' · ',
      nullif(coalesce(NEW.title, ''), ''),
      nullif(coalesce(v_category, ''), ''),
      nullif(coalesce(NEW.city, NEW.address, ''), '')
    ),
    'mkt_quote_request', NEW.id,
    '/admin/marche/soumissions?demande=' || NEW.id::text,
    coalesce(NEW.organization_name, NEW.contact_name), NEW.request_number, now(),
    jsonb_build_object(
      'status', NEW.status, 'city', NEW.city,
      'phone', NEW.contact_phone, 'email', NEW.contact_email
    ),
    true
  );
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS crm_notify_mkt_quote_request_t ON public.mkt_quote_requests;
CREATE TRIGGER crm_notify_mkt_quote_request_t
AFTER INSERT ON public.mkt_quote_requests
FOR EACH ROW EXECUTE FUNCTION public.crm_notify_mkt_quote_request();

-- 4) Temps réel du centre de notifications
ALTER TABLE public.crm_notifications REPLICA IDENTITY FULL;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'crm_notifications'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.crm_notifications';
  END IF;
END $$;