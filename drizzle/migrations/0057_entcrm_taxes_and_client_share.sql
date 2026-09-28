ALTER TABLE public.ent_crm_settings
  ADD COLUMN IF NOT EXISTS taxes_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS gst_rate numeric,
  ADD COLUMN IF NOT EXISTS qst_rate numeric,
  ADD COLUMN IF NOT EXISTS gst_number text,
  ADD COLUMN IF NOT EXISTS qst_number text,
  ADD COLUMN IF NOT EXISTS brand_color text,
  ADD COLUMN IF NOT EXISTS quote_footer text;

ALTER TABLE public.ent_crm_quotes
  ADD COLUMN IF NOT EXISTS taxes_applied boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS gst_rate numeric,
  ADD COLUMN IF NOT EXISTS qst_rate numeric,
  ADD COLUMN IF NOT EXISTS tax_gst numeric,
  ADD COLUMN IF NOT EXISTS tax_qst numeric,
  ADD COLUMN IF NOT EXISTS total numeric,
  ADD COLUMN IF NOT EXISTS share_token uuid,
  ADD COLUMN IF NOT EXISTS shared_at timestamptz,
  ADD COLUMN IF NOT EXISTS client_viewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS client_response text,
  ADD COLUMN IF NOT EXISTS client_response_name text,
  ADD COLUMN IF NOT EXISTS client_response_note text,
  ADD COLUMN IF NOT EXISTS client_responded_at timestamptz;
CREATE UNIQUE INDEX IF NOT EXISTS ent_crm_quotes_share_token_idx ON public.ent_crm_quotes(share_token) WHERE share_token IS NOT NULL;

-- Taxes figées au moment de la remise, calculées côté serveur depuis les paramètres de l'entreprise.
CREATE OR REPLACE FUNCTION public.entcrm_quote_freeze()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE s ent_crm_settings;
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.status = 'remise' AND NEW.status = 'remise'
     AND (NEW.lines IS DISTINCT FROM OLD.lines OR NEW.subtotal IS DISTINCT FROM OLD.subtotal) THEN
    RAISE EXCEPTION 'Soumission remise : créez une révision pour la modifier';
  END IF;
  IF NEW.status = 'remise' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'remise') THEN
    SELECT * INTO s FROM ent_crm_settings WHERE company_id = NEW.company_id;
    IF s.taxes_enabled AND s.gst_rate IS NOT NULL AND s.qst_rate IS NOT NULL THEN
      NEW.taxes_applied := true; NEW.gst_rate := s.gst_rate; NEW.qst_rate := s.qst_rate;
      NEW.tax_gst := round(NEW.subtotal * s.gst_rate / 100, 2);
      NEW.tax_qst := round(NEW.subtotal * s.qst_rate / 100, 2);
      NEW.total := NEW.subtotal + NEW.tax_gst + NEW.tax_qst;
    ELSE
      NEW.taxes_applied := false; NEW.gst_rate := NULL; NEW.qst_rate := NULL;
      NEW.tax_gst := NULL; NEW.tax_qst := NULL; NEW.total := NULL;
    END IF;
  END IF;
  IF NEW.status = 'brouillon' THEN NEW.share_token := NULL; NEW.shared_at := NULL; END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS entcrm_quote_freeze_t ON public.ent_crm_quotes;
CREATE TRIGGER entcrm_quote_freeze_t BEFORE INSERT OR UPDATE ON public.ent_crm_quotes
  FOR EACH ROW EXECUTE FUNCTION public.entcrm_quote_freeze();

