DO $m$
DECLARE src text;
BEGIN
  src := pg_get_functiondef('public.fin_reminders_sweep(uuid,timestamptz)'::regprocedure);
  src := replace(src, 'reasons := reasons || ''solde inconnu pour au moins un compte''', 'reasons := array_append(reasons, ''solde inconnu pour au moins un compte''::text)');
  src := replace(src, 'reasons := reasons || ''aucun compte bancaire saisi''', 'reasons := array_append(reasons, ''aucun compte bancaire saisi''::text)');
  src := replace(src, 'reasons := reasons || ''montants inconnus''', 'reasons := array_append(reasons, ''montants inconnus''::text)');
  EXECUTE src;
END $m$;
REVOKE EXECUTE ON FUNCTION public.fin_reminders_sweep(uuid, timestamptz) FROM PUBLIC, anon, authenticated;