-- EXEC-01 ONLY. Apply after schema.sql, quota.sql, confirmation-queue.sql.
-- No provider/scheduler is installed. General access and real confirmation stay OFF.
CREATE TABLE public.exec01_test_dossiers (
 submission_id uuid PRIMARY KEY REFERENCES public.submissions(id),
 created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.exec01_test_dossiers TO service_role;
ALTER TABLE public.exec01_test_dossiers ENABLE ROW LEVEL SECURITY;
CREATE POLICY exec01_test_service ON public.exec01_test_dossiers TO service_role USING(true) WITH CHECK(true);
CREATE TABLE public.exec01_mail_capture (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), submission_id uuid NOT NULL REFERENCES public.submissions(id),
 dedupe_key text NOT NULL UNIQUE, payload jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT,INSERT ON public.exec01_mail_capture TO service_role;
ALTER TABLE public.exec01_mail_capture ENABLE ROW LEVEL SECURITY;
CREATE POLICY exec01_capture_service ON public.exec01_mail_capture TO service_role USING(true) WITH CHECK(true);
CREATE TABLE public.exec01_mail_receipts (
 dedupe_key text PRIMARY KEY, submission_id uuid NOT NULL REFERENCES public.submissions(id),
 delivery text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT,INSERT ON public.exec01_mail_receipts TO service_role;
ALTER TABLE public.exec01_mail_receipts ENABLE ROW LEVEL SECURITY;
CREATE POLICY exec01_receipts_service ON public.exec01_mail_receipts TO service_role USING(true) WITH CHECK(true);

CREATE FUNCTION public.exec01_dispatch_mail(p jsonb, message jsonb, capture boolean DEFAULT true) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions AS $$
DECLARE s public.submissions; result jsonb; payload jsonb; k text; token text; q bigint; l public.submission_portal_links;
BEGIN
 IF p->>'kind' NOT IN ('issue','code','renew') THEN RETURN jsonb_build_object('denied',true); END IF;
 SELECT * INTO s FROM public.submissions WHERE id=(p->>'requestId')::uuid FOR UPDATE;
 IF s.id IS NULL OR s.email IS NULL THEN RETURN jsonb_build_object('denied',true); END IF;
 IF capture THEN
  IF NOT EXISTS(SELECT 1 FROM exec01_test_dossiers WHERE submission_id=s.id)
   OR lower(trim(s.email)) !~ '@([^@]+\.)?(invalid|test|example)$'
  THEN RETURN jsonb_build_object('denied',true); END IF;
 ELSE
  IF lower(trim(s.email)) ~ '@([^@]+\.)?(invalid|test|example|localhost)$|@example\.(com|org|net)$'
   OR EXISTS(SELECT 1 FROM suppressed_emails WHERE email=lower(trim(s.email)))
   OR EXISTS(SELECT 1 FROM email_unsubscribe_tokens WHERE email=lower(trim(s.email)) AND used_at IS NOT NULL)
  THEN RETURN jsonb_build_object('denied',true); END IF;
 END IF;
 -- Retry after an uncertain commit returns the existing delivery, not a new link.
 IF p->>'kind'='renew' THEN
  SELECT * INTO l FROM submission_portal_links WHERE id=(p->>'linkId')::uuid AND submission_id=s.id;
  IF l.id IS NULL OR l.secret_hash IS DISTINCT FROM p->>'secretHash'
   OR l.contact_hash IS DISTINCT FROM encode(digest(lower(trim(s.email)),'sha256'),'hex')
  THEN RETURN jsonb_build_object('denied',true); END IF;
  k:='exec01-renew-'||l.id;
 ELSIF p->>'kind'='issue' THEN k:='exec01-issue-'||s.id;
 END IF;
 IF k IS NOT NULL AND EXISTS(SELECT 1 FROM exec01_mail_receipts WHERE dedupe_key=k) THEN
  RETURN jsonb_build_object('ok',true,'replay',true,'delivery',(SELECT delivery FROM exec01_mail_receipts WHERE dedupe_key=k));
 END IF;
 result:=exec01_dispatch(p);
 IF result->>'ok' IS DISTINCT FROM 'true' THEN RETURN jsonb_build_object('denied',true); END IF;
 -- The code request timestamp is set under the same dossier lock.
 IF p->>'kind'='code' THEN
  k:='exec01-code-'||(p->>'linkId')||'-'||(SELECT code_requested_at::text FROM submission_portal_links WHERE id=(p->>'linkId')::uuid);
 END IF;
 payload:=jsonb_build_object('message_id',gen_random_uuid(),'to',s.email,
  'from',message->>'from','sender_domain',message->>'sender_domain',
  'subject',message->>'subject','html',message->>'html','text',message->>'text',
  'purpose','transactional','label','exec01-owner-service','tracking',false,'idempotency_key',k,'queued_at',now());
 IF capture THEN
  INSERT INTO exec01_mail_capture(submission_id,dedupe_key,payload) VALUES(s.id,k,payload);
 ELSE
  SELECT t.token INTO token FROM email_unsubscribe_tokens t WHERE email=lower(trim(s.email)) AND used_at IS NULL;
  IF token IS NULL THEN
   INSERT INTO email_unsubscribe_tokens(email,token) VALUES(lower(trim(s.email)),gen_random_uuid()) ON CONFLICT(email) DO NOTHING;
   SELECT t.token INTO token FROM email_unsubscribe_tokens t WHERE email=lower(trim(s.email)) AND used_at IS NULL;
  END IF;
  IF token IS NULL THEN RAISE EXCEPTION 'permission_unavailable'; END IF;
  q:=enqueue_email('transactional_emails',payload||jsonb_build_object('unsubscribe_token',token));
  IF q IS NULL THEN RAISE EXCEPTION 'message_not_queued'; END IF;
 END IF;
 INSERT INTO exec01_mail_receipts(dedupe_key,submission_id,delivery) VALUES(k,s.id,CASE WHEN capture THEN 'captured-test' ELSE 'queued' END);
 RETURN jsonb_build_object('ok',true,'delivery',CASE WHEN capture THEN 'captured-test' ELSE 'queued' END);
END $$;
REVOKE ALL ON FUNCTION public.exec01_dispatch_mail(jsonb,jsonb,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.exec01_dispatch_mail(jsonb,jsonb,boolean) TO service_role;