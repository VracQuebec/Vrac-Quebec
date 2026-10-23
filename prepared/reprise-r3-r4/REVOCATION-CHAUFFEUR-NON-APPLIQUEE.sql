-- Independent prepared correction. Original signature and fingerprint must match exactly.
DO $$BEGIN
 IF md5(pg_get_functiondef('public.jsc_my_driver_ids()'::regprocedure))<>'0a2c44196ce3066892e94e223a22d165' THEN RAISE EXCEPTION 'Définition chauffeur divergente : arrêt'; END IF;
END$$;
CREATE OR REPLACE FUNCTION public.jsc_my_driver_ids() RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT d.id FROM public.jsc_drivers d
 JOIN public.jsc_company_members m ON m.company_id=d.company_id AND m.user_id=d.user_id
 WHERE d.user_id=auth.uid() AND d.is_active AND d.archived_at IS NULL
   AND m.is_active AND m.archived_at IS NULL AND m.role='chauffeur';
$$;
-- No grant changes: original ACL retained by CREATE OR REPLACE.