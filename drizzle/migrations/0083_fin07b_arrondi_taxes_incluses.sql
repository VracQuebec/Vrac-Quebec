CREATE OR REPLACE FUNCTION public.fin_tax_compute(_lines jsonb, _prices_include boolean, _gst_status text, _qst_status text, _on date, _rates jsonb DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path = public AS $$
DECLARE l jsonb; g numeric; q numeric; gross numeric; disc numeric; net numeric;
  sub numeric := 0; dsum numeric := 0; bt numeric := 0; bz numeric := 0; be numeric := 0; bu numeric := 0;
  gi boolean; qi boolean; base numeric; tg numeric := 0; tq numeric := 0; f numeric; gap numeric := 0; reasons text[] := '{}'; ok boolean;
BEGIN
  g := coalesce((_rates->>'gst')::numeric, fin_tax_rate('gst', _on));
  q := coalesce((_rates->>'qst')::numeric, fin_tax_rate('qst', _on));
  FOR l IN SELECT * FROM jsonb_array_elements(coalesce(_lines,'[]'::jsonb)) LOOP
    IF coalesce(l->>'qty','') = '' OR coalesce(l->>'price','') = '' THEN CONTINUE; END IF;
    gross := round((l->>'qty')::numeric * (l->>'price')::numeric, 2);
    disc := round(gross * coalesce(nullif(l->>'disc_pct','')::numeric, 0) / 100, 2);
    net := gross - disc; sub := sub + gross; dsum := dsum + disc;
    CASE coalesce(l->>'tax','a_determiner')
      WHEN 'taxable' THEN bt := bt + net; WHEN 'detaxe' THEN bz := bz + net; WHEN 'exonere' THEN be := be + net; ELSE bu := bu + net;
    END CASE;
  END LOOP;
  IF bu <> 0 THEN reasons := array_append(reasons, 'Ligne au traitement fiscal à déterminer'); END IF;
  gi := _gst_status = 'inscrit'; qi := _qst_status = 'inscrit';
  IF bt <> 0 THEN
    IF coalesce(_gst_status,'a_completer') NOT IN ('inscrit','non_inscrit') THEN reasons := array_append(reasons, 'Statut TPS de l''entreprise à compléter'); END IF;
    IF coalesce(_qst_status,'a_completer') NOT IN ('inscrit','non_inscrit') THEN reasons := array_append(reasons, 'Statut TVQ de l''entreprise à compléter'); END IF;
    IF (gi AND g IS NULL) OR (qi AND q IS NULL) THEN reasons := array_append(reasons, 'Taux non disponible à cette date'); END IF;
  END IF;
  ok := cardinality(reasons) = 0; base := bt;
  IF ok AND bt <> 0 THEN
    IF coalesce(_prices_include, false) THEN
      -- Chaque taxe = total TTC × taux / (1 + somme des taux), précision complète puis arrondi au cent ; base = solde.
      f := 1 + CASE WHEN gi THEN g ELSE 0 END + CASE WHEN qi THEN q ELSE 0 END;
      IF gi THEN tg := round(bt * g / f, 2); END IF;
      IF qi THEN tq := round(bt * q / f, 2); END IF;
      base := bt - tg - tq;
      gap := (CASE WHEN gi THEN round(base * g, 2) ELSE 0 END + CASE WHEN qi THEN round(base * q, 2) ELSE 0 END) - (tg + tq);
    ELSE
      IF gi THEN tg := round(bt * g, 2); END IF;
      IF qi THEN tq := round(bt * q, 2); END IF;
    END IF;
  END IF;
  RETURN jsonb_build_object(
    'version', 2, 'currency', 'CAD', 'jurisdiction', 'QC', 'computed_on', _on,
    'prices_include_tax', coalesce(_prices_include,false), 'gst_status', _gst_status, 'qst_status', _qst_status,
    'gst_rate', CASE WHEN gi THEN g END, 'qst_rate', CASE WHEN qi THEN q END,
    'subtotal', sub, 'discount', dsum, 'taxable_base', CASE WHEN ok THEN base END,
    'zero_rated_base', bz, 'exempt_base', be, 'undetermined', bu,
    'gst', CASE WHEN ok THEN tg END, 'qst', CASE WHEN ok THEN tq END,
    'pre_tax', CASE WHEN ok THEN base + bz + be END,
    'total', CASE WHEN ok THEN base + tg + tq + bz + be END,
    'rounding_gap', CASE WHEN ok THEN gap END,
    'resolved', ok, 'reasons', to_jsonb(reasons),
    'rounding', CASE WHEN coalesce(_prices_include,false)
      THEN 'Prix taxes incluses : chaque taxe = total × taux / (1 + taux cumulés), arrondie au cent (demi éloigné de zéro); la base hors taxes est le solde'
      ELSE 'Chaque taxe = base × taux, arrondie au cent (demi éloigné de zéro) sur la base du document' END);
END $$;