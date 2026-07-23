
-- ============ TABLE: seo_page_scores ============
CREATE TABLE IF NOT EXISTS public.seo_page_scores (
  page_id UUID PRIMARY KEY REFERENCES public.seo_pages(id) ON DELETE CASCADE,
  seo_score INT NOT NULL DEFAULT 0,
  qa_score INT NOT NULL DEFAULT 0,
  business_score INT NOT NULL DEFAULT 0,
  traffic_score INT NOT NULL DEFAULT 0,
  conversion_score INT NOT NULL DEFAULT 0,
  competition_score INT NOT NULL DEFAULT 0,
  opportunity_score INT NOT NULL DEFAULT 0,
  computed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  details JSONB NOT NULL DEFAULT '{}'::jsonb
);

GRANT SELECT ON public.seo_page_scores TO authenticated;
GRANT ALL ON public.seo_page_scores TO service_role;
ALTER TABLE public.seo_page_scores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read seo_page_scores"
  ON public.seo_page_scores FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE INDEX IF NOT EXISTS idx_seo_page_scores_opportunity ON public.seo_page_scores(opportunity_score DESC);
CREATE INDEX IF NOT EXISTS idx_seo_page_scores_business ON public.seo_page_scores(business_score DESC);

-- ============ TABLE: seo_opportunities ============
CREATE TABLE IF NOT EXISTS public.seo_opportunities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL, -- new_city, new_material, new_combo, merge, duplicate, losing_positions, stagnant, high_impr_low_ctr, high_conversion, thin_content
  page_id UUID REFERENCES public.seo_pages(id) ON DELETE CASCADE,
  entity_type TEXT,     -- 'city' | 'material' | 'service' | 'combo' | 'page'
  entity_slug TEXT,
  target_city_slug TEXT,
  target_material_slug TEXT,
  target_service_slug TEXT,
  title TEXT NOT NULL,
  rationale TEXT NOT NULL,
  suggested_action TEXT NOT NULL, -- create | optimize | merge | delete | ignore
  impact_score INT NOT NULL DEFAULT 50,
  effort_score INT NOT NULL DEFAULT 30,
  potential_searches INT,
  potential_clicks INT,
  potential_leads INT,
  evidence JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'open', -- open | applied | dismissed | expired
  applied_at TIMESTAMPTZ,
  dismissed_at TIMESTAMPTZ,
  tenant_id UUID,  -- future multi-tenant
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, UPDATE ON public.seo_opportunities TO authenticated;
GRANT ALL ON public.seo_opportunities TO service_role;
ALTER TABLE public.seo_opportunities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read seo_opportunities"
  ON public.seo_opportunities FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update seo_opportunities"
  ON public.seo_opportunities FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE INDEX IF NOT EXISTS idx_seo_opportunities_status_impact
  ON public.seo_opportunities(status, impact_score DESC);
CREATE INDEX IF NOT EXISTS idx_seo_opportunities_type
  ON public.seo_opportunities(type);
CREATE INDEX IF NOT EXISTS idx_seo_opportunities_page
  ON public.seo_opportunities(page_id);

CREATE TRIGGER touch_seo_opportunities BEFORE UPDATE ON public.seo_opportunities
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ============ VIEW: seo_page_conversions_30d ============
CREATE OR REPLACE VIEW public.seo_page_conversions_30d
WITH (security_invoker = true) AS
SELECT
  page_slug,
  COUNT(*) FILTER (WHERE event_type = 'view') AS views,
  COUNT(*) FILTER (WHERE event_type = 'phone_click') AS phone_clicks,
  COUNT(*) FILTER (WHERE event_type = 'whatsapp_click') AS whatsapp_clicks,
  COUNT(*) FILTER (WHERE event_type = 'email_click') AS email_clicks,
  COUNT(*) FILTER (WHERE event_type = 'submission') AS submissions,
  COUNT(*) FILTER (WHERE event_type = 'cta_click') AS cta_clicks,
  COUNT(*) FILTER (WHERE event_type IN ('phone_click','whatsapp_click','email_click','submission')) AS conversions,
  CASE WHEN COUNT(*) FILTER (WHERE event_type = 'view') > 0
       THEN ROUND(100.0 * COUNT(*) FILTER (WHERE event_type IN ('phone_click','whatsapp_click','email_click','submission'))
                        / COUNT(*) FILTER (WHERE event_type = 'view'), 2)
       ELSE 0 END AS conversion_rate_pct
FROM public.seo_page_events
WHERE occurred_at >= now() - interval '30 days'
GROUP BY page_slug;

GRANT SELECT ON public.seo_page_conversions_30d TO authenticated, service_role;

