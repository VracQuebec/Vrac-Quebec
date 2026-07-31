-- 1. Numéro d'estimation
ALTER TABLE public.jsc_estimates ADD COLUMN IF NOT EXISTS estimate_number text;

-- 2. Fonction snapshot des paramètres pour les estimations
CREATE OR REPLACE FUNCTION public.jsc_fill_settings_snapshot()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.settings_snapshot IS NULL OR NEW.settings_snapshot = '{}'::jsonb THEN
    SELECT COALESCE(jsonb_object_agg(s.key, s.value), '{}'::jsonb)
      INTO NEW.settings_snapshot
      FROM public.jsc_settings s
     WHERE (s.company_id = NEW.company_id OR s.company_id IS NULL)
       AND s.archived_at IS NULL;
  END IF;
  RETURN NEW;
END;
$$;

-- 3. Validation générique des montants
CREATE OR REPLACE FUNCTION public.jsc_validate_amounts()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v jsonb := to_jsonb(NEW);
  k text;
BEGIN
  FOREACH k IN ARRAY ARRAY['subtotal','tax_total','total','amount_paid','material_cost','transport_cost','quantity','unit_price','line_total','distance_km','trips'] LOOP
    IF (v ? k) AND (v ->> k) IS NOT NULL AND (v ->> k)::numeric < 0 THEN
      RAISE EXCEPTION 'Montant négatif interdit sur %.% (valeur %)', TG_TABLE_NAME, k, v ->> k;
    END IF;
  END LOOP;
  RETURN NEW;
END;
$$;

-- 4. Solde des factures
CREATE OR REPLACE FUNCTION public.jsc_invoice_balance()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.balance := COALESCE(NEW.total, 0) - COALESCE(NEW.amount_paid, 0);
  IF NEW.status = 'payee' AND NEW.balance > 0 THEN
    NEW.status := 'partiellement_payee';
  END IF;
  RETURN NEW;
END;
$$;

-- 5. Installation des triggers
DO $do$
DECLARE
  t text;
  r record;
BEGIN
  -- updated_at + audit sur toutes les tables jsc_*
  FOR r IN
    SELECT c.relname AS tbl,
           EXISTS (SELECT 1 FROM information_schema.columns col
                    WHERE col.table_schema='public' AND col.table_name=c.relname
                      AND col.column_name='updated_at') AS has_updated
      FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
     WHERE n.nspname='public' AND c.relkind='r' AND c.relname LIKE 'jsc\_%'
  LOOP
    IF r.has_updated THEN
      EXECUTE format('DROP TRIGGER IF EXISTS trg_%1$s_touch ON public.%1$I', r.tbl);
      EXECUTE format('CREATE TRIGGER trg_%1$s_touch BEFORE UPDATE ON public.%1$I FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at()', r.tbl);
    END IF;

    IF r.tbl NOT IN ('jsc_audit_log','jsc_status_history','jsc_number_counters','jsc_notifications','jsc_bi_layouts') THEN
      EXECUTE format('DROP TRIGGER IF EXISTS trg_%1$s_audit ON public.%1$I', r.tbl);
      EXECUTE format('CREATE TRIGGER trg_%1$s_audit AFTER INSERT OR UPDATE OR DELETE ON public.%1$I FOR EACH ROW EXECUTE FUNCTION public.jsc_audit_trigger()', r.tbl);
    END IF;
  END LOOP;
END
$do$;

-- Numérotation automatique
DROP TRIGGER IF EXISTS trg_jsc_requests_number ON public.jsc_requests;
CREATE TRIGGER trg_jsc_requests_number BEFORE INSERT ON public.jsc_requests
  FOR EACH ROW EXECUTE FUNCTION public.jsc_assign_number('request_number', 'request');

DROP TRIGGER IF EXISTS trg_jsc_estimates_number ON public.jsc_estimates;
CREATE TRIGGER trg_jsc_estimates_number BEFORE INSERT ON public.jsc_estimates
  FOR EACH ROW EXECUTE FUNCTION public.jsc_assign_number('estimate_number', 'estimate');

DROP TRIGGER IF EXISTS trg_jsc_quotes_number ON public.jsc_quotes;
CREATE TRIGGER trg_jsc_quotes_number BEFORE INSERT ON public.jsc_quotes
  FOR EACH ROW EXECUTE FUNCTION public.jsc_assign_number('quote_number', 'quote');

DROP TRIGGER IF EXISTS trg_jsc_orders_number ON public.jsc_orders;
CREATE TRIGGER trg_jsc_orders_number BEFORE INSERT ON public.jsc_orders
  FOR EACH ROW EXECUTE FUNCTION public.jsc_assign_number('order_number', 'order');

DROP TRIGGER IF EXISTS trg_jsc_deliveries_number ON public.jsc_deliveries;
CREATE TRIGGER trg_jsc_deliveries_number BEFORE INSERT ON public.jsc_deliveries
  FOR EACH ROW EXECUTE FUNCTION public.jsc_assign_number('delivery_number', 'delivery');

DROP TRIGGER IF EXISTS trg_jsc_invoices_number ON public.jsc_invoices;
CREATE TRIGGER trg_jsc_invoices_number BEFORE INSERT ON public.jsc_invoices
  FOR EACH ROW EXECUTE FUNCTION public.jsc_assign_number('invoice_number', 'invoice');

DROP TRIGGER IF EXISTS trg_jsc_projects_number ON public.jsc_projects;
CREATE TRIGGER trg_jsc_projects_number BEFORE INSERT ON public.jsc_projects
  FOR EACH ROW EXECUTE FUNCTION public.jsc_assign_number('project_number', 'project');

