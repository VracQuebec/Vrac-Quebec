-- PREPARED ONLY. Reuses the existing public_request_guard, no duplicate guard table.
CREATE FUNCTION public.exec01_quota(_identity text) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF _identity !~ '^[a-f0-9]{64}$' THEN RETURN false; END IF;
 PERFORM pg_advisory_xact_lock(hashtext('exec01-quota:'||_identity));
 IF (SELECT count(*) FROM public_request_guard WHERE scope='exec01-portal' AND identity=_identity AND created_at>now()-interval '1 minute')>=30 THEN RETURN false; END IF;
 INSERT INTO public_request_guard(scope,identity,fingerprint,payload) VALUES('exec01-portal',_identity,_identity,'{}');
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.exec01_quota(text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.exec01_quota(text) TO service_role;