-- Surveillance légère des volumes — PRÉPARÉ, NON INSTALLÉ (2026-10-28)
-- Effet : une ligne par jour (~1 Ko) avec la taille de la base et des 10 plus grosses tables.
-- N'écrit aucune donnée métier, ne purge rien, ne change aucune capacité.

CREATE TABLE IF NOT EXISTS public.platform_capacity_snapshots (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  captured_at timestamptz NOT NULL DEFAULT now(),
  db_size_bytes bigint NOT NULL,
  top_tables jsonb NOT NULL
);

ALTER TABLE public.platform_capacity_snapshots ENABLE ROW LEVEL SECURITY;

-- Lecture réservée aux administrateurs via la fonction has_role existante.
CREATE POLICY platform_capacity_snapshots_admin_read
  ON public.platform_capacity_snapshots
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

REVOKE ALL ON public.platform_capacity_snapshots FROM PUBLIC, anon;
GRANT SELECT ON public.platform_capacity_snapshots TO authenticated;

CREATE OR REPLACE FUNCTION public.platform_capacity_snapshot()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.platform_capacity_snapshots (db_size_bytes, top_tables)
  SELECT
    pg_database_size(current_database()),
    COALESCE(jsonb_agg(jsonb_build_object(
      'schema', s.nspname, 'table', s.relname, 'bytes', s.total_bytes
    ) ORDER BY s.total_bytes DESC), '[]'::jsonb)
  FROM (
    SELECT n.nspname, c.relname, pg_total_relation_size(c.oid) AS total_bytes
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relkind = 'r'
      AND n.nspname NOT IN ('pg_catalog', 'information_schema')
    ORDER BY pg_total_relation_size(c.oid) DESC
    LIMIT 10
  ) s;
END;
$$;

REVOKE ALL ON FUNCTION public.platform_capacity_snapshot() FROM PUBLIC, anon, authenticated;

-- Tâche quotidienne à 04:10 UTC (00:10 Toronto, heure d'été) — une écriture par jour.
SELECT cron.schedule(
  'platform-capacity-snapshot-daily',
  '10 4 * * *',
  $$SELECT public.platform_capacity_snapshot();$$
);
