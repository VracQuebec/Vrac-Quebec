-- FIN-09C2 : correctif d'ajout d'erreurs (text[] || littéral ambigu)
CREATE OR REPLACE FUNCTION public.fin_retention_validate(_inv fin_invoices, _p jsonb)
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE errs text[] := '{}'; pos jsonb; k text; mode text; amt numeric; pct numeric; base numeric; d date; s text;
  allowed text[] := ARRAY['kind','mode','amount','pct','reason','contract_ref','planned_release','release_condition'];
BEGIN
  IF _p IS NULL OR jsonb_typeof(_p) <> 'object' THEN RETURN jsonb_build_object('errors', jsonb_build_array('Saisie absente')); END IF;
  FOR k IN SELECT jsonb_object_keys(_p) LOOP IF NOT k = ANY(allowed) THEN errs := array_append(errs, (('Champ inconnu : ' || k))::text); END IF; END LOOP;
  IF _p->>'kind' = 'construction_differee' THEN
    errs := array_append(errs, 'Retenue de construction avec taxes différées : non prise en charge. Pour un contrat de construction admissible, la TPS/TVQ sur la somme retenue est perçue à la première date de paiement ou d''exigibilité de cette somme (Revenu Québec) — cette facture a déjà figé ses taxes. Ce cas reste à valider (sous-lot FIN-09C2 restant).'::text);
  ELSIF _p->>'kind' IS DISTINCT FROM 'taxes_exigibles' OR jsonb_typeof(_p->'kind') <> 'string' THEN
    errs := array_append(errs, 'Type de retenue requis : « taxes déjà exigibles »'::text);
  END IF;
  IF _inv.status <> 'emise' OR _inv.tax_snapshot IS NULL OR _inv.total IS NULL THEN errs := array_append(errs, ('Retenue possible seulement sur une facture émise dont les taxes sont figées')::text); END IF;
  pos := public.fin_invoice_position(_inv.id);
  base := (pos->>'net')::numeric;
  mode := CASE WHEN jsonb_typeof(_p->'mode') = 'string' THEN _p->>'mode' END;
  IF mode = 'amount' THEN
    s := CASE WHEN jsonb_typeof(_p->'amount') = 'string' THEN _p->>'amount' END;
    IF _p ? 'pct' AND _p->'pct' <> 'null'::jsonb THEN errs := array_append(errs, ('Montant : ne pas fournir de pourcentage')::text); END IF;
    IF s IS NULL OR s !~ '^\d{1,12}(\.\d{1,2})?$' THEN errs := array_append(errs, ('Montant CAD invalide (2 décimales au plus)')::text); ELSE amt := s::numeric; END IF;
  ELSIF mode = 'percent' THEN
    s := CASE WHEN jsonb_typeof(_p->'pct') = 'string' THEN _p->>'pct' END;
    IF _p ? 'amount' AND _p->'amount' <> 'null'::jsonb THEN errs := array_append(errs, ('Pourcentage : ne pas fournir de montant')::text); END IF;
    IF s IS NULL OR s !~ '^\d{1,3}(\.\d{1,4})?$' THEN errs := array_append(errs, 'Pourcentage invalide (plus de 0 à 100, 4 décimales au plus)'::text);
    ELSIF s::numeric <= 0 OR s::numeric > 100 THEN errs := array_append(errs, 'Pourcentage invalide (plus de 0 à 100, 4 décimales au plus)'::text);
    ELSE pct := s::numeric; amt := round(base * pct / 100, 2); END IF;
  ELSE errs := array_append(errs, ('Mode requis : montant ou pourcentage')::text); END IF;
  IF amt IS NOT NULL AND amt <= 0 THEN errs := array_append(errs, ('Retenue nulle : rien à retenir')::text); END IF;
  IF amt IS NOT NULL AND amt > (pos->>'current_due')::numeric THEN errs := array_append(errs, (format('Retenue supérieure à la part exigible non couverte (%s $)', pos->>'current_due'))::text); END IF;
  IF coalesce(jsonb_typeof(_p->'reason'),'') <> 'string' OR coalesce(length(trim(_p->>'reason')),0) NOT BETWEEN 1 AND 500 THEN errs := array_append(errs, ('Motif requis (500 caractères au plus)')::text); END IF;
  IF coalesce(jsonb_typeof(_p->'release_condition'),'') <> 'string' OR coalesce(length(trim(_p->>'release_condition')),0) NOT BETWEEN 1 AND 500 THEN errs := array_append(errs, ('Condition de libération requise (500 caractères au plus)')::text); END IF;
  IF _p ? 'contract_ref' AND _p->'contract_ref' <> 'null'::jsonb AND (coalesce(jsonb_typeof(_p->'contract_ref'),'') <> 'string' OR length(_p->>'contract_ref') > 200) THEN errs := array_append(errs, ('Référence contractuelle invalide')::text); END IF;
  IF _p ? 'planned_release' AND _p->'planned_release' <> 'null'::jsonb THEN
    s := CASE WHEN jsonb_typeof(_p->'planned_release') = 'string' THEN _p->>'planned_release' END;
    BEGIN IF s IS NULL OR s !~ '^\d{4}-\d{2}-\d{2}$' THEN RAISE EXCEPTION 'x'; END IF; d := s::date; IF to_char(d,'YYYY-MM-DD') <> s THEN RAISE EXCEPTION 'x'; END IF;
    EXCEPTION WHEN OTHERS THEN errs := array_append(errs, ('Date de libération prévue invalide')::text); d := NULL; END;
  END IF;
  RETURN jsonb_build_object('errors', to_jsonb(errs), 'mode', mode, 'pct', pct, 'base', base, 'amount', amt, 'planned_release', d,
    'reason', trim(_p->>'reason'), 'contract_ref', nullif(trim(coalesce(_p->>'contract_ref','')),''), 'release_condition', trim(_p->>'release_condition'),
    'position', pos,
    'payload_hash', md5(jsonb_build_object('invoice', _inv.id, 'mode', mode, 'pct', pct, 'amount', amt, 'reason', trim(_p->>'reason'), 'ref', nullif(trim(coalesce(_p->>'contract_ref','')),''),
       'date', d, 'cond', trim(_p->>'release_condition'))::text),
    'state_hash', md5(concat_ws('|', pos->>'net', pos->>'collected', pos->>'held', base)));
END $function$;
REVOKE ALL ON FUNCTION public.fin_retention_validate(fin_invoices, jsonb) FROM PUBLIC, anon, authenticated;
