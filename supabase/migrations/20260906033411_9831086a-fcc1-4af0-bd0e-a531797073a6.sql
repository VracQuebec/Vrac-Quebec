CREATE OR REPLACE FUNCTION public.mkt_notification_email_trg()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE courriel text; lien text; html text;
BEGIN
  IF NOT ('email' = ANY(NEW.channels)) THEN RETURN NEW; END IF;
  courriel := public.mkt_recipient_email(NEW.user_id, NEW.company_id);
  IF courriel IS NULL THEN RETURN NEW; END IF;
  lien := 'https://vracquebec.ca' || COALESCE(NEW.link, '/notifications');
  html := '<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#111111">'
    || '<div style="font-weight:800;font-size:18px;color:#111111">Vrac <span style="color:#7ED321">Quebec</span></div>'
    || '<h1 style="font-size:20px;margin:20px 0 8px">' || coalesce(NEW.title, 'Nouvel avis') || '</h1>'
    || coalesce('<p style="font-size:15px;line-height:1.6;color:#333">' || NEW.body || '</p>', '')
    || '<p style="margin:24px 0"><a href="' || lien || '" style="background:#7ED321;color:#111111;text-decoration:none;font-weight:700;padding:12px 20px;border-radius:10px;display:inline-block">Voir dans mon espace</a></p>'
    || '<p style="font-size:12px;color:#888">Vous recevez ce message parce que vous utilisez la place de marche Vrac Quebec. Vous pouvez modifier vos preferences d''avis dans votre espace.</p></div>';
  PERFORM public.enqueue_email('transactional_emails', jsonb_build_object(
    'to', courriel,
    'from', 'Vrac Quebec <avis@notify.vracquebec.ca>',
    'sender_domain', 'notify.vracquebec.ca',
    'subject', NEW.title,
    'html', html,
    'text', coalesce(NEW.title, '') || E'\n\n' || coalesce(NEW.body, '') || E'\n\n' || lien,
    'purpose', 'transactional',
    'label', 'mkt-' || NEW.event,
    'message_id', NEW.id::text,
    'idempotency_key', NEW.id::text,
    'queued_at', now()
  ));
  BEGIN
    PERFORM public.email_queue_wake();
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'mkt_notification_email_trg wake: %', SQLERRM;
  END;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'mkt_notification_email_trg: %', SQLERRM;
  RETURN NEW;
END $fn$;