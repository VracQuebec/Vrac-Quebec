-- Surveillance quotidienne + alertes de capacité — PRÉPARÉ, NON INSTALLÉ (2026-10-28)
-- Remplace 01_surveillance_volumes.sql (ne pas installer les deux).
-- Une ligne par jour (~1-2 Ko). Aucune purge, aucune donnée métier modifiée.
-- Alertes : dans la cloche admin existante (crm_notifications via crm_notify, catégorie « systeme »).
-- Anti-répétition : clé de déduplication par type d'alerte et par semaine ISO -> au plus 1 alerte/type/semaine.
-- Seuils (octets, modifiables dans platform_capacity_thresholds) :
--   base > 6 Go (attention) / > 8 Go (critique); journal cron > 2 Go;
--   croissance > 300 Mo en 24 h; fichiers > 2 Go.

CREATE TABLE IF NOT EXISTS public.platform_capacity_thresholds (
  key text PRIMARY KEY,
  bytes bigint NOT NULL CHECK (bytes > 0),
  label text NOT NULL
);
GRANT SELECT, UPDATE ON public.platform_capacity_thresholds TO authenticated;
GRANT ALL ON public.platform_capacity_thresholds TO service_role;
ALTER TABLE public.platform_capacity_thresholds ENABLE ROW LEVEL SECURITY;
CREATE POLICY pct_admin_read ON public.platform_capacity_thresholds FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY pct_admin_update ON public.platform_capacity_thresholds FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
INSERT INTO public.platform_capacity_thresholds(key, bytes, label) VALUES
  ('db_warn', 6000000000, 'Base de données : attention'),
  ('db_crit', 8000000000, 'Base de données : critique'),
  ('cron_log', 2000000000, 'Journal des tâches planifiées'),
  ('growth_24h', 300000000, 'Croissance de la base en 24 h'),
  ('storage', 2000000000, 'Fichiers téléversés')
ON CONFLICT (key) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.platform_capacity_snapshots (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  captured_on date NOT NULL DEFAULT (now() AT TIME ZONE 'America/Toronto')::date UNIQUE,
  captured_at timestamptz NOT NULL DEFAULT now(),
  db_size_bytes bigint NOT NULL,
  cron_log_bytes bigint,
  storage_bytes bigint,
  storage_objects bigint,
  top_tables jsonb NOT NULL,
  alerts text[] NOT NULL DEFAULT '{}'
);
GRANT SELECT ON public.platform_capacity_snapshots TO authenticated;
GRANT ALL ON public.platform_capacity_snapshots TO service_role;
ALTER TABLE public.platform_capacity_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY pcs_admin_read ON public.platform_capacity_snapshots FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.platform_capacity_snapshot()
RETURNS text[]
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_db bigint := pg_database_size(current_database());
  v_cron bigint;
  v_sto bigint; v_obj bigint;
  v_prev bigint;
  v_top jsonb;
  v_alerts text[] := '{}';
  v_week text := to_char(now() AT TIME ZONE 'America/Toronto', 'IYYY-IW');
  t record;
BEGIN
  SELECT pg_total_relation_size(c.oid) INTO v_cron
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'cron' AND c.relname = 'job_run_details';
  BEGIN
    SELECT coalesce(sum((metadata->>'size')::bigint),0), count(*) INTO v_sto, v_obj FROM storage.objects;
  EXCEPTION WHEN undefined_table OR insufficient_privilege THEN v_sto := NULL; v_obj := NULL;
  END;
  SELECT coalesce(jsonb_agg(jsonb_build_object('schema', s.nspname, 'table', s.relname, 'bytes', s.b) ORDER BY s.b DESC), '[]')
    INTO v_top
    FROM (SELECT n.nspname, c.relname, pg_total_relation_size(c.oid) b
            FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
           WHERE c.relkind = 'r' AND n.nspname NOT IN ('pg_catalog','information_schema')
           ORDER BY 3 DESC LIMIT 10) s;
  SELECT db_size_bytes INTO v_prev FROM public.platform_capacity_snapshots
   WHERE captured_on < (now() AT TIME ZONE 'America/Toronto')::date ORDER BY captured_on DESC LIMIT 1;

  FOR t IN SELECT key, bytes, label FROM public.platform_capacity_thresholds LOOP
    IF (t.key = 'db_crit' AND v_db > t.bytes)
       OR (t.key = 'db_warn' AND v_db > t.bytes AND v_db <= (SELECT bytes FROM public.platform_capacity_thresholds WHERE key='db_crit'))
       OR (t.key = 'cron_log' AND coalesce(v_cron,0) > t.bytes)
       OR (t.key = 'growth_24h' AND v_prev IS NOT NULL AND v_db - v_prev > t.bytes)
       OR (t.key = 'storage' AND coalesce(v_sto,0) > t.bytes) THEN
      v_alerts := v_alerts || t.key;
      PERFORM public.crm_notify(
        'capacity:' || t.key || ':' || v_week, 'systeme', 'capacity_alert',
        CASE WHEN t.key = 'db_crit' THEN 'urgente' ELSE 'normale' END,
        'Capacité : ' || t.label,
        format('Base %s Mo, journal tâches %s Mo, fichiers %s Mo (seuil %s Mo).',
               v_db/1000000, coalesce(v_cron,0)/1000000, coalesce(v_sto,0)/1000000, t.bytes/1000000),
        NULL, NULL, '/admin', NULL, NULL, NULL,
        jsonb_build_object('db', v_db, 'cron', v_cron, 'storage', v_sto, 'threshold', t.key));
    END IF;
  END LOOP;

  INSERT INTO public.platform_capacity_snapshots(db_size_bytes, cron_log_bytes, storage_bytes, storage_objects, top_tables, alerts)
  VALUES (v_db, v_cron, v_sto, v_obj, v_top, v_alerts)
  ON CONFLICT (captured_on) DO UPDATE SET captured_at = now(), db_size_bytes = EXCLUDED.db_size_bytes,
    cron_log_bytes = EXCLUDED.cron_log_bytes, storage_bytes = EXCLUDED.storage_bytes,
    storage_objects = EXCLUDED.storage_objects, top_tables = EXCLUDED.top_tables, alerts = EXCLUDED.alerts;
  RETURN v_alerts;
END;
$$;
REVOKE ALL ON FUNCTION public.platform_capacity_snapshot() FROM PUBLIC, anon, authenticated;

-- Planification (à lancer séparément après installation, 1 exécution/jour = ~1 ligne de journal cron/jour) :
-- SELECT cron.schedule('platform-capacity-snapshot-daily', '10 4 * * *', $$SELECT public.platform_capacity_snapshot();$$);
-- Retour arrière : SELECT cron.unschedule('platform-capacity-snapshot-daily');
--   DROP FUNCTION public.platform_capacity_snapshot(); DROP TABLE public.platform_capacity_snapshots, public.platform_capacity_thresholds;