-- ============ VIEW: seo_gsc_deltas_28d ============
CREATE OR REPLACE VIEW public.seo_gsc_deltas_28d
WITH (security_invoker = true) AS
WITH cur AS (
  SELECT page_id, clicks, impressions, position, ctr
  FROM public.seo_gsc_metrics
  WHERE period = '28d'
),
prev AS (
  SELECT page_id, clicks, impressions, position, ctr
  FROM public.seo_gsc_metrics
  WHERE period = '28d_prev'
)
SELECT
  c.page_id,
  c.clicks AS clicks,
  c.impressions AS impressions,
  c.position AS position,
  c.ctr AS ctr,
  COALESCE(p.clicks, 0) AS prev_clicks,
  COALESCE(p.impressions, 0) AS prev_impressions,
  COALESCE(p.position, 100) AS prev_position,
  (c.clicks - COALESCE(p.clicks, 0)) AS clicks_delta,
  (c.impressions - COALESCE(p.impressions, 0)) AS impressions_delta,
  (COALESCE(p.position, 100) - c.position) AS position_gain
FROM cur c
LEFT JOIN prev p ON p.page_id = c.page_id;

GRANT SELECT ON public.seo_gsc_deltas_28d TO authenticated, service_role;

-- ============ FUNCTION: seo_recompute_page_scores ============
CREATE OR REPLACE FUNCTION public.seo_recompute_page_scores(_page_id UUID DEFAULT NULL)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _n INT := 0;
BEGIN
  WITH src AS (
    SELECT
      p.id,
      p.slug,
      p.city_slug,
      p.qa_last_score,
      p.seo_score,
      p.word_count,
      p.internal_link_count,
      COALESCE(g.clicks, 0) AS gsc_clicks,
      COALESCE(g.impressions, 0) AS gsc_impr,
      COALESCE(g.position, 100) AS gsc_pos,
      COALESCE(g.ctr, 0) AS gsc_ctr,
      COALESCE(c.views, 0) AS views,
      COALESCE(c.conversions, 0) AS convs,
      COALESCE(c.conversion_rate_pct, 0) AS conv_rate,
      COALESCE(pop.population, 0) AS pop
    FROM public.seo_pages p
    LEFT JOIN public.seo_gsc_metrics g ON g.page_id = p.id AND g.period = '28d'
    LEFT JOIN public.seo_page_conversions_30d c ON c.page_slug = p.slug
    LEFT JOIN public.seo_cities pop ON pop.slug = p.city_slug
    WHERE (_page_id IS NULL OR p.id = _page_id)
  ),
  scored AS (
    SELECT
      id,
      LEAST(100, GREATEST(0, COALESCE(seo_score, 0)))::int AS seo_s,
      LEAST(100, GREATEST(0, COALESCE(qa_last_score, 0)))::int AS qa_s,
      LEAST(100, (LEAST(60, gsc_impr::numeric / 20)
                  + LEAST(20, gsc_clicks::numeric)
                  + CASE WHEN gsc_pos <= 10 THEN 20 WHEN gsc_pos <= 20 THEN 10 ELSE 0 END))::int AS traffic_s,
      LEAST(100, (LEAST(60, convs * 15) + LEAST(40, conv_rate * 4)))::int AS conv_s,
      LEAST(100, (CASE WHEN gsc_pos <= 3 THEN 90 WHEN gsc_pos <= 10 THEN 60 WHEN gsc_pos <= 20 THEN 35 ELSE 10 END))::int AS comp_s,
      LEAST(100, GREATEST(0,
        LEAST(50, pop::numeric / 2000)
        + CASE WHEN gsc_pos BETWEEN 8 AND 20 AND gsc_impr > 20 THEN 30 ELSE 0 END
        + CASE WHEN qa_last_score IS NULL OR qa_last_score < 80 THEN 20 ELSE 0 END
      ))::int AS opp_s,
      LEAST(100, (LEAST(60, convs * 20)
                  + LEAST(30, gsc_clicks::numeric / 3)
                  + LEAST(10, conv_rate)))::int AS biz_s,
      jsonb_build_object(
        'gsc_clicks', gsc_clicks, 'gsc_impressions', gsc_impr,
        'gsc_position', gsc_pos, 'conversions', convs, 'views', views
      ) AS d
    FROM src
  )
  INSERT INTO public.seo_page_scores AS s
    (page_id, seo_score, qa_score, business_score, traffic_score, conversion_score, competition_score, opportunity_score, computed_at, details)
  SELECT id, seo_s, qa_s, biz_s, traffic_s, conv_s, comp_s, opp_s, now(), d
  FROM scored
  ON CONFLICT (page_id) DO UPDATE
    SET seo_score = EXCLUDED.seo_score,
        qa_score = EXCLUDED.qa_score,
        business_score = EXCLUDED.business_score,
        traffic_score = EXCLUDED.traffic_score,
        conversion_score = EXCLUDED.conversion_score,
        competition_score = EXCLUDED.competition_score,
        opportunity_score = EXCLUDED.opportunity_score,
        computed_at = now(),
        details = EXCLUDED.details;

  GET DIAGNOSTICS _n = ROW_COUNT;
  RETURN _n;
