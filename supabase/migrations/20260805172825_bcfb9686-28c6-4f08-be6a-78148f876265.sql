-- ============ 1. INDEX MANQUANTS SUR CLÉS ÉTRANGÈRES ============
CREATE INDEX IF NOT EXISTS idx_submission_custom_values_field_id ON public.submission_custom_values(field_id);
CREATE INDEX IF NOT EXISTS idx_blog_post_ideas_created_post_id ON public.blog_post_ideas(created_post_id);
CREATE INDEX IF NOT EXISTS idx_transport_request_errors_request_id ON public.transport_request_errors(request_id);
CREATE INDEX IF NOT EXISTS idx_calendar_events_submission_id ON public.calendar_events(submission_id);
CREATE INDEX IF NOT EXISTS idx_calendar_events_entrepreneur_id ON public.calendar_events(entrepreneur_id);
CREATE INDEX IF NOT EXISTS idx_blog_categories_parent_id ON public.blog_categories(parent_id);
CREATE INDEX IF NOT EXISTS idx_blog_authors_user_id ON public.blog_authors(user_id);
CREATE INDEX IF NOT EXISTS idx_blog_posts_author_id ON public.blog_posts(author_id);
CREATE INDEX IF NOT EXISTS idx_blog_posts_created_by ON public.blog_posts(created_by);
CREATE INDEX IF NOT EXISTS idx_blog_post_tags_tag_id ON public.blog_post_tags(tag_id);
CREATE INDEX IF NOT EXISTS idx_blog_post_related_related_post_id ON public.blog_post_related(related_post_id);
CREATE INDEX IF NOT EXISTS idx_blacklist_entries_blocked_by ON public.blacklist_entries(blocked_by);
CREATE INDEX IF NOT EXISTS idx_blacklist_entries_unblocked_by ON public.blacklist_entries(unblocked_by);
CREATE INDEX IF NOT EXISTS idx_blacklist_history_entry_id ON public.blacklist_history(entry_id);
CREATE INDEX IF NOT EXISTS idx_blacklist_history_actor_id ON public.blacklist_history(actor_id);
CREATE INDEX IF NOT EXISTS idx_seo_page_improvements_created_by ON public.seo_page_improvements(created_by);
CREATE INDEX IF NOT EXISTS idx_strategic_reports_created_by ON public.strategic_reports(created_by);
CREATE INDEX IF NOT EXISTS idx_seo_pipeline_runs_created_by ON public.seo_pipeline_runs(created_by);
CREATE INDEX IF NOT EXISTS idx_jsc_lead_scores_company_id ON public.jsc_lead_scores(company_id);
CREATE INDEX IF NOT EXISTS idx_jsc_recommendations_company_id ON public.jsc_recommendations(company_id);
CREATE INDEX IF NOT EXISTS idx_jsc_automation_runs_company_id ON public.jsc_automation_runs(company_id);
CREATE INDEX IF NOT EXISTS idx_jsc_ai_insights_company_id ON public.jsc_ai_insights(company_id);
CREATE INDEX IF NOT EXISTS idx_jsc_learning_signals_company_id ON public.jsc_learning_signals(company_id);
CREATE INDEX IF NOT EXISTS idx_jsc_public_requests_request_id ON public.jsc_public_requests(request_id);
CREATE INDEX IF NOT EXISTS idx_jsc_public_requests_client_id ON public.jsc_public_requests(client_id);
CREATE INDEX IF NOT EXISTS idx_seo_recommendations_blog_post_id ON public.seo_recommendations(blog_post_id);
CREATE INDEX IF NOT EXISTS idx_seo_pagespeed_snapshots_page_id ON public.seo_pagespeed_snapshots(page_id);
CREATE INDEX IF NOT EXISTS idx_transport_requests_dump_submission_id ON public.transport_requests(dump_submission_id);
CREATE INDEX IF NOT EXISTS idx_transport_requests_assigned_dispatcher ON public.transport_requests(assigned_dispatcher);
CREATE INDEX IF NOT EXISTS idx_transport_requests_driver_id ON public.transport_requests(driver_id);
CREATE INDEX IF NOT EXISTS idx_transport_requests_truck_id ON public.transport_requests(truck_id);
CREATE INDEX IF NOT EXISTS idx_jsc_decisions_company_id ON public.jsc_decisions(company_id);
CREATE INDEX IF NOT EXISTS idx_jsc_monitor_alerts_company_id ON public.jsc_monitor_alerts(company_id);
CREATE INDEX IF NOT EXISTS idx_jsc_documents_company_id ON public.jsc_documents(company_id);
CREATE INDEX IF NOT EXISTS idx_seo_optimization_tasks_page_id ON public.seo_optimization_tasks(page_id);
CREATE INDEX IF NOT EXISTS idx_jsc_autopilot_log_company_id ON public.jsc_autopilot_log(company_id);
CREATE INDEX IF NOT EXISTS idx_jsc_events_company_id ON public.jsc_events(company_id);
CREATE INDEX IF NOT EXISTS idx_jsc_risks_company_id ON public.jsc_risks(company_id);
CREATE INDEX IF NOT EXISTS idx_jsc_notification_templates_company_id ON public.jsc_notification_templates(company_id);
CREATE INDEX IF NOT EXISTS idx_jsc_api_keys_company_id ON public.jsc_api_keys(company_id);

