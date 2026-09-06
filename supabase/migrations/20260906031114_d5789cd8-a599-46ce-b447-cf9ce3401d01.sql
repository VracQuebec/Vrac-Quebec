CREATE OR REPLACE FUNCTION public.mkt_recipient_email(_user_id uuid, _company_id uuid)
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE courriel text;
BEGIN
  IF _user_id IS NOT NULL THEN
    SELECT u.email INTO courriel FROM auth.users u WHERE u.id = _user_id;
  END IF;
  IF courriel IS NULL AND _company_id IS NOT NULL THEN
    SELECT NULLIF(p.email, '') INTO courriel FROM public.mkt_partners p WHERE p.company_id = _company_id;
  END IF;
  RETURN courriel;
END $$;

REVOKE ALL ON FUNCTION public.mkt_recipient_email(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mkt_recipient_email(uuid, uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.mkt_notification_email_trg()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'mkt_notification_email_trg: %', SQLERRM;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS mkt_notifications_email ON public.mkt_notifications;
CREATE TRIGGER mkt_notifications_email AFTER INSERT ON public.mkt_notifications
FOR EACH ROW EXECUTE FUNCTION public.mkt_notification_email_trg();

CREATE OR REPLACE FUNCTION public.mkt_run_automations()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE rule record; rec record; total integer := 0; faits jsonb := '{}'::jsonb; n integer;
BEGIN
  FOR rule IN SELECT * FROM public.mkt_automation_rules WHERE is_active LOOP
    n := 0;
    IF rule.key = 'sans_soumission' THEN
      FOR rec IN
        SELECT q.id, q.request_number, q.title FROM public.mkt_quote_requests q
         WHERE q.is_active AND q.archived_at IS NULL
           AND EXISTS (SELECT 1 FROM public.mkt_invitations i WHERE i.request_id = q.id AND i.sent_at < now() - make_interval(hours => rule.delay_hours))
           AND NOT EXISTS (SELECT 1 FROM public.mkt_bids b WHERE b.request_id = q.id AND b.status <> 'brouillon')
           AND NOT EXISTS (SELECT 1 FROM public.mkt_awards a WHERE a.request_id = q.id)
           AND (SELECT count(*) FROM public.mkt_automation_runs r WHERE r.rule_key = rule.key AND r.request_id = q.id) < rule.max_runs
           AND NOT EXISTS (SELECT 1 FROM public.mkt_automation_runs r WHERE r.rule_key = rule.key AND r.request_id = q.id AND r.created_at > now() - make_interval(hours => rule.delay_hours))
         LIMIT 50
      LOOP
        PERFORM public.mkt_notify('admin', rule.key, 'Aucune soumission pour ' || COALESCE(rec.request_number, 'une demande'),
          'La demande « ' || COALESCE(rec.title, '') || ' » n''a recu aucune soumission. Invitez d''autres entreprises.',
          NULL, NULL, rec.id, '/admin/marche/soumissions', 'warning');
        INSERT INTO public.mkt_automation_runs (rule_key, request_id, action) VALUES (rule.key, rec.id, 'alerte_admin');
        n := n + 1;
      END LOOP;
    ELSIF rule.key = 'invitation_sans_reponse' THEN
      FOR rec IN
        SELECT i.id, i.request_id, i.company_id, q.request_number
          FROM public.mkt_invitations i JOIN public.mkt_quote_requests q ON q.id = i.request_id
         WHERE i.status IN ('envoyee','vue') AND i.sent_at < now() - make_interval(hours => rule.delay_hours)
           AND NOT EXISTS (SELECT 1 FROM public.mkt_bids b WHERE b.invitation_id = i.id)
           AND (SELECT count(*) FROM public.mkt_automation_runs r WHERE r.rule_key = rule.key AND r.request_id = i.request_id AND r.company_id = i.company_id) < rule.max_runs
           AND NOT EXISTS (SELECT 1 FROM public.mkt_automation_runs r WHERE r.rule_key = rule.key AND r.request_id = i.request_id AND r.company_id = i.company_id AND r.created_at > now() - make_interval(hours => rule.delay_hours))
         LIMIT 100
      LOOP
        PERFORM public.mkt_notify('partenaire', rule.key, 'Rappel : soumission attendue',
          'Vous etes invite a soumissionner sur la demande ' || COALESCE(rec.request_number, '') || '. Repondez avant qu''elle soit attribuee.',
          NULL, rec.company_id, rec.request_id, '/partenaire/soumissions', 'info');
        INSERT INTO public.mkt_automation_runs (rule_key, request_id, company_id, action) VALUES (rule.key, rec.request_id, rec.company_id, 'rappel_partenaire');
        n := n + 1;
      END LOOP;
    ELSIF rule.key = 'soumission_expire' THEN
      FOR rec IN
        SELECT b.id, b.request_id, b.company_id, b.valid_until, q.request_number, q.client_user_id
          FROM public.mkt_bids b JOIN public.mkt_quote_requests q ON q.id = b.request_id
         WHERE b.status = 'envoyee' AND b.valid_until IS NOT NULL
           AND b.valid_until BETWEEN CURRENT_DATE AND (CURRENT_DATE + make_interval(hours => rule.delay_hours))
           AND (SELECT count(*) FROM public.mkt_automation_runs r WHERE r.rule_key = rule.key AND r.request_id = b.request_id AND r.company_id = b.company_id) < rule.max_runs
           AND NOT EXISTS (SELECT 1 FROM public.mkt_automation_runs r WHERE r.rule_key = rule.key AND r.request_id = b.request_id AND r.company_id = b.company_id AND r.created_at > now() - make_interval(hours => rule.delay_hours))
         LIMIT 100
      LOOP
        PERFORM public.mkt_notify('client', rule.key, 'Une soumission expire bientot',
          'Une soumission recue pour la demande ' || COALESCE(rec.request_number, '') || ' est valide jusqu''au ' || to_char(rec.valid_until, 'DD-MM-YYYY') || '.',
          rec.client_user_id, NULL, rec.request_id, '/mes-soumissions', 'warning');
        INSERT INTO public.mkt_automation_runs (rule_key, request_id, company_id, action) VALUES (rule.key, rec.request_id, rec.company_id, 'avis_expiration');
        n := n + 1;
      END LOOP;
    ELSIF rule.key = 'client_sans_decision' THEN
      FOR rec IN
        SELECT q.id, q.request_number, q.client_user_id, count(b.id) AS nb
          FROM public.mkt_quote_requests q JOIN public.mkt_bids b ON b.request_id = q.id AND b.status = 'envoyee'
         WHERE q.is_active AND q.archived_at IS NULL AND q.client_user_id IS NOT NULL
           AND NOT EXISTS (SELECT 1 FROM public.mkt_awards a WHERE a.request_id = q.id)
           AND (SELECT count(*) FROM public.mkt_automation_runs r WHERE r.rule_key = rule.key AND r.request_id = q.id) < rule.max_runs
           AND NOT EXISTS (SELECT 1 FROM public.mkt_automation_runs r WHERE r.rule_key = rule.key AND r.request_id = q.id AND r.created_at > now() - make_interval(hours => rule.delay_hours))
         GROUP BY q.id, q.request_number, q.client_user_id
        HAVING max(b.submitted_at) < now() - make_interval(hours => rule.delay_hours)
         LIMIT 100
      LOOP
        PERFORM public.mkt_notify('client', rule.key, 'Vos soumissions vous attendent',
          'Vous avez recu ' || rec.nb || ' soumission(s) pour la demande ' || COALESCE(rec.request_number, '') || '. Comparez-les et faites votre choix.',
          rec.client_user_id, NULL, rec.id, '/mes-soumissions', 'info');
        INSERT INTO public.mkt_automation_runs (rule_key, request_id, action) VALUES (rule.key, rec.id, 'relance_client');
        n := n + 1;
      END LOOP;
    ELSIF rule.key = 'attribution_confirmation' THEN
      FOR rec IN
        SELECT a.id, a.request_id, a.company_id, a.client_confirmed_at, a.partner_confirmed_at, q.request_number, q.client_user_id
          FROM public.mkt_awards a JOIN public.mkt_quote_requests q ON q.id = a.request_id
         WHERE a.awarded_at < now() - make_interval(hours => rule.delay_hours) AND a.completed_at IS NULL
           AND (a.client_confirmed_at IS NULL OR a.partner_confirmed_at IS NULL)
           AND (SELECT count(*) FROM public.mkt_automation_runs r WHERE r.rule_key = rule.key AND r.request_id = a.request_id) < rule.max_runs
           AND NOT EXISTS (SELECT 1 FROM public.mkt_automation_runs r WHERE r.rule_key = rule.key AND r.request_id = a.request_id AND r.created_at > now() - make_interval(hours => rule.delay_hours))
         LIMIT 100
      LOOP
        IF rec.client_confirmed_at IS NULL AND rec.client_user_id IS NOT NULL THEN
          PERFORM public.mkt_notify('client', rule.key, 'Confirmez votre choix',
            'Merci de confirmer l''entreprise retenue pour la demande ' || COALESCE(rec.request_number, '') || '.',
            rec.client_user_id, NULL, rec.request_id, '/mes-soumissions', 'info');
        END IF;
        IF rec.partner_confirmed_at IS NULL THEN
          PERFORM public.mkt_notify('partenaire', rule.key, 'Confirmez le projet attribue',
            'Le projet ' || COALESCE(rec.request_number, '') || ' vous a ete attribue. Confirmez votre engagement.',
            NULL, rec.company_id, rec.request_id, '/partenaire/soumissions', 'info');
        END IF;
        INSERT INTO public.mkt_automation_runs (rule_key, request_id, company_id, action) VALUES (rule.key, rec.request_id, rec.company_id, 'relance_confirmation');
        n := n + 1;
      END LOOP;
    ELSIF rule.key = 'projet_termine' THEN
      FOR rec IN
        SELECT a.id, a.request_id, a.company_id, q.request_number, q.client_user_id
          FROM public.mkt_awards a JOIN public.mkt_quote_requests q ON q.id = a.request_id
         WHERE a.completed_at IS NOT NULL AND a.completed_at < now() - make_interval(hours => rule.delay_hours) AND a.final_amount IS NULL
           AND (SELECT count(*) FROM public.mkt_automation_runs r WHERE r.rule_key = rule.key AND r.request_id = a.request_id) < rule.max_runs
           AND NOT EXISTS (SELECT 1 FROM public.mkt_automation_runs r WHERE r.rule_key = rule.key AND r.request_id = a.request_id AND r.created_at > now() - make_interval(hours => rule.delay_hours))
         LIMIT 100
      LOOP
        IF rec.client_user_id IS NOT NULL THEN
          PERFORM public.mkt_notify('client', rule.key, 'Evaluez l''entreprise',
            'Votre projet ' || COALESCE(rec.request_number, '') || ' est termine. Partagez votre appreciation.',
            rec.client_user_id, NULL, rec.request_id, '/mes-soumissions', 'info');
        END IF;
        PERFORM public.mkt_notify('partenaire', rule.key, 'Confirmez le montant final',
          'Indiquez le montant final du projet ' || COALESCE(rec.request_number, '') || ' pour clore le dossier.',
          NULL, rec.company_id, rec.request_id, '/partenaire/soumissions', 'info');
        INSERT INTO public.mkt_automation_runs (rule_key, request_id, company_id, action) VALUES (rule.key, rec.request_id, rec.company_id, 'suivi_realisation');
        n := n + 1;
      END LOOP;
    END IF;
    UPDATE public.mkt_automation_rules SET last_run_at = now() WHERE id = rule.id;
    faits := faits || jsonb_build_object(rule.key, n);
    total := total + n;
  END LOOP;
  RETURN jsonb_build_object('total', total, 'details', faits, 'executed_at', now());
END $$;

REVOKE ALL ON FUNCTION public.mkt_run_automations() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mkt_run_automations() TO authenticated, service_role;

SELECT cron.unschedule('mkt-automations') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'mkt-automations');
SELECT cron.schedule('mkt-automations', '7 * * * *', $cron$ SELECT public.mkt_run_automations(); $cron$);