-- PREPARATION ONLY: read-only assertions; no migration/permission/data mutation.
-- Stop if a new existing function would be replaced without an archived inverse.
DO $guard$
DECLARE signature text; name text;
BEGIN
 FOREACH signature IN ARRAY ARRAY[
  'public.guard_validate_params(text,text,text,integer)',
  'public.guard_check_and_log(text,text,text,jsonb,integer)',
  'public.guard_claim(text,text,text,jsonb,integer,integer)',
  'public.guard_complete(uuid,jsonb)','public.guard_release(uuid,text)',
  'public.guard_claim_durable(text,text,text,jsonb,integer,integer)',
  'public.guard_email_status(uuid,text)'
 ] LOOP
  IF to_regprocedure(signature) IS NOT NULL THEN RAISE EXCEPTION 'EXISTING_FUNCTION_REQUIRES_EXACT_INVERSE_STOP: %',signature; END IF;
 END LOOP;
 FOREACH name IN ARRAY ARRAY['submissions','jsc_requests','public_request_guard'] LOOP
  IF NOT EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON c.relnamespace=n.oid
   WHERE n.nspname='public' AND c.relname=name AND c.relkind='r' AND c.relrowsecurity
   AND c.relacl::text='{postgres=arwdDxtm/postgres,anon=arwdDxtm/postgres,authenticated=arwdDxtm/postgres,service_role=arwdDxtm/postgres,sandbox_exec=ar/postgres}')
  THEN RAISE EXCEPTION 'TABLE_RIGHTS_DRIFT_STOP: %',name; END IF;
 END LOOP;
 IF EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public'
  AND table_name IN ('submissions','jsc_requests') AND column_name='guard_claim_id')
  OR to_regclass('public.submissions_guard_claim_id_uq') IS NOT NULL
  OR to_regclass('public.jsc_requests_guard_claim_id_uq') IS NOT NULL
 THEN RAISE EXCEPTION 'ADDITIVE_SCHEMA_ALREADY_PRESENT_REVIEW_STOP'; END IF;
END $guard$;