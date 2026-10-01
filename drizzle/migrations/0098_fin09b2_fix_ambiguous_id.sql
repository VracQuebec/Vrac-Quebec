CREATE OR REPLACE FUNCTION public.fin_progress_compute_lines(_plan uuid, _kind text, _value text, _on date) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE c jsonb; pit boolean; st jsonb; l jsonb; inp jsonb; k text; lid text; cq numeric; bq numeric; ba numeric; qq numeric; amt numeric; part numeric;
  cc numeric := 0; x numeric := 0; prevc numeric := 0; taxl jsonb := '[]'::jsonb; parts jsonb := '{}'::jsonb; det jsonb := '[]'::jsonb;
  tn numeric := 0; zn numeric := 0; en numeric := 0; cap jsonb; r jsonb; pv jsonb; nw jsonb; cum jsonb;
BEGIN
  SELECT contract INTO c FROM fin_progress_plans WHERE id = _plan;
  pit := coalesce((c->>'prices_include_tax')::boolean, false);
  IF _kind IS NULL OR _kind NOT IN ('situation','solde') THEN RAISE EXCEPTION 'Suivi par lignes : type « situation » ou « solde final » seulement' USING ERRCODE = '22023'; END IF;
  st := public.fin_progress_lines_state(_plan);
  IF _kind <> 'solde' THEN
    inp := public.fin_progress_qty_canon(_value)::jsonb;
    FOR k IN SELECT jsonb_object_keys(inp) LOOP
      IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(st) e WHERE e->>'id' = k) THEN RAISE EXCEPTION 'Ligne inconnue : %', k USING ERRCODE = '22023'; END IF;
    END LOOP;
  END IF;
  FOR l IN SELECT * FROM jsonb_array_elements(st) LOOP
    lid := l->>'id'; qq := (l->>'qty')::numeric; bq := (l->>'billed_qty')::numeric; ba := (l->>'billed_amt')::numeric;
    IF _kind = 'solde' THEN cq := qq;
    ELSIF inp ? lid THEN
      IF jsonb_typeof(inp->lid) <> 'string' OR (inp->>lid) !~ '^\d{1,12}(\.\d{1,4})?$' THEN
        RAISE EXCEPTION 'Quantité invalide pour la ligne % : nombre fini positif ou nul, au plus 4 décimales', lid USING ERRCODE = '22023'; END IF;
      cq := (inp->>lid)::numeric;
    ELSE cq := bq; END IF;
    IF cq < bq THEN RAISE EXCEPTION 'Cumul diminué pour la ligne % (déjà facturé : %)', lid, bq USING ERRCODE = '22023'; END IF;
    IF cq > qq THEN RAISE EXCEPTION 'Dépassement de la ligne % : cumul % supérieur à la quantité contractuelle %', lid, cq, qq USING ERRCODE = '22023'; END IF;
    amt := CASE WHEN cq = qq THEN (l->>'amount')::numeric ELSE public.fin_progress_line_amt(cq, (l->>'price')::numeric, (l->>'disc_pct')::numeric) END;
    part := amt - ba;
    IF part < 0 THEN RAISE EXCEPTION 'Arrondi : part négative sur la ligne %', lid USING ERRCODE = '22023'; END IF;
    cc := cc + (l->>'amount')::numeric; x := x + amt; prevc := prevc + ba;
    IF part <> 0 THEN
      taxl := taxl || jsonb_build_object('qty', 1, 'price', part, 'tax', l->>'tax', 'unit', l->>'unit', 'desc', l->>'desc',
        'prog', jsonb_build_object('line_id', lid, 'qty_new', cq - bq, 'qty_cum', cq, 'qty_contract', qq, 'unit_price', l->'price', 'disc_pct', l->'disc_pct'));
      CASE l->>'tax' WHEN 'taxable' THEN tn := tn + part; WHEN 'detaxe' THEN zn := zn + part; WHEN 'exonere' THEN en := en + part;
        ELSE RAISE EXCEPTION 'Ligne % au traitement fiscal à déterminer', lid; END CASE;
    END IF;
    IF cq > bq OR part <> 0 THEN parts := parts || jsonb_build_object(lid, jsonb_build_object('q', cq, 'amt', part)); END IF;
    det := det || (l || jsonb_build_object('cum_qty', cq, 'new_qty', cq - bq, 'cum_amt', amt, 'new_amt', part, 'rest_qty', qq - cq, 'rest_amt', (l->>'amount')::numeric - amt));
  END LOOP;
  cap := public.fin_progress_cap(_plan);
  IF cc <> (cap->>'t')::numeric + (cap->>'z')::numeric + (cap->>'e')::numeric THEN RAISE EXCEPTION 'Lignes incohérentes avec le contrat en vigueur'; END IF;
  IF jsonb_array_length(taxl) = 0 THEN RAISE EXCEPTION 'Aucun montant à facturer : facture vide refusée' USING ERRCODE = '22023'; END IF;
  r := public.fin_tax_compute(taxl, pit, c->>'gst_status', c->>'qst_status', coalesce(_on, (now() AT TIME ZONE 'America/Toronto')::date));
  IF NOT coalesce((r->>'resolved')::boolean, false) THEN RAISE EXCEPTION 'Taxes non résolues à cette date : %', array_to_string(ARRAY(SELECT jsonb_array_elements_text(r->'reasons')), ' ; '); END IF;
  SELECT jsonb_build_object('bt', coalesce(sum((computed->'new'->>'bt')::numeric),0), 'bz', coalesce(sum((computed->'new'->>'bz')::numeric),0), 'be', coalesce(sum((computed->'new'->>'be')::numeric),0),
      'gst', coalesce(sum((computed->'new'->>'gst')::numeric),0), 'qst', coalesce(sum((computed->'new'->>'qst')::numeric),0),
      'ht', coalesce(sum((computed->'new'->>'ht')::numeric),0), 'total', coalesce(sum((computed->'new'->>'total')::numeric),0))
    INTO pv FROM fin_progress_situations WHERE plan_id = _plan AND status = 'emise';
  nw := jsonb_build_object('bt', (r->>'taxable_base')::numeric, 'bz', (r->>'zero_rated_base')::numeric, 'be', (r->>'exempt_base')::numeric,
    'gst', (r->>'gst')::numeric, 'qst', (r->>'qst')::numeric, 'ht', (r->>'pre_tax')::numeric, 'total', (r->>'total')::numeric);
  cum := jsonb_build_object('bt', (pv->>'bt')::numeric + (nw->>'bt')::numeric, 'bz', (pv->>'bz')::numeric + (nw->>'bz')::numeric, 'be', (pv->>'be')::numeric + (nw->>'be')::numeric,
    'gst', (pv->>'gst')::numeric + (nw->>'gst')::numeric, 'qst', (pv->>'qst')::numeric + (nw->>'qst')::numeric,
    'ht', (pv->>'ht')::numeric + (nw->>'ht')::numeric, 'total', (pv->>'total')::numeric + (nw->>'total')::numeric, 'pct', round(x * 100 / cc, 2), 'cap', x);
  RETURN jsonb_build_object('basis', CASE WHEN pit THEN 'ttc' ELSE 'ht' END,
    'contract', jsonb_build_object('bt', c->'bt', 'bz', c->'bz', 'be', c->'be', 'gst', c->'gst', 'qst', c->'qst', 'ht', c->'ht', 'total', c->'total', 'cap', cc),
    'prev', pv || jsonb_build_object('cap', prevc), 'cum', cum, 'new', nw || jsonb_build_object('cap', x - prevc),
    'cap_new', jsonb_build_object('t', tn, 'z', zn, 'e', en),
    'remaining', jsonb_build_object('cap', cc - x, 'ht', (c->>'ht')::numeric - (cum->>'ht')::numeric, 'total', (c->>'total')::numeric - (cum->>'total')::numeric),
    'gap_vs_quote', CASE WHEN x = cc THEN jsonb_build_object('ht', (cum->>'ht')::numeric - (c->>'ht')::numeric, 'gst', (cum->>'gst')::numeric - (c->>'gst')::numeric,
      'qst', (cum->>'qst')::numeric - (c->>'qst')::numeric, 'total', (cum->>'total')::numeric - (c->>'total')::numeric) END,
    'lines', taxl, 'inv_lines', taxl, 'line_parts', parts, 'lines_detail', det, 'tax', r);
