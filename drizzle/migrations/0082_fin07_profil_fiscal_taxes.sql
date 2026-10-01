-- Taux centralisés et versionnés par date
CREATE TABLE public.fin_tax_rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  jurisdiction text NOT NULL DEFAULT 'QC',
  tax text NOT NULL CHECK (tax IN ('gst','qst')),
  rate numeric(8,6) NOT NULL CHECK (rate >= 0 AND rate < 1),
  effective_from date NOT NULL,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (jurisdiction, tax, effective_from)
);
GRANT SELECT ON public.fin_tax_rates TO authenticated, anon;
GRANT ALL ON public.fin_tax_rates TO service_role;
ALTER TABLE public.fin_tax_rates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "lecture" ON public.fin_tax_rates FOR SELECT TO authenticated, anon USING (true);
CREATE POLICY "admin" ON public.fin_tax_rates FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
INSERT INTO public.fin_tax_rates (tax, rate, effective_from, note) VALUES
  ('gst', 0.05, '2008-01-01', 'TPS fédérale 5 %'),
  ('qst', 0.09975, '2013-01-01', 'TVQ 9,975 % sur le prix hors TPS');

-- Profil fiscal par entreprise (statuts distincts par taxe)
ALTER TABLE public.ent_crm_settings
  ADD COLUMN IF NOT EXISTS gst_status text NOT NULL DEFAULT 'a_completer' CHECK (gst_status IN ('inscrit','non_inscrit','a_completer')),
  ADD COLUMN IF NOT EXISTS gst_effective date,
  ADD COLUMN IF NOT EXISTS qst_status text NOT NULL DEFAULT 'a_completer' CHECK (qst_status IN ('inscrit','non_inscrit','a_completer')),
  ADD COLUMN IF NOT EXISTS qst_effective date;
COMMENT ON COLUMN public.ent_crm_settings.taxes_enabled IS 'DEPRECATED: remplacé par gst_status / qst_status (FIN-07)';
COMMENT ON COLUMN public.ent_crm_settings.gst_rate IS 'DEPRECATED: taux centralisés dans fin_tax_rates (FIN-07)';
COMMENT ON COLUMN public.ent_crm_settings.qst_rate IS 'DEPRECATED: taux centralisés dans fin_tax_rates (FIN-07)';

CREATE TABLE public.ent_crm_tax_profile_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.jsc_companies(id) ON DELETE CASCADE,
  changed_by uuid,
  before jsonb,
  after jsonb NOT NULL,
  changed_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.ent_crm_tax_profile_history TO authenticated;
GRANT ALL ON public.ent_crm_tax_profile_history TO service_role;
ALTER TABLE public.ent_crm_tax_profile_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "lecture" ON public.ent_crm_tax_profile_history FOR SELECT TO authenticated USING (public.entcrm_can_admin(company_id));

CREATE OR REPLACE FUNCTION public.entcrm_tax_profile_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE b jsonb; a jsonb;
BEGIN
  IF NEW.gst_status = 'inscrit' AND (coalesce(trim(NEW.gst_number),'') = '' OR NEW.gst_effective IS NULL) THEN
    RAISE EXCEPTION 'TPS « inscrit » : numéro et date d''effet requis'; END IF;
  IF NEW.qst_status = 'inscrit' AND (coalesce(trim(NEW.qst_number),'') = '' OR NEW.qst_effective IS NULL) THEN
    RAISE EXCEPTION 'TVQ « inscrit » : numéro et date d''effet requis'; END IF;
  a := jsonb_build_object('gst_status',NEW.gst_status,'gst_number',NEW.gst_number,'gst_effective',NEW.gst_effective,
                          'qst_status',NEW.qst_status,'qst_number',NEW.qst_number,'qst_effective',NEW.qst_effective);
  IF TG_OP = 'UPDATE' THEN
    b := jsonb_build_object('gst_status',OLD.gst_status,'gst_number',OLD.gst_number,'gst_effective',OLD.gst_effective,
                            'qst_status',OLD.qst_status,'qst_number',OLD.qst_number,'qst_effective',OLD.qst_effective);
    IF a = b THEN RETURN NEW; END IF;
  END IF;
  INSERT INTO ent_crm_tax_profile_history (company_id, changed_by, before, after) VALUES (NEW.company_id, auth.uid(), b, a);
  RETURN NEW;
