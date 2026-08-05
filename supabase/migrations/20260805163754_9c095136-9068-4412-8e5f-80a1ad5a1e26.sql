
DO $$
DECLARE
  fn record;
  keep text[] := ARRAY[
    -- Fonctions réellement publiques (site vitrine / blogue / catalogue)
    'get_public_dumps','count_active_dumps_by_city','blog_increment_view','blog_search',
    'jsc_public_catalog','jsc_public_material',
    -- Fonctions utilisées à l'intérieur des politiques de sécurité
    'has_role','is_approved_entrepreneur','is_blacklisted','current_user_email',
    'jsc_can','jsc_can_manage','jsc_is_member','jsc_company_role',
    'jsc_my_client_ids','jsc_my_driver_ids','jsc_default_company_id'
  ];
BEGIN
  FOR fn IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef
      AND NOT (p.proname = ANY(keep))
      AND has_function_privilege('anon', p.oid, 'execute')
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM anon', fn.sig);
  END LOOP;
END $$;
