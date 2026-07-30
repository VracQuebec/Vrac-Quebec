-- =====================================================================
-- Transport JSC — Fondations : multi-entreprise, archivage, audit,
-- transactions, permissions, export/import de configuration.
-- =====================================================================

-- 1) Entreprises ------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.jsc_companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  legal_name text,
  code text NOT NULL,
  phone text,
  email text,
  address text,
  currency text NOT NULL DEFAULT 'CAD',
  timezone text NOT NULL DEFAULT 'America/Toronto',
  is_default boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  archived_at timestamptz,
  archived_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS jsc_companies_code_key ON public.jsc_companies (lower(code));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.jsc_companies TO authenticated;
GRANT ALL ON public.jsc_companies TO service_role;
ALTER TABLE public.jsc_companies ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins manage jsc_companies" ON public.jsc_companies;
CREATE POLICY "Admins manage jsc_companies" ON public.jsc_companies
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP TRIGGER IF EXISTS trg_jsc_companies_updated ON public.jsc_companies;
CREATE TRIGGER trg_jsc_companies_updated BEFORE UPDATE ON public.jsc_companies
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

INSERT INTO public.jsc_companies (name, legal_name, code, is_default)
SELECT 'Transport JSC', 'Transport JSC', 'JSC', true
WHERE NOT EXISTS (SELECT 1 FROM public.jsc_companies);

-- Entreprise par défaut (helper) --------------------------------------
CREATE OR REPLACE FUNCTION public.jsc_default_company_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM public.jsc_companies
  ORDER BY is_default DESC, created_at ASC
  LIMIT 1
$$;

