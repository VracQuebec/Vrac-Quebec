CREATE OR REPLACE FUNCTION public.fin_seed_categories(_company uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE n int;
BEGIN
  IF NOT public.fin_can_write(_company) THEN RAISE EXCEPTION 'Accès refusé' USING ERRCODE='42501'; END IF;
  INSERT INTO public.fin_categories(company_id, name, is_suggested, created_by)
  SELECT _company, x, true, auth.uid() FROM unnest(ARRAY['Assurances','Immatriculation / véhicules','Financement','Frais bancaires','Logiciels','Télécommunications','Locaux','Énergie / services','Carburant / fluides','Entretien / réparation','Paie','Cotisations employeur','Matériaux / fournisseurs','Sous-traitance','Location / outillage','Disposition / environnement','TPS / TVQ','Impôts / autres taxes','Permis / cotisations','Honoraires','Marketing','Administration','Déplacements','Formation / sécurité','Saisonnier / exceptionnel','Propriétaires / transferts','Immatriculations et permis','Prêts et locations','Abonnements','Loyer']) x
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS n = ROW_COUNT; RETURN n;
END $function$;