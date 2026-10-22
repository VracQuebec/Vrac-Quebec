CREATE OR REPLACE FUNCTION public.exec01_enqueue_confirmation(p jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE s public.submissions; q bigint;
BEGIN
 SELECT * INTO s FROM public.submissions WHERE id=(p->>'requestId')::uuid FOR UPDATE;
 IF s.id IS NULL OR s.request_type<>'remblai' OR s.parcours_direction IS DISTINCT FROM 'reception'
 OR coalesce(s.deliver_or_remove,'') ILIKE '%sortir%' OR s.email IS NULL
 OR encode(digest(lower(trim(s.email)),'sha256'),'hex') IS DISTINCT FROM p->>'contactHash'
 OR s.email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
 OR lower(trim(s.email)) ~ '@([^@]+\.)?(invalid|test|example|localhost)$|@example\.(com|org|net)$'
 THEN RETURN jsonb_build_object('denied',true); END IF;
 IF EXISTS(SELECT 1 FROM suppressed_emails WHERE email=lower(trim(s.email)))
 OR EXISTS(SELECT 1 FROM email_unsubscribe_tokens WHERE email=lower(trim(s.email)) AND used_at IS NOT NULL)
 THEN RETURN jsonb_build_object('denied',true); END IF;
 IF EXISTS(SELECT 1 FROM submission_portal_confirmations WHERE submission_id=s.id)
 THEN RETURN jsonb_build_object('ok',true,'replay',true); END IF;
 INSERT INTO submission_portal_links(id,submission_id,secret_hash,contact_hash,expires_at)
 VALUES((p->>'linkId')::uuid,s.id,p->>'secretHash',p->>'contactHash',now()+interval '30 days');
 q:=enqueue_email('transactional_emails',(p->'message')||jsonb_build_object(
  'to',s.email,'purpose','transactional','label','client-confirmation','tracking',false,
  'idempotency_key','client-confirm-'||s.id,'queued_at',now()));
 IF q IS NULL THEN RAISE EXCEPTION 'confirmation_not_queued'; END IF;
 INSERT INTO submission_portal_confirmations(submission_id,link_id,queue_id) VALUES(s.id,(p->>'linkId')::uuid,q);
 RETURN jsonb_build_object('ok',true,'queued',true);
END $function$