-- Permission centralisée ----------------------------------------------
CREATE OR REPLACE FUNCTION public.jsc_can_manage(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_role(_user_id, 'admin')
$$;

-- 2) Colonnes communes : company_id + archivage ------------------------
DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'jsc_zones','jsc_suppliers','jsc_pickup_locations','jsc_materials',
    'jsc_material_prices','jsc_trucks','jsc_transport_rates','jsc_taxes','jsc_settings'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format(
      'ALTER TABLE public.%I
         ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.jsc_companies(id) ON DELETE RESTRICT,
         ADD COLUMN IF NOT EXISTS archived_at timestamptz,
         ADD COLUMN IF NOT EXISTS archived_by uuid', t);
    EXECUTE format('UPDATE public.%I SET company_id = public.jsc_default_company_id() WHERE company_id IS NULL', t);
    EXECUTE format('ALTER TABLE public.%I ALTER COLUMN company_id SET DEFAULT public.jsc_default_company_id()', t);
    EXECUTE format('ALTER TABLE public.%I ALTER COLUMN company_id SET NOT NULL', t);
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON public.%I (company_id)', t || '_company_idx', t);
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON public.%I (archived_at)', t || '_archived_idx', t);
    -- Politique unique et explicite par table
    EXECUTE format('DROP POLICY IF EXISTS "Admins manage %s" ON public.%I', t, t);
    EXECUTE format(
      'CREATE POLICY "Admins manage %s" ON public.%I FOR ALL TO authenticated
         USING (public.jsc_can_manage(auth.uid()))
         WITH CHECK (public.jsc_can_manage(auth.uid()))', t, t);
  END LOOP;
END $$;

-- Unicité par entreprise ----------------------------------------------
ALTER TABLE public.jsc_materials DROP CONSTRAINT IF EXISTS jsc_materials_code_key;
CREATE UNIQUE INDEX IF NOT EXISTS jsc_materials_company_code_key
  ON public.jsc_materials (company_id, lower(code)) WHERE code IS NOT NULL;

ALTER TABLE public.jsc_taxes DROP CONSTRAINT IF EXISTS jsc_taxes_code_key;
CREATE UNIQUE INDEX IF NOT EXISTS jsc_taxes_company_code_key
  ON public.jsc_taxes (company_id, lower(code)) WHERE code IS NOT NULL;

ALTER TABLE public.jsc_settings DROP CONSTRAINT IF EXISTS jsc_settings_key_key;
CREATE UNIQUE INDEX IF NOT EXISTS jsc_settings_company_key_key
  ON public.jsc_settings (company_id, key);

-- 3) Journal d'audit ---------------------------------------------------
CREATE TABLE IF NOT EXISTS public.jsc_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid,
  table_name text NOT NULL,
  record_id uuid,
  record_label text,
  action text NOT NULL,
  actor_id uuid,
  actor_email text,
  changed_fields text[] NOT NULL DEFAULT '{}',
  old_values jsonb,
  new_values jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS jsc_audit_log_table_idx ON public.jsc_audit_log (table_name, created_at DESC);
CREATE INDEX IF NOT EXISTS jsc_audit_log_record_idx ON public.jsc_audit_log (record_id, created_at DESC);
CREATE INDEX IF NOT EXISTS jsc_audit_log_company_idx ON public.jsc_audit_log (company_id, created_at DESC);

GRANT SELECT ON public.jsc_audit_log TO authenticated;
GRANT ALL ON public.jsc_audit_log TO service_role;
ALTER TABLE public.jsc_audit_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins read jsc_audit_log" ON public.jsc_audit_log;
CREATE POLICY "Admins read jsc_audit_log" ON public.jsc_audit_log
  FOR SELECT TO authenticated
  USING (public.jsc_can_manage(auth.uid()));

CREATE OR REPLACE FUNCTION public.jsc_audit_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old jsonb := CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE to_jsonb(OLD) END;
  v_new jsonb := CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE to_jsonb(NEW) END;
  v_changed text[] := '{}';
  v_old_diff jsonb := '{}'::jsonb;
  v_new_diff jsonb := '{}'::jsonb;
  v_action text := lower(TG_OP);
  v_key text;
  v_record_id uuid;
  v_company uuid;
  v_label text;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    FOR v_key IN SELECT jsonb_object_keys(v_new) LOOP
      IF v_key IN ('updated_at') THEN CONTINUE; END IF;
      IF (v_old -> v_key) IS DISTINCT FROM (v_new -> v_key) THEN
        v_changed := v_changed || v_key;
        v_old_diff := v_old_diff || jsonb_build_object(v_key, v_old -> v_key);
        v_new_diff := v_new_diff || jsonb_build_object(v_key, v_new -> v_key);
      END IF;
    END LOOP;
    IF array_length(v_changed, 1) IS NULL THEN
      RETURN NEW;
    END IF;
    IF v_old ? 'archived_at' THEN
      IF (v_old ->> 'archived_at') IS NULL AND (v_new ->> 'archived_at') IS NOT NULL THEN
        v_action := 'archive';
      ELSIF (v_old ->> 'archived_at') IS NOT NULL AND (v_new ->> 'archived_at') IS NULL THEN
        v_action := 'restore';
      END IF;
    END IF;
  ELSE
    v_old_diff := v_old;
    v_new_diff := v_new;
  END IF;

  v_record_id := NULLIF(COALESCE(v_new ->> 'id', v_old ->> 'id'), '')::uuid;
  BEGIN
    v_company := NULLIF(COALESCE(v_new ->> 'company_id', v_old ->> 'company_id'), '')::uuid;
  EXCEPTION WHEN others THEN v_company := NULL;
  END;
  v_label := COALESCE(v_new ->> 'name', v_old ->> 'name', v_new ->> 'key', v_old ->> 'key',
                      v_new ->> 'title', v_old ->> 'title');

  INSERT INTO public.jsc_audit_log (
    company_id, table_name, record_id, record_label, action,
    actor_id, actor_email, changed_fields, old_values, new_values
  ) VALUES (
    v_company, TG_TABLE_NAME, v_record_id, v_label, v_action,
    auth.uid(), NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'email',
    v_changed, v_old_diff, v_new_diff
  );

  RETURN COALESCE(NEW, OLD);
END $$;

-- Attacher l'audit à tous les modules + soumissions / demandes ---------
DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'jsc_companies','jsc_zones','jsc_suppliers','jsc_pickup_locations','jsc_materials',
    'jsc_material_prices','jsc_trucks','jsc_transport_rates','jsc_taxes','jsc_settings',
    'submissions','transport_requests'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    IF to_regclass('public.' || t) IS NULL THEN CONTINUE; END IF;
    EXECUTE format('DROP TRIGGER IF EXISTS trg_jsc_audit ON public.%I', t);
    EXECUTE format(
      'CREATE TRIGGER trg_jsc_audit AFTER INSERT OR UPDATE OR DELETE ON public.%I
         FOR EACH ROW EXECUTE FUNCTION public.jsc_audit_trigger()', t);
  END LOOP;
END $$;

-- 4) Archivage / restauration transactionnels --------------------------
CREATE OR REPLACE FUNCTION public.jsc_archive_record(_table text, _id uuid, _restore boolean DEFAULT false)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_allowed text[] := ARRAY[
    'jsc_companies','jsc_zones','jsc_suppliers','jsc_pickup_locations','jsc_materials',
    'jsc_material_prices','jsc_trucks','jsc_transport_rates','jsc_taxes','jsc_settings'
  ];
  v_row jsonb;
BEGIN
  IF NOT public.jsc_can_manage(auth.uid()) THEN
    RAISE EXCEPTION 'Accès refusé';
  END IF;
  IF NOT (_table = ANY (v_allowed)) THEN
    RAISE EXCEPTION 'Table non autorisée: %', _table;
  END IF;

  IF _restore THEN
    EXECUTE format(
      'UPDATE public.%I SET archived_at = NULL, archived_by = NULL, is_active = true
         WHERE id = $1 RETURNING to_jsonb(%I.*)', _table, _table)
      INTO v_row USING _id;
  ELSE
    EXECUTE format(
      'UPDATE public.%I SET archived_at = now(), archived_by = auth.uid(), is_active = false
         WHERE id = $1 RETURNING to_jsonb(%I.*)', _table, _table)
      INTO v_row USING _id;
  END IF;

  IF v_row IS NULL THEN
    RAISE EXCEPTION 'Enregistrement introuvable';
  END IF;
  RETURN v_row;
END $$;

REVOKE ALL ON FUNCTION public.jsc_archive_record(text, uuid, boolean) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.jsc_archive_record(text, uuid, boolean) TO authenticated;

-- 5) Export / import de la configuration -------------------------------
CREATE OR REPLACE FUNCTION public.jsc_export_config(_company_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company uuid := COALESCE(_company_id, public.jsc_default_company_id());
  v_tables text[] := ARRAY[
    'jsc_zones','jsc_suppliers','jsc_pickup_locations','jsc_materials',
    'jsc_material_prices','jsc_trucks','jsc_transport_rates','jsc_taxes','jsc_settings'
  ];
  t text;
  v_data jsonb := '{}'::jsonb;
  v_rows jsonb;
BEGIN
  IF NOT public.jsc_can_manage(auth.uid()) THEN
    RAISE EXCEPTION 'Accès refusé';
  END IF;

  FOREACH t IN ARRAY v_tables LOOP
    EXECUTE format(
      'SELECT COALESCE(jsonb_agg(to_jsonb(x.*) ORDER BY x.created_at), ''[]''::jsonb)
         FROM public.%I x WHERE x.company_id = $1', t)
      INTO v_rows USING v_company;
    v_data := v_data || jsonb_build_object(t, v_rows);
  END LOOP;

  RETURN jsonb_build_object(
    'version', 1,
    'exported_at', now(),
    'company', (SELECT to_jsonb(c.*) FROM public.jsc_companies c WHERE c.id = v_company),
    'tables', v_data
  );
END $$;

REVOKE ALL ON FUNCTION public.jsc_export_config(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.jsc_export_config(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.jsc_import_config(_payload jsonb, _company_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company uuid := COALESCE(_company_id, public.jsc_default_company_id());
  -- Ordre de dépendance : parents avant enfants
  v_tables text[] := ARRAY[
    'jsc_zones','jsc_suppliers','jsc_pickup_locations','jsc_materials',
    'jsc_material_prices','jsc_trucks','jsc_transport_rates','jsc_taxes','jsc_settings'
  ];
  t text;
  v_rows jsonb;
  v_count int;
  v_result jsonb := '{}'::jsonb;
  v_cols text;
BEGIN
  IF NOT public.jsc_can_manage(auth.uid()) THEN
    RAISE EXCEPTION 'Accès refusé';
  END IF;
  IF _payload IS NULL OR NOT (_payload ? 'tables') THEN
    RAISE EXCEPTION 'Fichier de configuration invalide';
  END IF;

  FOREACH t IN ARRAY v_tables LOOP
    v_rows := _payload -> 'tables' -> t;
    IF v_rows IS NULL OR jsonb_typeof(v_rows) <> 'array' THEN CONTINUE; END IF;

    SELECT string_agg(format('%I', column_name), ', ')
      INTO v_cols
      FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = t;

    EXECUTE format(
      'INSERT INTO public.%I SELECT %s FROM jsonb_populate_recordset(NULL::public.%I,
         (SELECT jsonb_agg(e - ''company_id'' || jsonb_build_object(''company_id'', $2::text))
            FROM jsonb_array_elements($1) e))
       ON CONFLICT (id) DO UPDATE SET %s',
      t, v_cols, t,
      (SELECT string_agg(format('%I = EXCLUDED.%I', column_name, column_name), ', ')
         FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = t AND column_name NOT IN ('id','created_at'))
    ) USING v_rows, v_company;

    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_result := v_result || jsonb_build_object(t, v_count);
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'company_id', v_company, 'imported', v_result);
END $$;

REVOKE ALL ON FUNCTION public.jsc_import_config(jsonb, uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.jsc_import_config(jsonb, uuid) TO authenticated;