-- FIN-11 : le règlement simulé utilise la méthode existante 'autre' (contrainte fin_invoice_receipts_method_check), référence « PSP-SIM … ».
DO $$
DECLARE d text;
BEGIN
  d := pg_get_functiondef('public.fin_psp_ingest(uuid,jsonb)'::regprocedure);
  IF position('''prestataire_simulation''' IN d) = 0 THEN RAISE EXCEPTION 'fin_psp_ingest inattendu'; END IF;
  EXECUTE replace(d, '''prestataire_simulation''', '''autre''');
END $$;
REVOKE ALL ON FUNCTION public.fin_psp_ingest(uuid, jsonb) FROM PUBLIC, anon, authenticated;