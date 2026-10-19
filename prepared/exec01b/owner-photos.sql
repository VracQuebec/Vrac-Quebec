-- EXEC-01 ONLY, after owner-mail.sql. Explicit fictitious file manifest, no bucket scan.
CREATE TABLE public.exec01_photo_files (
 path text PRIMARY KEY, submission_id uuid NOT NULL REFERENCES public.submissions(id),
 created_at timestamptz NOT NULL DEFAULT now(), lease_until timestamptz NOT NULL,
 claim_id uuid, state text NOT NULL DEFAULT 'uploading'
);
GRANT ALL ON public.exec01_photo_files TO service_role;
ALTER TABLE public.exec01_photo_files ENABLE ROW LEVEL SECURITY;
CREATE POLICY exec01_photo_service ON public.exec01_photo_files TO service_role USING(true) WITH CHECK(true);
CREATE FUNCTION public.exec01_photo_manage(p jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE s public.submissions; f public.exec01_photo_files; claim uuid;
BEGIN
 SELECT * INTO s FROM public.submissions WHERE id=(p->>'requestId')::uuid FOR UPDATE;
 IF s.id IS NULL OR p->>'path' !~ ('^submissions/'||s.id||'/[a-f0-9]{64}\.(jpg|png|webp)$') THEN RETURN jsonb_build_object('denied',true); END IF;
 SELECT * INTO f FROM exec01_photo_files WHERE path=p->>'path' FOR UPDATE;
 IF p->>'kind'='begin' THEN
  IF f.state='deleting' THEN RETURN jsonb_build_object('denied',true); END IF;
  INSERT INTO exec01_photo_files(path,submission_id,lease_until) VALUES(p->>'path',s.id,now()+interval '15 minutes')
  ON CONFLICT(path) DO UPDATE SET lease_until=now()+interval '15 minutes',state='uploading';
  RETURN jsonb_build_object('ok',true);
 END IF;
 -- No destructive action outside a registered fictional dossier or on unregistered files.
 IF NOT EXISTS(SELECT 1 FROM exec01_test_dossiers WHERE submission_id=s.id)
  OR f.path IS NULL OR lower(trim(s.email)) !~ '@([^@]+\.)?(invalid|test|example)$'
 THEN RETURN jsonb_build_object('denied',true); END IF;
 IF p->>'kind'='claim' THEN
  IF f.created_at>now()-interval '24 hours' OR f.lease_until>now() OR f.state='removed'
   OR EXISTS(SELECT 1 FROM submission_fill_profile WHERE submission_id=s.id AND reception_conditions->'photos' @> jsonb_build_array(jsonb_build_object('preview','private:'||f.path)))
   OR EXISTS(SELECT 1 FROM submission_portal_operations WHERE link_id IN (SELECT id FROM submission_portal_links WHERE submission_id=s.id) AND result->'conditions'->'photos' @> jsonb_build_array(jsonb_build_object('preview','private:'||f.path)))
   OR coalesce(s.photos::text,'') LIKE '%'||f.path||'%'
  THEN RETURN jsonb_build_object('claimed',false); END IF;
  claim:=gen_random_uuid();
  UPDATE exec01_photo_files SET state='deleting',claim_id=claim,lease_until=now()+interval '15 minutes' WHERE path=f.path;
  INSERT INTO submission_portal_events(submission_id,action,version) VALUES(s.id,'photo_cleanup_claim',s.exec01_version);
  RETURN jsonb_build_object('claimed',true,'claimId',claim);
 ELSIF p->>'kind'='finish' THEN
  IF f.state<>'deleting' OR f.claim_id IS DISTINCT FROM (p->>'claimId')::uuid THEN RETURN jsonb_build_object('denied',true); END IF;
  UPDATE exec01_photo_files SET state=CASE WHEN p->>'removed'='true' THEN 'removed' ELSE 'uploading' END,lease_until=now(),claim_id=NULL WHERE path=f.path;
  INSERT INTO submission_portal_events(submission_id,action,version) VALUES(s.id,CASE WHEN p->>'removed'='true' THEN 'photo_cleanup_removed' ELSE 'photo_cleanup_retry' END,s.exec01_version);
  RETURN jsonb_build_object('ok',true);
 END IF;
 RETURN jsonb_build_object('denied',true);
END $$;
REVOKE ALL ON FUNCTION public.exec01_photo_manage(jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.exec01_photo_manage(jsonb) TO service_role;