END $$;
CREATE TRIGGER trg_tax_profile_guard BEFORE INSERT OR UPDATE ON public.ent_crm_settings FOR EACH ROW EXECUTE FUNCTION public.entcrm_tax_profile_guard();

-- Moteur commun
CREATE OR REPLACE FUNCTION public.fin_tax_rate(_tax text, _on date) RETURNS numeric LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT rate FROM fin_tax_rates WHERE jurisdiction='QC' AND tax=_tax AND effective_from <= _on ORDER BY effective_from DESC LIMIT 1
$$;

-- Règle d'arrondi : chaque taxe arrondie au cent (demi éloigné de zéro) sur la base du document.
-- Prix taxes incluses : base = arrondi(total / (1 + taux)), TPS = arrondi(base × taux TPS), la TVQ reçoit le solde (total préservé).
CREATE OR REPLACE FUNCTION public.fin_tax_compute(_lines jsonb, _prices_include boolean, _gst_status text, _qst_status text, _on date, _rates jsonb DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path = public AS $$
DECLARE l jsonb; g numeric; q numeric; gross numeric; disc numeric; net numeric;
  sub numeric := 0; dsum numeric := 0; bt numeric := 0; bz numeric := 0; be numeric := 0; bu numeric := 0;
  gi boolean; qi boolean; base numeric; tg numeric := 0; tq numeric := 0; reasons text[] := '{}'; ok boolean;
BEGIN
  g := coalesce((_rates->>'gst')::numeric, fin_tax_rate('gst', _on));
  q := coalesce((_rates->>'qst')::numeric, fin_tax_rate('qst', _on));
  FOR l IN SELECT * FROM jsonb_array_elements(coalesce(_lines,'[]'::jsonb)) LOOP
    IF coalesce(l->>'qty','') = '' OR coalesce(l->>'price','') = '' THEN CONTINUE; END IF;
    gross := round((l->>'qty')::numeric * (l->>'price')::numeric, 2);
    disc := round(gross * coalesce(nullif(l->>'disc_pct','')::numeric, 0) / 100, 2);
    net := gross - disc; sub := sub + gross; dsum := dsum + disc;
    CASE coalesce(l->>'tax','a_determiner')
      WHEN 'taxable' THEN bt := bt + net;
      WHEN 'detaxe' THEN bz := bz + net;
      WHEN 'exonere' THEN be := be + net;
      ELSE bu := bu + net;
    END CASE;
  END LOOP;
  IF bu <> 0 THEN reasons := array_append(reasons, 'Ligne au traitement fiscal à déterminer'); END IF;
  gi := _gst_status = 'inscrit'; qi := _qst_status = 'inscrit';
  IF bt <> 0 THEN
    IF coalesce(_gst_status,'a_completer') NOT IN ('inscrit','non_inscrit') THEN reasons := array_append(reasons, 'Statut TPS de l''entreprise à compléter'); END IF;
    IF coalesce(_qst_status,'a_completer') NOT IN ('inscrit','non_inscrit') THEN reasons := array_append(reasons, 'Statut TVQ de l''entreprise à compléter'); END IF;
    IF (gi AND g IS NULL) OR (qi AND q IS NULL) THEN reasons := array_append(reasons, 'Taux non disponible à cette date'); END IF;
  END IF;
  ok := cardinality(reasons) = 0;
  base := bt;
  IF ok AND bt <> 0 THEN
    IF coalesce(_prices_include, false) THEN
      base := round(bt / (1 + CASE WHEN gi THEN g ELSE 0 END + CASE WHEN qi THEN q ELSE 0 END), 2);
      IF gi AND qi THEN tg := round(base * g, 2); tq := bt - base - tg;
      ELSIF gi THEN tg := bt - base; ELSIF qi THEN tq := bt - base; END IF;
    ELSE
      IF gi THEN tg := round(bt * g, 2); END IF;
      IF qi THEN tq := round(bt * q, 2); END IF;
    END IF;
  END IF;
  RETURN jsonb_build_object(
    'version', 1, 'currency', 'CAD', 'jurisdiction', 'QC', 'computed_on', _on,
    'prices_include_tax', coalesce(_prices_include,false), 'gst_status', _gst_status, 'qst_status', _qst_status,
    'gst_rate', CASE WHEN gi THEN g END, 'qst_rate', CASE WHEN qi THEN q END,
    'subtotal', sub, 'discount', dsum, 'taxable_base', CASE WHEN ok THEN base END,
    'zero_rated_base', bz, 'exempt_base', be, 'undetermined', bu,
    'gst', CASE WHEN ok THEN tg END, 'qst', CASE WHEN ok THEN tq END,
    'pre_tax', CASE WHEN ok THEN base + bz + be END,
    'total', CASE WHEN ok THEN base + tg + tq + bz + be END,
    'resolved', ok, 'reasons', to_jsonb(reasons),
    'rounding', 'Chaque taxe arrondie au cent (demi éloigné de zéro) sur la base du document');
END $$;
GRANT EXECUTE ON FUNCTION public.fin_tax_compute(jsonb, boolean, text, text, date, jsonb) TO authenticated;

-- Soumissions : instantané fiscal + option prix taxes incluses
ALTER TABLE public.ent_crm_quotes
  ADD COLUMN IF NOT EXISTS prices_include_tax boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS tax_snapshot jsonb;

CREATE OR REPLACE FUNCTION public.entcrm_quote_freeze() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE s ent_crm_settings; c jsc_companies; r jsonb; today date := (now() AT TIME ZONE 'America/Toronto')::date;
  finalizing boolean;
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.status = 'remise' AND NEW.status = 'remise'
     AND (NEW.lines IS DISTINCT FROM OLD.lines OR NEW.subtotal IS DISTINCT FROM OLD.subtotal
          OR NEW.prices_include_tax IS DISTINCT FROM OLD.prices_include_tax OR NEW.tax_snapshot IS DISTINCT FROM OLD.tax_snapshot) THEN
    RAISE EXCEPTION 'Soumission remise : créez une révision pour la modifier';
  END IF;
  finalizing := NEW.status IN ('remise','acceptee') AND (TG_OP = 'INSERT' OR OLD.status = 'brouillon');
  IF NEW.status = 'brouillon' OR finalizing THEN
    SELECT * INTO s FROM ent_crm_settings WHERE company_id = NEW.company_id;
    r := public.fin_tax_compute(NEW.lines, NEW.prices_include_tax, coalesce(s.gst_status,'a_completer'), coalesce(s.qst_status,'a_completer'), today);
    IF finalizing THEN
      IF NOT (r->>'resolved')::boolean THEN
        RAISE EXCEPTION 'Taxes à déterminer : %', array_to_string(ARRAY(SELECT jsonb_array_elements_text(r->'reasons')), ' ; ');
      END IF;
      SELECT * INTO c FROM jsc_companies WHERE id = NEW.company_id;
      r := r || jsonb_build_object('final', true, 'seller', jsonb_build_object(
        'name', c.name, 'legal_name', c.legal_name, 'address', c.address, 'phone', c.phone, 'email', c.email,
        'gst_number', s.gst_number, 'gst_effective', s.gst_effective, 'qst_number', s.qst_number, 'qst_effective', s.qst_effective));
      NEW.taxes_applied := ((r->>'gst')::numeric + (r->>'qst')::numeric) <> 0 OR coalesce((r->>'taxable_base')::numeric,0) <> 0;
      NEW.gst_rate := (r->>'gst_rate')::numeric * 100; NEW.qst_rate := (r->>'qst_rate')::numeric * 100;
      NEW.tax_gst := (r->>'gst')::numeric; NEW.tax_qst := (r->>'qst')::numeric; NEW.total := (r->>'total')::numeric;
    ELSE
      r := r || jsonb_build_object('final', false);
      NEW.taxes_applied := false; NEW.gst_rate := NULL; NEW.qst_rate := NULL; NEW.tax_gst := NULL; NEW.tax_qst := NULL; NEW.total := NULL;
    END IF;
    NEW.tax_snapshot := r;
    NEW.subtotal := coalesce((r->>'pre_tax')::numeric, (r->>'subtotal')::numeric - (r->>'discount')::numeric);
  END IF;
  IF NEW.status = 'brouillon' THEN NEW.share_token := NULL; NEW.shared_at := NULL; END IF;
  RETURN NEW;
END $$;

-- Corrections futures (notes de crédit) : reprennent les taux et statuts historiques du document
CREATE OR REPLACE FUNCTION public.fin_tax_correction(_quote_id uuid, _lines jsonb) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE q ent_crm_quotes; sn jsonb;
BEGIN
  SELECT * INTO q FROM ent_crm_quotes WHERE id = _quote_id;
  IF q.id IS NULL OR NOT public.entcrm_can_read(q.company_id) THEN RAISE EXCEPTION 'Accès refusé'; END IF;
  sn := q.tax_snapshot;
  IF sn IS NULL OR NOT coalesce((sn->>'final')::boolean, false) THEN RAISE EXCEPTION 'Document sans taxes figées'; END IF;
  RETURN public.fin_tax_compute(_lines, (sn->>'prices_include_tax')::boolean, sn->>'gst_status', sn->>'qst_status',
    (sn->>'computed_on')::date, jsonb_build_object('gst', coalesce(sn->>'gst_rate','0'), 'qst', coalesce(sn->>'qst_rate','0')));
END $$;
GRANT EXECUTE ON FUNCTION public.fin_tax_correction(uuid, jsonb) TO authenticated;

-- Rendu client : instantané figé
CREATE OR REPLACE FUNCTION public.entcrm_public_quote(_token uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE q ent_crm_quotes; r jsonb;
BEGIN
  SELECT * INTO q FROM ent_crm_quotes WHERE share_token = _token;
  IF q.id IS NULL THEN RETURN NULL; END IF;
  IF q.client_viewed_at IS NULL THEN UPDATE ent_crm_quotes SET client_viewed_at = now() WHERE id = q.id; END IF;
  SELECT jsonb_build_object(
    'number', q.number, 'version', q.version, 'status', q.status, 'lines', q.lines,
    'subtotal', q.subtotal, 'taxes_applied', q.taxes_applied, 'gst_rate', q.gst_rate, 'qst_rate', q.qst_rate,
    'tax_gst', q.tax_gst, 'tax_qst', q.tax_qst, 'total', q.total,
    'tax_snapshot', CASE WHEN coalesce((q.tax_snapshot->>'final')::boolean,false) THEN q.tax_snapshot END,
    'inclusions', q.inclusions, 'exclusions', q.exclusions, 'conditions', q.conditions, 'valid_until', q.valid_until,
    'company', (SELECT name FROM jsc_companies WHERE id = q.company_id),
    'gst_number', coalesce(q.tax_snapshot->'seller'->>'gst_number', (SELECT gst_number FROM ent_crm_settings WHERE company_id = q.company_id)),
    'qst_number', coalesce(q.tax_snapshot->'seller'->>'qst_number', (SELECT qst_number FROM ent_crm_settings WHERE company_id = q.company_id)),
    'client', (SELECT name FROM ent_crm_clients WHERE id = q.client_id),
    'accepted_by_name', q.accepted_by_name, 'accepted_at', q.accepted_at,
    'client_response', q.client_response, 'client_responded_at', q.client_responded_at,
    'files', coalesce((SELECT jsonb_agg(jsonb_build_object('id', f.id, 'name', coalesce(f.title, f.file_name), 'mime', f.mime_type, 'size', f.size_bytes))
       FROM ent_crm_file_links l JOIN ent_crm_files f ON f.id = l.file_id
       WHERE l.owner_type = 'quote' AND l.owner_id = q.id AND l.client_visible AND f.archived_at IS NULL), '[]'::jsonb)
  ) INTO r;
  RETURN r;
END $$;