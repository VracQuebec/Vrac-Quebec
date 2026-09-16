CREATE OR REPLACE FUNCTION public.mkt_notify(
  _audience text, _event text, _title text, _body text DEFAULT NULL::text,
  _user_id uuid DEFAULT NULL::uuid, _company_id uuid DEFAULT NULL::uuid,
  _request_id uuid DEFAULT NULL::uuid, _link text DEFAULT NULL::text,
  _level text DEFAULT 'info'::text, _dedupe_key text DEFAULT NULL::text,
  _data jsonb DEFAULT '{}'::jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
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
  INSERT INTO public.mkt_notifications (user_id, company_id, audience, event, title, body, level, request_id, link, channels, dedupe_key, data)
  VALUES (_user_id, _company_id, _audience, _event, _title, _body, _level, _request_id, _link, chans, _dedupe_key, coalesce(_data,'{}'::jsonb))
  ON CONFLICT (dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING
  RETURNING id INTO nid;
  RETURN nid;
END $function$;

REVOKE ALL ON FUNCTION public.mkt_notify(text,text,text,text,uuid,uuid,uuid,text,text,text,jsonb) FROM public, anon, authenticated;

CREATE OR REPLACE FUNCTION public.entr_notify_transport_request()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE lnk text; ctx text; st text; meta jsonb;
BEGIN
  IF NEW.user_id IS NULL THEN RETURN NEW; END IF;
  lnk := '/entrepreneur/demandes?demande=' || NEW.id::text;
  ctx := nullif(concat_ws(' — ', nullif(NEW.request_number,''), nullif(NEW.material_type,''), nullif(NEW.site_city,'')), '');
  meta := jsonb_build_object('source','transport_request','request_id',NEW.id,'request_number',NEW.request_number);

  IF TG_OP = 'INSERT' THEN
    PERFORM public.mkt_notify('client','demande_recue','Votre demande a été reçue',
      ctx, NEW.user_id, NULL, NULL, lnk, 'info', 'entr:tr:recue:'||NEW.id::text, meta);
    RETURN NEW;
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    st := public.entr_status_label(NEW.status::text);
    PERFORM public.mkt_notify('client','demande_statut',
      CASE NEW.status::text
        WHEN 'acceptee' THEN 'Votre demande a été acceptée'
        WHEN 'refusee' THEN 'Votre demande a été refusée'
        WHEN 'soumission_envoyee' THEN 'Votre soumission est disponible'
        WHEN 'terminee' THEN 'Votre demande est complétée'
        WHEN 'annulee' THEN 'Votre demande a été annulée'
        ELSE 'Mise à jour de votre demande'
      END,
      concat_ws(' · ', 'Nouveau statut : '||st, ctx),
      NEW.user_id, NULL, NULL, lnk,
      CASE WHEN NEW.status::text IN ('refusee','annulee') THEN 'alerte'
           WHEN NEW.status::text IN ('acceptee','terminee') THEN 'succes' ELSE 'info' END,
      'entr:tr:statut:'||NEW.id::text||':'||NEW.status::text, meta);
  END IF;

  IF NEW.assigned_dispatcher IS NOT NULL AND OLD.assigned_dispatcher IS NULL THEN
    PERFORM public.mkt_notify('client','demande_prise_en_charge','Votre demande a été prise en charge',
      ctx, NEW.user_id, NULL, NULL, lnk, 'info', 'entr:tr:charge:'||NEW.id::text, meta);
  END IF;

  IF NEW.truck_id IS NOT NULL AND OLD.truck_id IS DISTINCT FROM NEW.truck_id THEN
    PERFORM public.mkt_notify('client','transport_confirme','Votre transport a été confirmé',
      ctx, NEW.user_id, NULL, NULL, lnk, 'succes',
      'entr:tr:transport:'||NEW.id::text||':'||NEW.truck_id::text, meta);
  END IF;
  RETURN NEW;
END $function$;

CREATE OR REPLACE FUNCTION public.entr_notify_submission()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE lnk text; ctx text; st text;
BEGIN
  IF NEW.created_by IS NULL OR NEW.status IS NOT DISTINCT FROM OLD.status THEN RETURN NEW; END IF;
  lnk := '/entrepreneur/demandes?demande=' || NEW.id::text;
  ctx := nullif(concat_ws(' — ', nullif(NEW.material_needed,''), nullif(NEW.city,'')), '');
  st := public.entr_status_label(NEW.status);
  PERFORM public.mkt_notify('client','demande_statut',
    CASE NEW.status
      WHEN 'acceptee' THEN 'Votre demande a été acceptée'
      WHEN 'refusee' THEN 'Votre demande a été refusée'
      WHEN 'terminee' THEN 'Votre demande est complétée'
      WHEN 'annulee' THEN 'Votre demande a été annulée'
      ELSE 'Mise à jour de votre demande'
    END,
    concat_ws(' · ', 'Nouveau statut : '||st, ctx),
    NEW.created_by, NULL, NULL, lnk,
    CASE WHEN NEW.status IN ('refusee','annulee') THEN 'alerte'
         WHEN NEW.status IN ('acceptee','terminee') THEN 'succes' ELSE 'info' END,
    'entr:sub:statut:'||NEW.id::text||':'||NEW.status,
    jsonb_build_object('source','submission','request_id',NEW.id));
  RETURN NEW;
END $function$;

CREATE OR REPLACE FUNCTION public.entr_notify_public_request()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
BEGIN
  IF NEW.created_by IS NULL OR NEW.status IS NOT DISTINCT FROM OLD.status THEN RETURN NEW; END IF;
  PERFORM public.mkt_notify('client','demande_statut','Mise à jour de votre demande',
    'Nouveau statut : '||public.entr_status_label(NEW.status),
    NEW.created_by, NULL, NULL, '/entrepreneur/demandes?demande='||NEW.id::text, 'info',
    'entr:pubreq:statut:'||NEW.id::text||':'||NEW.status,
    jsonb_build_object('source','jsc_public_request','request_id',NEW.id));
  RETURN NEW;
END $function$;

CREATE OR REPLACE FUNCTION public.entr_notify_quote_request()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
BEGIN
  IF NEW.client_user_id IS NULL OR NEW.status IS NOT DISTINCT FROM OLD.status THEN RETURN NEW; END IF;
  PERFORM public.mkt_notify('client','demande_statut','Mise à jour de votre demande',
    concat_ws(' · ', 'Nouveau statut : '||public.entr_status_label(NEW.status), nullif(NEW.title,'')),
    NEW.client_user_id, NULL, NEW.id, '/mes-soumissions', 'info',
    'entr:mktreq:statut:'||NEW.id::text||':'||NEW.status,
    jsonb_build_object('source','mkt_quote_request','request_id',NEW.id));
  RETURN NEW;
END $function$;