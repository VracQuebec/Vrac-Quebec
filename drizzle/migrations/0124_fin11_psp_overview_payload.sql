-- FIN-11 : le journal expose le contenu exact de chaque événement simulé (rejeu identique = doublon détecté).
DO $$
DECLARE d text;
BEGIN
  d := pg_get_functiondef('public.fin_psp_overview(uuid)'::regprocedure);
  IF position('''fee'', e.payload->>''fee'')' IN d) = 0 THEN RAISE EXCEPTION 'fin_psp_overview inattendu'; END IF;
  EXECUTE replace(d, '''fee'', e.payload->>''fee'')', '''fee'', e.payload->>''fee'', ''payload'', e.payload)');
END $$;
REVOKE ALL ON FUNCTION public.fin_psp_overview(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fin_psp_overview(uuid) TO authenticated;