-- ============ 2. INDEX SUR REQUÊTES CHAUDES ============
CREATE INDEX IF NOT EXISTS idx_seo_pages_status_updated_at ON public.seo_pages(status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_submissions_created_at ON public.submissions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_transport_requests_status_created ON public.transport_requests(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_seo_qa_reports_checked_at ON public.seo_qa_reports(checked_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_call_log_created_at ON public.ai_call_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_submission_audit_log_changed_at ON public.submission_audit_log(changed_at DESC);

-- ============ 3. JOURNALISATION ============
CREATE TABLE IF NOT EXISTS public.platform_logs (
  id BIGSERIAL PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  level TEXT NOT NULL DEFAULT 'info',
  source TEXT NOT NULL,
  event TEXT NOT NULL,
  message TEXT,
  duration_ms INTEGER,
  status_code INTEGER,
  ref_id TEXT,
  user_id UUID,
  context JSONB NOT NULL DEFAULT '{}'::jsonb
);
GRANT SELECT ON public.platform_logs TO authenticated;
GRANT ALL ON public.platform_logs TO service_role;
ALTER TABLE public.platform_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins read platform logs" ON public.platform_logs;
CREATE POLICY "Admins read platform logs" ON public.platform_logs
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX IF NOT EXISTS idx_platform_logs_created_at ON public.platform_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_platform_logs_level_source ON public.platform_logs(level, source, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_platform_logs_event ON public.platform_logs(event, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_platform_logs_ref_id ON public.platform_logs(ref_id) WHERE ref_id IS NOT NULL;

-- ============ 4. ALERTES / MONITORING ============
CREATE TABLE IF NOT EXISTS public.platform_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  severity TEXT NOT NULL DEFAULT 'warning',
  source TEXT NOT NULL,
  title TEXT NOT NULL,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  occurrences INTEGER NOT NULL DEFAULT 1,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  acknowledged_at TIMESTAMPTZ,
  acknowledged_by UUID
);
GRANT SELECT, UPDATE ON public.platform_alerts TO authenticated;
GRANT ALL ON public.platform_alerts TO service_role;
ALTER TABLE public.platform_alerts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins read alerts" ON public.platform_alerts;
CREATE POLICY "Admins read alerts" ON public.platform_alerts
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
DROP POLICY IF EXISTS "Admins update alerts" ON public.platform_alerts;
CREATE POLICY "Admins update alerts" ON public.platform_alerts
  FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE INDEX IF NOT EXISTS idx_platform_alerts_open ON public.platform_alerts(created_at DESC) WHERE acknowledged_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_platform_alerts_unique_open ON public.platform_alerts(source, title) WHERE acknowledged_at IS NULL;

CREATE OR REPLACE FUNCTION public.platform_log_event(
  _source TEXT,
  _event TEXT,
  _level TEXT DEFAULT 'info',
  _message TEXT DEFAULT NULL,
  _duration_ms INTEGER DEFAULT NULL,
  _status_code INTEGER DEFAULT NULL,
  _ref_id TEXT DEFAULT NULL,
  _context JSONB DEFAULT '{}'::jsonb
) RETURNS BIGINT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE _id BIGINT; _recent INT;
BEGIN
  INSERT INTO public.platform_logs(level, source, event, message, duration_ms, status_code, ref_id, user_id, context)
  VALUES (_level, _source, _event, _message, _duration_ms, _status_code, _ref_id, auth.uid(), COALESCE(_context, '{}'::jsonb))
  RETURNING id INTO _id;

  IF _level IN ('error','critical') THEN
    SELECT COUNT(*) INTO _recent FROM public.platform_logs
     WHERE source = _source AND level IN ('error','critical')
       AND created_at > now() - interval '15 minutes';

    IF _recent >= 3 THEN
      INSERT INTO public.platform_alerts(severity, source, title, details, occurrences, last_seen_at)
      VALUES (
        CASE WHEN _level = 'critical' THEN 'critical' ELSE 'warning' END,
        _source,
        _source || ' : erreurs répétées',
        jsonb_build_object('last_message', _message, 'window_errors', _recent),
        _recent, now()
      )
      ON CONFLICT (source, title) WHERE acknowledged_at IS NULL
      DO UPDATE SET occurrences = public.platform_alerts.occurrences + 1,
                    last_seen_at = now(),
                    updated_at = now(),
                    details = EXCLUDED.details;
    END IF;
  END IF;

  RETURN _id;
END $$;
REVOKE ALL ON FUNCTION public.platform_log_event(TEXT,TEXT,TEXT,TEXT,INTEGER,INTEGER,TEXT,JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.platform_log_event(TEXT,TEXT,TEXT,TEXT,INTEGER,INTEGER,TEXT,JSONB) TO service_role;

CREATE OR REPLACE FUNCTION public.platform_health()
RETURNS JSONB
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'window', '24h',
    'generated_at', now(),
    'open_alerts', (SELECT COUNT(*) FROM public.platform_alerts WHERE acknowledged_at IS NULL),
    'by_source', COALESCE((
      SELECT jsonb_object_agg(source, stats) FROM (
        SELECT source, jsonb_build_object(
          'total', COUNT(*),
          'errors', COUNT(*) FILTER (WHERE level IN ('error','critical')),
          'avg_ms', ROUND(AVG(duration_ms))
        ) AS stats
        FROM public.platform_logs
        WHERE created_at > now() - interval '24 hours'
        GROUP BY source
      ) s
    ), '{}'::jsonb)
  )
$$;
REVOKE ALL ON FUNCTION public.platform_health() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.platform_health() TO authenticated, service_role;

-- ============ 5. RÉTENTION / NETTOYAGE ============
CREATE OR REPLACE FUNCTION public.platform_cleanup()
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE l INT; q INT; c INT; a INT;
BEGIN
  DELETE FROM public.platform_logs WHERE created_at < now() - interval '90 days';
  GET DIAGNOSTICS l = ROW_COUNT;
  DELETE FROM public.seo_qa_reports WHERE checked_at < now() - interval '60 days';
  GET DIAGNOSTICS q = ROW_COUNT;
  DELETE FROM public.ai_cache WHERE last_used_at < now() - interval '30 days';
  GET DIAGNOSTICS c = ROW_COUNT;
  DELETE FROM public.ai_call_log WHERE created_at < now() - interval '90 days';
  GET DIAGNOSTICS a = ROW_COUNT;
  RETURN jsonb_build_object('platform_logs', l, 'seo_qa_reports', q, 'ai_cache', c, 'ai_call_log', a);
END $$;
REVOKE ALL ON FUNCTION public.platform_cleanup() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.platform_cleanup() TO service_role;

-- ============ 6. CORRECTIFS SÉCURITÉ RLS ============
DROP POLICY IF EXISTS "Authenticated reads open network requests" ON public.jsc_public_requests;
CREATE POLICY "Partners read open network requests" ON public.jsc_public_requests
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'transporteur')
    OR public.is_approved_entrepreneur(auth.uid())
  );

DROP POLICY IF EXISTS "Authenticated read role permissions" ON public.jsc_role_permissions;
CREATE POLICY "Managers read role permissions" ON public.jsc_role_permissions
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.jsc_can_manage(auth.uid()));