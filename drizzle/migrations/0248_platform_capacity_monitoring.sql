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
  ('db_warn', 6000000000, 'Taille logique de la base : attention (n''est pas l''occupation du disque)'),
  ('db_crit', 8000000000, 'Taille logique de la base : critique (n''est pas l''occupation du disque)'),
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
  disk_used_pct numeric,
  ram_used_pct numeric,
  unmeasured text[] NOT NULL DEFAULT '{}',
  top_tables jsonb NOT NULL,
  alerts text[] NOT NULL DEFAULT '{}'
);
COMMENT ON COLUMN public.platform_capacity_snapshots.db_size_bytes IS 'Taille logique pg_database_size; distincte de l''occupation réelle du disque (WAL, système, marge).';
COMMENT ON COLUMN public.platform_capacity_snapshots.disk_used_pct IS 'Occupation réelle du disque : non mesurable depuis la base, reste NULL (voir unmeasured).';
COMMENT ON COLUMN public.platform_capacity_snapshots.ram_used_pct IS 'Mémoire vive : non mesurable depuis la base, reste NULL (voir unmeasured).';
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
  v_cron bigint; v_sto bigint; v_obj bigint; v_prev bigint; v_top jsonb;
  v_alerts text[] := '{}';
  v_unmeasured text[] := ARRAY['disque_occupation_reelle','memoire_vive'];
  v_week text := to_char(now() AT TIME ZONE 'America/Toronto', 'IYYY-IW');
  v_day text := to_char(now() AT TIME ZONE 'America/Toronto', 'YYYY-MM-DD');
  v_db_warn bigint; v_db_crit bigint;
  c record; v_key text; v_status text;
BEGIN
  SELECT pg_total_relation_size(cl.oid) INTO v_cron
    FROM pg_class cl JOIN pg_namespace n ON n.oid = cl.relnamespace
   WHERE n.nspname = 'cron' AND cl.relname = 'job_run_details';
  BEGIN
    SELECT coalesce(sum((metadata->>'size')::bigint),0), count(*) INTO v_sto, v_obj FROM storage.objects;
  EXCEPTION WHEN undefined_table OR insufficient_privilege THEN
    v_sto := NULL; v_obj := NULL; v_unmeasured := v_unmeasured || 'fichiers'::text;
  END;
  SELECT coalesce(jsonb_agg(jsonb_build_object('schema', s.nspname, 'table', s.relname, 'bytes', s.b) ORDER BY s.b DESC), '[]')
    INTO v_top
    FROM (SELECT n.nspname, cl.relname, pg_total_relation_size(cl.oid) b
            FROM pg_class cl JOIN pg_namespace n ON n.oid = cl.relnamespace
           WHERE cl.relkind = 'r' AND n.nspname NOT IN ('pg_catalog','information_schema')
           ORDER BY 3 DESC LIMIT 10) s;
  SELECT db_size_bytes INTO v_prev FROM public.platform_capacity_snapshots
   WHERE captured_on < (now() AT TIME ZONE 'America/Toronto')::date ORDER BY captured_on DESC LIMIT 1;
  SELECT bytes INTO v_db_warn FROM public.platform_capacity_thresholds WHERE key='db_warn';
  SELECT bytes INTO v_db_crit FROM public.platform_capacity_thresholds WHERE key='db_crit';

  -- Une condition par famille; le niveau fait partie de la clé : une hausse de gravité crée une nouvelle alerte.
  FOR c IN
    SELECT * FROM (VALUES
      ('db', CASE WHEN v_db > v_db_crit THEN 'critique' WHEN v_db > v_db_warn THEN 'attention' END,
             CASE WHEN v_db > v_db_crit THEN v_db_crit ELSE v_db_warn END,
             CASE WHEN v_db > v_db_crit THEN 'db_crit' ELSE 'db_warn' END),
      ('cron_log', CASE WHEN coalesce(v_cron,0) > (SELECT bytes FROM public.platform_capacity_thresholds WHERE key='cron_log') THEN 'attention' END,
             (SELECT bytes FROM public.platform_capacity_thresholds WHERE key='cron_log'), 'cron_log'),
      ('growth_24h', CASE WHEN v_prev IS NOT NULL AND v_db - v_prev > (SELECT bytes FROM public.platform_capacity_thresholds WHERE key='growth_24h') THEN 'attention' END,
             (SELECT bytes FROM public.platform_capacity_thresholds WHERE key='growth_24h'), 'growth_24h'),
      ('storage', CASE WHEN coalesce(v_sto,0) > (SELECT bytes FROM public.platform_capacity_thresholds WHERE key='storage') THEN 'attention' END,
             (SELECT bytes FROM public.platform_capacity_thresholds WHERE key='storage'), 'storage')
    ) AS x(fam, lvl, thr, tkey)
  LOOP
    CONTINUE WHEN c.lvl IS NULL OR c.thr IS NULL;
    v_key := 'capacity:' || c.fam || ':' || c.lvl || ':' || v_week;
    SELECT status INTO v_status FROM public.crm_notifications WHERE dedupe_key = v_key;
    -- Alerte marquée traitée mais problème toujours présent : nouveau rappel, au plus un par jour.
    IF v_status IN ('done','archived') THEN
      v_key := v_key || ':persiste:' || v_day;
    END IF;
    v_alerts := v_alerts || (c.fam || ':' || c.lvl);
    PERFORM public.crm_notify(
      v_key, 'systeme', 'capacity_alert',
      CASE WHEN c.lvl = 'critique' THEN 'urgente' ELSE 'normale' END,
      'Capacité : ' || (SELECT label FROM public.platform_capacity_thresholds WHERE key = c.tkey)
        || CASE WHEN v_status IN ('done','archived') THEN ' (persiste après traitement)' ELSE '' END,
      format('Taille logique base %s Mo, journal tâches %s Mo, fichiers %s Mo (seuil %s Mo). Occupation réelle du disque et mémoire vive : non mesurables automatiquement, à consulter dans l''espace Cloud.',
             v_db/1000000, coalesce(v_cron,0)/1000000, coalesce(v_sto,0)/1000000, c.thr/1000000),
      NULL, NULL, '/admin', NULL, NULL, NULL,
      jsonb_build_object('db', v_db, 'cron', v_cron, 'storage', v_sto, 'family', c.fam, 'level', c.lvl));
  END LOOP;

  INSERT INTO public.platform_capacity_snapshots(db_size_bytes, cron_log_bytes, storage_bytes, storage_objects, unmeasured, top_tables, alerts)
  VALUES (v_db, v_cron, v_sto, v_obj, v_unmeasured, v_top, v_alerts)
  ON CONFLICT (captured_on) DO UPDATE SET captured_at = now(), db_size_bytes = EXCLUDED.db_size_bytes,
    cron_log_bytes = EXCLUDED.cron_log_bytes, storage_bytes = EXCLUDED.storage_bytes,
    storage_objects = EXCLUDED.storage_objects, unmeasured = EXCLUDED.unmeasured,
    top_tables = EXCLUDED.top_tables, alerts = EXCLUDED.alerts;
  RETURN v_alerts;
END;
$$;
REVOKE ALL ON FUNCTION public.platform_capacity_snapshot() FROM PUBLIC, anon, authenticated;