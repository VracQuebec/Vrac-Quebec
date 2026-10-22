-- Proposed targeted function change only; no table, ACL, RLS or data mutation.
DO $patch$
DECLARE d text := pg_get_functiondef('public.exec01_photo_manage(jsonb)'::regprocedure);
 needle text := '   OR coalesce(s.photos::text,'||quote_literal('')||') LIKE '||quote_literal('%')||'||f.path||'||quote_literal('%');
BEGIN
 IF md5(d)<>'797eadff98c2eca9cf750a29464524c2' OR position(needle in d)=0 THEN RAISE EXCEPTION 'PHOTO_REFERENCE_DRIFT_STOP'; END IF;
 d:=replace(d,needle,$new$
   OR EXISTS(SELECT 1 FROM submission_portal_operations WHERE link_id IN (SELECT id FROM submission_portal_links WHERE submission_id=s.id)
    AND result->'publicForm'->'photos' @> jsonb_build_array(jsonb_build_object('url','private:'||f.path)))
   OR coalesce(s.photos::text,'') LIKE '%'||f.path||'%'$new$);
 EXECUTE d;
END $patch$;