-- Historique des statuts
DROP TRIGGER IF EXISTS trg_jsc_requests_status ON public.jsc_requests;
CREATE TRIGGER trg_jsc_requests_status AFTER INSERT OR UPDATE ON public.jsc_requests
  FOR EACH ROW EXECUTE FUNCTION public.jsc_track_status('request');

DROP TRIGGER IF EXISTS trg_jsc_quotes_status ON public.jsc_quotes;
CREATE TRIGGER trg_jsc_quotes_status AFTER INSERT OR UPDATE ON public.jsc_quotes
  FOR EACH ROW EXECUTE FUNCTION public.jsc_track_status('quote');

DROP TRIGGER IF EXISTS trg_jsc_orders_status ON public.jsc_orders;
CREATE TRIGGER trg_jsc_orders_status AFTER INSERT OR UPDATE ON public.jsc_orders
  FOR EACH ROW EXECUTE FUNCTION public.jsc_track_status('order');

DROP TRIGGER IF EXISTS trg_jsc_deliveries_status ON public.jsc_deliveries;
CREATE TRIGGER trg_jsc_deliveries_status AFTER INSERT OR UPDATE ON public.jsc_deliveries
  FOR EACH ROW EXECUTE FUNCTION public.jsc_track_status('delivery');

DROP TRIGGER IF EXISTS trg_jsc_invoices_status ON public.jsc_invoices;
CREATE TRIGGER trg_jsc_invoices_status AFTER INSERT OR UPDATE ON public.jsc_invoices
  FOR EACH ROW EXECUTE FUNCTION public.jsc_track_status('invoice');

DROP TRIGGER IF EXISTS trg_jsc_incidents_status ON public.jsc_incidents;
CREATE TRIGGER trg_jsc_incidents_status AFTER INSERT OR UPDATE ON public.jsc_incidents
  FOR EACH ROW EXECUTE FUNCTION public.jsc_track_status('incident');

-- Snapshot + validations
DROP TRIGGER IF EXISTS trg_jsc_estimates_snapshot ON public.jsc_estimates;
CREATE TRIGGER trg_jsc_estimates_snapshot BEFORE INSERT ON public.jsc_estimates
  FOR EACH ROW EXECUTE FUNCTION public.jsc_fill_settings_snapshot();

DO $do$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['jsc_estimates','jsc_quotes','jsc_orders','jsc_invoices','jsc_invoice_lines','jsc_deliveries'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%1$s_validate ON public.%1$I', t);
    EXECUTE format('CREATE TRIGGER trg_%1$s_validate BEFORE INSERT OR UPDATE ON public.%1$I FOR EACH ROW EXECUTE FUNCTION public.jsc_validate_amounts()', t);
  END LOOP;
END
$do$;

DROP TRIGGER IF EXISTS trg_jsc_invoices_balance ON public.jsc_invoices;
CREATE TRIGGER trg_jsc_invoices_balance BEFORE INSERT OR UPDATE ON public.jsc_invoices
  FOR EACH ROW EXECUTE FUNCTION public.jsc_invoice_balance();

-- 6. Intégrité : une seule estimation retenue par demande
CREATE UNIQUE INDEX IF NOT EXISTS jsc_estimates_one_selected
  ON public.jsc_estimates (request_id) WHERE is_selected;

CREATE UNIQUE INDEX IF NOT EXISTS jsc_requests_number_uniq ON public.jsc_requests (company_id, request_number) WHERE request_number IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS jsc_quotes_number_uniq ON public.jsc_quotes (company_id, quote_number) WHERE quote_number IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS jsc_orders_number_uniq ON public.jsc_orders (company_id, order_number) WHERE order_number IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS jsc_invoices_number_uniq ON public.jsc_invoices (company_id, invoice_number) WHERE invoice_number IS NOT NULL;

-- 7. Index sur toutes les clés étrangères non indexées
DO $do$
DECLARE
  r record;
  v_cols text;
  v_name text;
BEGIN
  FOR r IN
    SELECT c.conrelid::regclass::text AS tbl,
           c.conname,
           (SELECT string_agg(quote_ident(a.attname), ', ' ORDER BY x.ord)
              FROM unnest(c.conkey) WITH ORDINALITY AS x(attnum, ord)
              JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = x.attnum) AS cols,
           (SELECT string_agg(a.attname, '_' ORDER BY x.ord)
              FROM unnest(c.conkey) WITH ORDINALITY AS x(attnum, ord)
              JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = x.attnum) AS colnames
      FROM pg_constraint c
      JOIN pg_class cl ON cl.oid = c.conrelid
      JOIN pg_namespace n ON n.oid = cl.relnamespace
     WHERE c.contype = 'f' AND n.nspname = 'public' AND cl.relname LIKE 'jsc\_%'
       AND NOT EXISTS (
         SELECT 1 FROM pg_index i
          WHERE i.indrelid = c.conrelid
            AND (i.indkey::int2[])[0:array_length(c.conkey,1)-1] = c.conkey
       )
  LOOP
    v_name := left('idx_' || replace(r.tbl, 'public.', '') || '_' || r.colnames, 63);
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %s (%s)', v_name, r.tbl, r.cols);
  END LOOP;
END
$do$;

-- Index de travail supplémentaires
CREATE INDEX IF NOT EXISTS idx_jsc_requests_status_created ON public.jsc_requests (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_jsc_orders_status_sched ON public.jsc_orders (status, scheduled_date);
CREATE INDEX IF NOT EXISTS idx_jsc_deliveries_sched ON public.jsc_deliveries (scheduled_date, status);
CREATE INDEX IF NOT EXISTS idx_jsc_invoices_status_issued ON public.jsc_invoices (status, issued_at DESC);
CREATE INDEX IF NOT EXISTS idx_jsc_audit_log_entity ON public.jsc_audit_log (table_name, record_id, created_at DESC);