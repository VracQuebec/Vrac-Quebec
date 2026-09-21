-- 1) Droits manquants (cause racine : aucune écriture possible sur seo_opportunities)
GRANT SELECT, UPDATE ON public.seo_opportunities TO authenticated;
GRANT ALL ON public.seo_opportunities TO service_role;

-- 2) Colonnes du nouveau moteur (additif, aucune donnée supprimée)
ALTER TABLE public.seo_opportunities
  ADD COLUMN IF NOT EXISTS signal_key text,
  ADD COLUMN IF NOT EXISTS priority text NOT NULL DEFAULT 'medium',
  ADD COLUMN IF NOT EXISTS score integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS data jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS reason text,
  ADD COLUMN IF NOT EXISTS recommended_action text,
  ADD COLUMN IF NOT EXISTS source text,
  ADD COLUMN IF NOT EXISTS url text,
  ADD COLUMN IF NOT EXISTS detected_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS last_seen_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS stale_at timestamptz,
  ADD COLUMN IF NOT EXISTS run_id uuid;

CREATE UNIQUE INDEX IF NOT EXISTS seo_opportunities_signal_key_uidx
  ON public.seo_opportunities (signal_key) WHERE signal_key IS NOT NULL;

-- 3) Historique des analyses
CREATE TABLE IF NOT EXISTS public.seo_opportunity_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  duration_ms integer,
  period text NOT NULL DEFAULT '28d',
  status text NOT NULL DEFAULT 'running',
  error text,
  pages_analyzed integer NOT NULL DEFAULT 0,
  published_analyzed integer NOT NULL DEFAULT 0,
  indexed_analyzed integer NOT NULL DEFAULT 0,
  gsc_rows_analyzed integer NOT NULL DEFAULT 0,
  impressions_analyzed integer NOT NULL DEFAULT 0,
  conversions_analyzed integer NOT NULL DEFAULT 0,
  cities_analyzed integer NOT NULL DEFAULT 0,
  services_analyzed integer NOT NULL DEFAULT 0,
  opportunities_detected integer NOT NULL DEFAULT 0,
  new_count integer NOT NULL DEFAULT 0,
  updated_count integer NOT NULL DEFAULT 0,
  stale_count integer NOT NULL DEFAULT 0,
  critical_count integer NOT NULL DEFAULT 0,
  high_count integer NOT NULL DEFAULT 0,
  medium_count integer NOT NULL DEFAULT 0,
  low_count integer NOT NULL DEFAULT 0,
  rules jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.seo_opportunity_runs TO authenticated;
GRANT ALL ON public.seo_opportunity_runs TO service_role;
ALTER TABLE public.seo_opportunity_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can read seo_opportunity_runs" ON public.seo_opportunity_runs;
CREATE POLICY "Admins can read seo_opportunity_runs"
  ON public.seo_opportunity_runs FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

-- 4) État complet du Copilote (opportunités + dernière analyse + diagnostic)
CREATE OR REPLACE FUNCTION public.seo_copilot_state()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _opps jsonb;
  _run jsonb;
  _hist jsonb;
  _counts jsonb;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Réservé aux administrateurs';
  END IF;

  SELECT COALESCE(jsonb_agg(row_to_json(o) ORDER BY o.score DESC, o.effort_score ASC), '[]'::jsonb) INTO _opps
  FROM (
    SELECT id, type, title, rationale, reason, recommended_action, source, url,
           priority, score, data, suggested_action, impact_score, effort_score,
           potential_searches, potential_clicks, potential_leads, entity_slug,
           target_city_slug, target_material_slug, target_service_slug, page_id,
           status, detected_at, last_seen_at
    FROM public.seo_opportunities
    WHERE status IN ('open', 'in_progress')
    ORDER BY score DESC, effort_score ASC
    LIMIT 100
  ) o;

  SELECT to_jsonb(r) INTO _run
  FROM public.seo_opportunity_runs r
  ORDER BY started_at DESC LIMIT 1;

  SELECT COALESCE(jsonb_agg(to_jsonb(h) ORDER BY h.started_at DESC), '[]'::jsonb) INTO _hist
  FROM (
    SELECT id, started_at, finished_at, duration_ms, status, pages_analyzed,
           gsc_rows_analyzed, conversions_analyzed, opportunities_detected,
           new_count, updated_count, stale_count
    FROM public.seo_opportunity_runs ORDER BY started_at DESC LIMIT 10
  ) h;

  SELECT jsonb_build_object(
    'open', COUNT(*) FILTER (WHERE status = 'open'),
    'in_progress', COUNT(*) FILTER (WHERE status = 'in_progress'),
    'completed', COUNT(*) FILTER (WHERE status = 'completed'),
    'dismissed', COUNT(*) FILTER (WHERE status = 'dismissed'),
    'stale', COUNT(*) FILTER (WHERE status = 'stale'),
    'critical', COUNT(*) FILTER (WHERE status IN ('open','in_progress') AND priority = 'critical'),
    'high', COUNT(*) FILTER (WHERE status IN ('open','in_progress') AND priority = 'high'),
    'medium', COUNT(*) FILTER (WHERE status IN ('open','in_progress') AND priority = 'medium'),
    'low', COUNT(*) FILTER (WHERE status IN ('open','in_progress') AND priority = 'low')
  ) INTO _counts
  FROM public.seo_opportunities;

  RETURN jsonb_build_object(
    'computed_at', now(),
    'opportunities', _opps,
    'last_run', COALESCE(_run, 'null'::jsonb),
    'history', _hist,
    'counts', _counts
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.seo_copilot_state() TO authenticated;