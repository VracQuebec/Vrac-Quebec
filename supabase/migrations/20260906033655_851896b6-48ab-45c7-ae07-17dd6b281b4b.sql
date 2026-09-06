CREATE OR REPLACE FUNCTION public.mkt_notification_email_trg()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE courriel text; lien text; html text; jeton text;
BEGIN
  IF NOT ('email' = ANY(NEW.channels)) THEN RETURN NEW; END IF;
  courriel := lower(public.mkt_recipient_email(NEW.user_id, NEW.company_id));
  IF courriel IS NULL THEN RETURN NEW; END IF;
  IF EXISTS (SELECT 1 FROM public.suppressed_emails WHERE email = courriel) THEN RETURN NEW; END IF;

  SELECT token INTO jeton FROM public.email_unsubscribe_tokens WHERE email = courriel AND used_at IS NULL;
  IF jeton IS NULL THEN
    jeton := encode(gen_random_bytes(32), 'hex');
    INSERT INTO public.email_unsubscribe_tokens (token, email) VALUES (jeton, courriel)
    ON CONFLICT (email) DO UPDATE SET token = EXCLUDED.token, used_at = NULL
    RETURNING token INTO jeton;
  END IF;

  lien := 'https://vracquebec.ca' || COALESCE(NEW.link, '/notifications');
  html := '<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#111111">'
    || '<div style="font-weight:800;font-size:18px;color:#111111">Vrac <span style="color:#7ED321">Quebec</span></div>'
    || '<h1 style="font-size:20px;margin:20px 0 8px">' || coalesce(NEW.title, 'Nouvel avis') || '</h1>'
    || coalesce('<p style="font-size:15px;line-height:1.6;color:#333">' || NEW.body || '</p>', '')
    || '<p style="margin:24px 0"><a href="' || lien || '" style="background:#7ED321;color:#111111;text-decoration:none;font-weight:700;padding:12px 20px;border-radius:10px;display:inline-block">Voir dans mon espace</a></p>'
    || '<p style="font-size:12px;color:#888">Vous recevez ce message parce que vous utilisez la place de marche Vrac Quebec.</p></div>';

  PERFORM public.enqueue_email('transactional_emails', jsonb_build_object(
    'to', courriel,
    'from', 'Vrac Quebec <avis@notify.vracquebec.ca>',
    'sender_domain', 'notify.vracquebec.ca',
    'subject', NEW.title,
    'html', html,
    'text', coalesce(NEW.title, '') || E'\n\n' || coalesce(NEW.body, '') || E'\n\n' || lien,
    'purpose', 'transactional',
    'label', 'mkt-' || NEW.event,
    'unsubscribe_token', jeton,
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