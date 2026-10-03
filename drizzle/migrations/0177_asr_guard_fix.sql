CREATE OR REPLACE FUNCTION public.asr_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE pc uuid;
BEGIN
  IF TG_TABLE_NAME = 'asr_periods' THEN
    SELECT company_id INTO pc FROM asr_policies WHERE id = NEW.policy_id;
    IF TG_OP = 'UPDATE' AND current_setting('asr.rpc', true) IS DISTINCT FROM '1' THEN
      IF NEW.confirmed_at IS DISTINCT FROM OLD.confirmed_at OR NEW.suspended_reason IS DISTINCT FROM OLD.suspended_reason OR NEW.previous_id IS DISTINCT FROM OLD.previous_id THEN
        RAISE EXCEPTION 'Utilisez les actions prévues (confirmation, suspension)'; END IF;
    END IF;
  ELSIF TG_TABLE_NAME = 'asr_coverages' THEN
    SELECT company_id INTO pc FROM asr_periods WHERE id = NEW.period_id;
  ELSIF TG_TABLE_NAME = 'asr_assets' THEN
    SELECT company_id INTO pc FROM asr_periods WHERE id = NEW.period_id;
    IF NEW.truck_id IS NOT NULL THEN
      IF NOT EXISTS (SELECT 1 FROM trucks WHERE id=NEW.truck_id AND company_id=NEW.company_id) THEN
        RAISE EXCEPTION 'Bien d''une autre entreprise' USING ERRCODE='42501'; END IF;
    END IF;
  ELSIF TG_TABLE_NAME = 'asr_quotes' THEN
    SELECT company_id INTO pc FROM asr_renewals WHERE id = NEW.renewal_id;
  ELSIF TG_TABLE_NAME = 'asr_questions' THEN
    SELECT company_id INTO pc FROM asr_policies WHERE id = NEW.policy_id;
    IF TG_OP = 'UPDATE' THEN
      IF NEW.answer IS DISTINCT FROM OLD.answer THEN NEW.answered_by := auth.uid(); NEW.answered_at := now(); END IF;
    END IF;
  ELSIF TG_TABLE_NAME = 'asr_documents' THEN
    pc := NEW.company_id;
    IF NEW.policy_id IS NOT NULL THEN
      IF (SELECT company_id FROM asr_policies WHERE id=NEW.policy_id) <> NEW.company_id THEN RAISE EXCEPTION 'Entreprise incohérente'; END IF;
    END IF;
    IF TG_OP = 'UPDATE' THEN
      IF NEW.storage_path <> OLD.storage_path OR NEW.size_bytes <> OLD.size_bytes THEN RAISE EXCEPTION 'Le fichier original ne peut pas être remplacé'; END IF;
    ELSIF NEW.supersedes_id IS NOT NULL THEN
      SELECT version + 1 INTO NEW.version FROM asr_documents WHERE id = NEW.supersedes_id AND company_id = NEW.company_id;
      IF NEW.version IS NULL THEN RAISE EXCEPTION 'Version précédente introuvable'; END IF;
    END IF;
  ELSE pc := NEW.company_id; END IF;
  IF pc IS NULL OR pc <> NEW.company_id THEN RAISE EXCEPTION 'Entreprise incohérente' USING ERRCODE='42501'; END IF;
  IF TG_OP = 'UPDATE' AND TG_TABLE_NAME NOT IN ('asr_documents','asr_assets') THEN NEW.updated_at := now(); END IF;
  RETURN NEW;
END $$;