END $$;

REVOKE ALL ON FUNCTION public.seo_recompute_page_scores(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.seo_recompute_page_scores(UUID) TO authenticated, service_role;

-- ============ FUNCTION: seo_executive_dashboard ============
CREATE OR REPLACE FUNCTION public.seo_executive_dashboard()
RETURNS JSONB
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _kpi JSONB;
  _gains JSONB;
  _losses JSONB;
  _opps JSONB;
  _convs JSONB;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Réservé aux administrateurs';
  END IF;

  SELECT jsonb_build_object(
    'pages_total', COUNT(*),
    'pages_published', COUNT(*) FILTER (WHERE status = 'published'),
    'pages_indexed', COUNT(*) FILTER (WHERE google_index_status = 'indexed'),
    'pages_pending', COUNT(*) FILTER (WHERE status = 'draft'),
    'qa_avg', COALESCE(ROUND(AVG(qa_last_score)::numeric, 1), 0),
    'seo_avg', COALESCE(ROUND(AVG(seo_score)::numeric, 1), 0)
  ) INTO _kpi
  FROM public.seo_pages;

  SELECT jsonb_build_object(
    'gsc_clicks_28d', COALESCE(SUM(clicks), 0),
    'gsc_impressions_28d', COALESCE(SUM(impressions), 0),
    'gsc_position_avg', COALESCE(ROUND(AVG(position)::numeric, 2), 0)
  ) INTO _convs
  FROM public.seo_gsc_metrics WHERE period = '28d';

  _kpi := _kpi || _convs;

  SELECT jsonb_build_object(
    'submissions_30d', COALESCE(SUM(submissions), 0),
    'phone_30d', COALESCE(SUM(phone_clicks), 0),
    'whatsapp_30d', COALESCE(SUM(whatsapp_clicks), 0),
    'email_30d', COALESCE(SUM(email_clicks), 0),
    'conversions_30d', COALESCE(SUM(conversions), 0)
  ) INTO _convs
  FROM public.seo_page_conversions_30d;

  _kpi := _kpi || _convs;

  SELECT COALESCE(jsonb_agg(row_to_json(t) ORDER BY t.clicks_delta DESC), '[]'::jsonb) INTO _gains
  FROM (
    SELECT p.slug, p.title, d.clicks, d.impressions, d.position, d.clicks_delta, d.position_gain
    FROM public.seo_gsc_deltas_28d d
    JOIN public.seo_pages p ON p.id = d.page_id
    WHERE d.clicks_delta > 0
    ORDER BY d.clicks_delta DESC LIMIT 10
  ) t;

  SELECT COALESCE(jsonb_agg(row_to_json(t) ORDER BY t.clicks_delta ASC), '[]'::jsonb) INTO _losses
  FROM (
    SELECT p.slug, p.title, d.clicks, d.impressions, d.position, d.clicks_delta, d.position_gain
    FROM public.seo_gsc_deltas_28d d
    JOIN public.seo_pages p ON p.id = d.page_id
    WHERE d.clicks_delta < 0
    ORDER BY d.clicks_delta ASC LIMIT 10
  ) t;

  SELECT COALESCE(jsonb_agg(row_to_json(o) ORDER BY o.impact_score DESC), '[]'::jsonb) INTO _opps
  FROM (
    SELECT id, type, title, rationale, suggested_action, impact_score, effort_score,
           potential_searches, potential_clicks, potential_leads, entity_slug,
           target_city_slug, target_material_slug, target_service_slug, page_id
    FROM public.seo_opportunities
    WHERE status = 'open'
    ORDER BY impact_score DESC, effort_score ASC
    LIMIT 20
  ) o;

  RETURN jsonb_build_object(
    'computed_at', now(),
    'kpi', _kpi,
    'top_gains_30d', _gains,
    'top_losses_30d', _losses,
    'top_opportunities', _opps
  );
END $$;

REVOKE ALL ON FUNCTION public.seo_executive_dashboard() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.seo_executive_dashboard() TO authenticated;
