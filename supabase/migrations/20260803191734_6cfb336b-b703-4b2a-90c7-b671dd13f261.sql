ALTER TYPE public.transport_request_status ADD VALUE IF NOT EXISTS 'en_attente_proprietaire';
ALTER TYPE public.transport_request_status ADD VALUE IF NOT EXISTS 'refusee';

ALTER TABLE public.transport_requests
  ADD COLUMN IF NOT EXISTS alternative_dumps jsonb,
  ADD COLUMN IF NOT EXISTS owner_contacted boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS owner_contacted_at timestamptz;

CREATE OR REPLACE FUNCTION public.notify_access_request_created()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.admin_notifications (title, body, level, link, meta)
  VALUES (
    'Nouvelle demande d''accès ' || COALESCE(NEW.request_number, ''),
    COALESCE(NEW.client_name, 'Entrepreneur') ||
      COALESCE(' — ' || NEW.client_company, '') ||
      ' • ' || COALESCE(NEW.material_type, 'matériau') ||
      COALESCE(' • ' || NEW.site_city, ''),
    'info',
    '/admin/demandes-acces',
    jsonb_build_object('request_id', NEW.id, 'request_number', NEW.request_number, 'kind', 'access_request_created')
  );
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_access_request_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.admin_notifications (title, body, level, link, meta)
    VALUES (
      'Demande ' || COALESCE(NEW.request_number, '') || ' : ' || NEW.status::text,
      COALESCE(NEW.client_name, 'Entrepreneur') || ' — statut passé de ' || OLD.status::text || ' à ' || NEW.status::text,
      'info',
      '/admin/demandes-acces',
      jsonb_build_object(
        'request_id', NEW.id,
        'request_number', NEW.request_number,
        'user_id', NEW.user_id,
        'old_status', OLD.status::text,
        'new_status', NEW.status::text,
        'kind', 'access_request_status_changed'
      )
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_access_request_created ON public.transport_requests;
CREATE TRIGGER trg_notify_access_request_created
AFTER INSERT ON public.transport_requests
FOR EACH ROW EXECUTE FUNCTION public.notify_access_request_created();

DROP TRIGGER IF EXISTS trg_notify_access_request_status ON public.transport_requests;
CREATE TRIGGER trg_notify_access_request_status
AFTER UPDATE ON public.transport_requests
FOR EACH ROW EXECUTE FUNCTION public.notify_access_request_status();