END $$;

CREATE OR REPLACE FUNCTION public.fin_progress_amend_compute(_plan uuid, _changes jsonb, _on date) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE p fin_progress_plans; c jsonb; pit boolean; st jsonb; cap jsonb; ch jsonb; l jsonb; nl jsonb; seen text[] := '{}'; lid text; nq numeric; oa numeric; na numeric;
  dt numeric := 0; dz numeric := 0; de numeric := 0; t numeric; z numeric; e numeric; nmax integer; k integer := 0; det jsonb := '[]'::jsonb; syn jsonb := '[]'::jsonb; r jsonb; after jsonb;
BEGIN
  SELECT * INTO p FROM fin_progress_plans WHERE id = _plan;
  c := p.contract; pit := coalesce((c->>'prices_include_tax')::boolean, false);
  IF jsonb_typeof(_changes) IS DISTINCT FROM 'array' OR jsonb_array_length(_changes) = 0 OR jsonb_array_length(_changes) > 200 THEN
    RAISE EXCEPTION 'Avenant : au moins une ligne modifiée ou ajoutée' USING ERRCODE = '22023'; END IF;
  st := public.fin_progress_lines_state(_plan); cap := public.fin_progress_cap(_plan); nl := p.lines;
  SELECT coalesce(max(substring(x->>'id' from '^L(\d+)$')::integer), 0) INTO nmax FROM jsonb_array_elements(p.lines) x WHERE jsonb_typeof(x) = 'object';
  FOR ch IN SELECT * FROM jsonb_array_elements(_changes) LOOP
    IF jsonb_typeof(ch) <> 'object' THEN RAISE EXCEPTION 'Avenant illisible' USING ERRCODE = '22023'; END IF;
    IF jsonb_typeof(ch->'qty') <> 'string' OR (ch->>'qty') !~ '^\d{1,12}(\.\d{1,4})?$' THEN RAISE EXCEPTION 'Quantité invalide : nombre fini positif ou nul, au plus 4 décimales' USING ERRCODE = '22023'; END IF;
    nq := (ch->>'qty')::numeric;
    IF ch ? 'id' THEN
      lid := ch->>'id';
      IF lid = ANY(seen) THEN RAISE EXCEPTION 'Ligne % modifiée deux fois', lid USING ERRCODE = '22023'; END IF;
      seen := seen || lid;
      SELECT x INTO l FROM jsonb_array_elements(st) x WHERE x->>'id' = lid;
      IF l IS NULL THEN RAISE EXCEPTION 'Ligne inconnue : %', lid USING ERRCODE = '22023'; END IF;
      IF nq < (l->>'billed_qty')::numeric THEN RAISE EXCEPTION 'Ligne % : quantité inférieure au déjà facturé (%)', lid, l->>'billed_qty' USING ERRCODE = '22023'; END IF;
      oa := (l->>'amount')::numeric; na := public.fin_progress_line_amt(nq, (l->>'price')::numeric, (l->>'disc_pct')::numeric);
      IF nq = (l->>'qty')::numeric THEN RAISE EXCEPTION 'Ligne % : quantité inchangée', lid USING ERRCODE = '22023'; END IF;
      nl := (SELECT jsonb_agg(CASE WHEN jsonb_typeof(x) = 'object' AND x->>'id' = lid THEN x || jsonb_build_object('qty', ch->>'qty') ELSE x END ORDER BY o) FROM jsonb_array_elements(nl) WITH ORDINALITY t(x, o));
      det := det || jsonb_build_object('id', lid, 'desc', l->>'desc', 'unit', l->>'unit', 'tax', l->>'tax', 'price', l->'price', 'disc_pct', l->'disc_pct',
        'qty_before', l->'qty', 'qty_after', nq, 'amount_before', oa, 'amount_after', na);
    ELSE
      IF btrim(coalesce(ch->>'desc', '')) = '' OR length(ch->>'desc') > 300 THEN RAISE EXCEPTION 'Nouvelle ligne : description requise' USING ERRCODE = '22023'; END IF;
      IF jsonb_typeof(ch->'price') <> 'string' OR (ch->>'price') !~ '^\d{1,12}(\.\d{1,4})?$' THEN RAISE EXCEPTION 'Nouvelle ligne : prix invalide' USING ERRCODE = '22023'; END IF;
      IF coalesce(ch->>'disc_pct', '') <> '' AND ((ch->>'disc_pct') !~ '^\d{1,3}(\.\d{1,2})?$' OR (ch->>'disc_pct')::numeric > 100) THEN RAISE EXCEPTION 'Nouvelle ligne : remise invalide' USING ERRCODE = '22023'; END IF;
      IF coalesce(ch->>'tax', '') NOT IN ('taxable','detaxe','exonere') THEN RAISE EXCEPTION 'Nouvelle ligne : traitement fiscal requis' USING ERRCODE = '22023'; END IF;
      IF nq <= 0 THEN RAISE EXCEPTION 'Nouvelle ligne : quantité positive requise' USING ERRCODE = '22023'; END IF;
      k := k + 1; lid := 'L' || (nmax + k); oa := 0;
      na := public.fin_progress_line_amt(nq, (ch->>'price')::numeric, nullif(ch->>'disc_pct', '')::numeric);
      l := jsonb_build_object('id', lid, 'desc', btrim(ch->>'desc'), 'unit', nullif(btrim(coalesce(ch->>'unit', '')), ''), 'qty', ch->>'qty', 'price', ch->>'price',
        'disc_pct', nullif(ch->>'disc_pct', ''), 'tax', ch->>'tax');
      nl := nl || l;
      det := det || jsonb_build_object('id', lid, 'desc', l->>'desc', 'unit', l->>'unit', 'tax', l->>'tax', 'price', l->'price', 'disc_pct', l->'disc_pct', 'qty_before', 0, 'qty_after', nq, 'amount_before', 0, 'amount_after', na, 'new', true);
    END IF;
    CASE l->>'tax' WHEN 'taxable' THEN dt := dt + na - oa; WHEN 'detaxe' THEN dz := dz + na - oa; WHEN 'exonere' THEN de := de + na - oa;
      ELSE RAISE EXCEPTION 'Ligne % au traitement fiscal à déterminer', lid USING ERRCODE = '22023'; END CASE;
  END LOOP;
  IF dt = 0 AND dz = 0 AND de = 0 THEN RAISE EXCEPTION 'Avenant sans effet monétaire' USING ERRCODE = '22023'; END IF;
  t := (cap->>'t')::numeric + dt; z := (cap->>'z')::numeric + dz; e := (cap->>'e')::numeric + de;
  IF t < (cap->>'billed_t')::numeric OR z < (cap->>'billed_z')::numeric OR e < (cap->>'billed_e')::numeric THEN
    RAISE EXCEPTION 'Avenant refusé : le contrat deviendrait inférieur à ce qui est déjà facturé' USING ERRCODE = '22023'; END IF;
  IF p.track = 'milestones' AND (cap->>'allocated')::numeric > t + z + e THEN
    RAISE EXCEPTION 'Avenant refusé : les jalons définis dépasseraient le nouveau plafond; réduisez ou archivez d''abord un jalon non facturé' USING ERRCODE = '22023'; END IF;
  IF t <> 0 THEN syn := syn || jsonb_build_object('qty', 1, 'price', t, 'tax', 'taxable'); END IF;
  IF z <> 0 THEN syn := syn || jsonb_build_object('qty', 1, 'price', z, 'tax', 'detaxe'); END IF;
  IF e <> 0 THEN syn := syn || jsonb_build_object('qty', 1, 'price', e, 'tax', 'exonere'); END IF;
  r := public.fin_tax_compute(syn, pit, c->>'gst_status', c->>'qst_status', coalesce(_on, (now() AT TIME ZONE 'America/Toronto')::date));
  IF NOT coalesce((r->>'resolved')::boolean, false) OR (r->>'gst_rate')::numeric IS DISTINCT FROM (c->>'gst_rate')::numeric OR (r->>'qst_rate')::numeric IS DISTINCT FROM (c->>'qst_rate')::numeric THEN
    RAISE EXCEPTION 'Taux ou profil fiscal différent du contrat figé : avenant refusé'; END IF;
  after := jsonb_build_object('bt', (r->>'taxable_base')::numeric, 'bz', z, 'be', e, 'gst', (r->>'gst')::numeric, 'qst', (r->>'qst')::numeric, 'ht', (r->>'pre_tax')::numeric, 'total', (r->>'total')::numeric,
    'gst_rate', c->'gst_rate', 'qst_rate', c->'qst_rate', 'gst_status', c->>'gst_status', 'qst_status', c->>'qst_status', 'prices_include_tax', pit);
  RETURN jsonb_build_object('from_version', p.contract_version, 'before', c, 'after', after, 'changes', det, 'lines_after', nl,
    'delta', jsonb_build_object('cap', dt + dz + de, 'ht', (after->>'ht')::numeric - (c->>'ht')::numeric, 'gst', (after->>'gst')::numeric - (c->>'gst')::numeric,
      'qst', (after->>'qst')::numeric - (c->>'qst')::numeric, 'total', (after->>'total')::numeric - (c->>'total')::numeric),
    'cap_before', (cap->>'t')::numeric + (cap->>'z')::numeric + (cap->>'e')::numeric, 'cap_after', t + z + e,
    'billed_cap', (cap->>'billed_t')::numeric + (cap->>'billed_z')::numeric + (cap->>'billed_e')::numeric);
END $$;
REVOKE EXECUTE ON FUNCTION public.fin_progress_compute_lines(uuid, text, text, date), public.fin_progress_amend_compute(uuid, jsonb, date) FROM PUBLIC, anon, authenticated;