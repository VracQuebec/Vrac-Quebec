CREATE OR REPLACE FUNCTION public.mkt_notify(_audience text, _event text, _title text, _body text DEFAULT NULL, _user_id uuid DEFAULT NULL, _company_id uuid DEFAULT NULL, _request_id uuid DEFAULT NULL, _link text DEFAULT NULL, _level text DEFAULT 'info')
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE nid uuid; prefs record; chans text[] := array['app','email'];
BEGIN
  IF _user_id IS NOT NULL THEN
    SELECT * INTO prefs FROM public.mkt_notification_prefs WHERE user_id = _user_id;
    IF FOUND THEN
      IF _event = ANY(prefs.muted_events) THEN RETURN NULL; END IF;
      chans := array[]::text[];
      IF prefs.app_enabled THEN chans := chans || 'app'; END IF;
      IF prefs.email_enabled THEN chans := chans || 'email'; END IF;
      IF prefs.sms_enabled THEN chans := chans || 'sms'; END IF;
    END IF;
  END IF;
  INSERT INTO public.mkt_notifications (user_id, company_id, audience, event, title, body, level, request_id, link, channels)
  VALUES (_user_id, _company_id, _audience, _event, _title, _body, _level, _request_id, _link, chans)
  RETURNING id INTO nid;
  RETURN nid;
END $fn$;