-- Partage : lien unique vers la version remise.
CREATE OR REPLACE FUNCTION public.entcrm_share_quote(_quote_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE q ent_crm_quotes; t uuid;
BEGIN
  SELECT * INTO q FROM ent_crm_quotes WHERE id = _quote_id;
  IF q.id IS NULL OR NOT public.entcrm_can_write(q.company_id) THEN RAISE EXCEPTION 'Accès refusé'; END IF;
  IF q.status NOT IN ('remise','acceptee','refusee') THEN RAISE EXCEPTION 'Marquez d''abord la soumission comme remise'; END IF;
  IF q.share_token IS NOT NULL THEN RETURN q.share_token; END IF;
  t := gen_random_uuid();
  UPDATE ent_crm_quotes SET share_token = t, shared_at = now() WHERE id = _quote_id;
  RETURN t;
END $$;
REVOKE ALL ON FUNCTION public.entcrm_share_quote(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.entcrm_share_quote(uuid) TO authenticated;

-- Consultation publique (client fictif ou réel) : uniquement la version liée au jeton et les pièces cochées « pour le client ».
CREATE OR REPLACE FUNCTION public.entcrm_public_quote(_token uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE q ent_crm_quotes; r jsonb;
BEGIN
  SELECT * INTO q FROM ent_crm_quotes WHERE share_token = _token;
  IF q.id IS NULL THEN RETURN NULL; END IF;
  IF q.client_viewed_at IS NULL THEN
    UPDATE ent_crm_quotes SET client_viewed_at = now() WHERE id = q.id;
  END IF;
  SELECT jsonb_build_object(
    'number', q.number, 'version', q.version, 'status', q.status, 'lines', q.lines,
    'subtotal', q.subtotal, 'taxes_applied', q.taxes_applied, 'gst_rate', q.gst_rate, 'qst_rate', q.qst_rate,
    'tax_gst', q.tax_gst, 'tax_qst', q.tax_qst, 'total', q.total,
    'inclusions', q.inclusions, 'exclusions', q.exclusions, 'conditions', q.conditions, 'valid_until', q.valid_until,
    'company', (SELECT name FROM jsc_companies WHERE id = q.company_id),
    'gst_number', (SELECT gst_number FROM ent_crm_settings WHERE company_id = q.company_id),
    'qst_number', (SELECT qst_number FROM ent_crm_settings WHERE company_id = q.company_id),
    'client', (SELECT name FROM ent_crm_clients WHERE id = q.client_id),
    'accepted_by_name', q.accepted_by_name, 'accepted_at', q.accepted_at,
    'client_response', q.client_response, 'client_responded_at', q.client_responded_at,
    'files', coalesce((SELECT jsonb_agg(jsonb_build_object('id', f.id, 'name', coalesce(f.title, f.file_name), 'mime', f.mime_type, 'size', f.size_bytes))
       FROM ent_crm_file_links l JOIN ent_crm_files f ON f.id = l.file_id
       WHERE l.owner_type = 'quote' AND l.owner_id = q.id AND l.client_visible AND f.archived_at IS NULL), '[]'::jsonb)
  ) INTO r;
  RETURN r;
END $$;
REVOKE ALL ON FUNCTION public.entcrm_public_quote(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.entcrm_public_quote(uuid) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.entcrm_public_respond(_token uuid, _decision text, _name text, _note text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE q ent_crm_quotes;
BEGIN
  SELECT * INTO q FROM ent_crm_quotes WHERE share_token = _token FOR UPDATE;
  IF q.id IS NULL THEN RAISE EXCEPTION 'Lien invalide'; END IF;
  IF q.status <> 'remise' THEN RAISE EXCEPTION 'Cette soumission a déjà reçu une réponse ou a été remplacée'; END IF;
  IF _decision NOT IN ('acceptee','refusee') THEN RAISE EXCEPTION 'Réponse invalide'; END IF;
  IF coalesce(trim(_name),'') = '' OR length(_name) > 120 THEN RAISE EXCEPTION 'Nom requis'; END IF;
  IF q.valid_until IS NOT NULL AND q.valid_until < current_date AND _decision = 'acceptee' THEN RAISE EXCEPTION 'Soumission expirée : contactez l''entreprise'; END IF;
  IF _decision = 'acceptee' THEN
    PERFORM set_config('entcrm.accepting','on',true);
    UPDATE ent_crm_quotes SET status='acceptee', accepted_source='Réponse en ligne du client', accepted_by_name=trim(_name), accepted_at=now(),
      client_response='acceptee', client_response_name=trim(_name), client_response_note=left(_note, 2000), client_responded_at=now(), updated_at=now() WHERE id=q.id;
    PERFORM set_config('entcrm.accepting','off',true);
  ELSE
    UPDATE ent_crm_quotes SET status='refusee', client_response='refusee', client_response_name=trim(_name), client_response_note=left(_note, 2000), client_responded_at=now(), updated_at=now() WHERE id=q.id;
  END IF;
  RETURN _decision;
END $$;
REVOKE ALL ON FUNCTION public.entcrm_public_respond(uuid, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.entcrm_public_respond(uuid, text, text, text) TO anon, authenticated;