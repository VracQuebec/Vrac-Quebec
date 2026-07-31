-- =======================================================
-- Sprint Production 4 — Plateforme autonome (Autopilot)
-- =======================================================

-- 1. File de décisions
CREATE TABLE public.jsc_decisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES public.jsc_companies(id) ON DELETE CASCADE,
  kind TEXT NOT NULL DEFAULT 'recommendation',
  domain TEXT NOT NULL DEFAULT 'general',
  severity TEXT NOT NULL DEFAULT 'info',
  title TEXT NOT NULL,
  rationale TEXT,
  evidence JSONB NOT NULL DEFAULT '{}'::jsonb,
  proposed_action JSONB NOT NULL DEFAULT '{}'::jsonb,
  entity_type TEXT,
  entity_id UUID,
  impact_amount NUMERIC NOT NULL DEFAULT 0,
  confidence NUMERIC NOT NULL DEFAULT 0.5,
  status TEXT NOT NULL DEFAULT 'pending',
  auto_executable BOOLEAN NOT NULL DEFAULT false,
  decided_by UUID,
  decided_at TIMESTAMPTZ,
  executed_at TIMESTAMPTZ,
  execution_result JSONB,
  model TEXT,
  archived_at TIMESTAMPTZ,
  archived_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.jsc_decisions TO authenticated;
GRANT ALL ON public.jsc_decisions TO service_role;
ALTER TABLE public.jsc_decisions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "jsc_decisions_manage" ON public.jsc_decisions FOR ALL TO authenticated
  USING (public.jsc_can_manage(auth.uid())) WITH CHECK (public.jsc_can_manage(auth.uid()));

-- 2. Surveillance temps réel
CREATE TABLE public.jsc_monitor_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES public.jsc_companies(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'warning',
  title TEXT NOT NULL,
  detail TEXT,
  entity_type TEXT,
  entity_id UUID,
  metrics JSONB NOT NULL DEFAULT '{}'::jsonb,
  impact_amount NUMERIC NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'open',
  acknowledged_by UUID,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX jsc_monitor_alerts_open_key
  ON public.jsc_monitor_alerts (code, COALESCE(entity_id, '00000000-0000-0000-0000-000000000000'::uuid))
  WHERE status = 'open';
GRANT SELECT, INSERT, UPDATE, DELETE ON public.jsc_monitor_alerts TO authenticated;
GRANT ALL ON public.jsc_monitor_alerts TO service_role;
ALTER TABLE public.jsc_monitor_alerts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "jsc_monitor_alerts_manage" ON public.jsc_monitor_alerts FOR ALL TO authenticated
  USING (public.jsc_can_manage(auth.uid())) WITH CHECK (public.jsc_can_manage(auth.uid()));

-- 3. Gestion documentaire
CREATE TABLE public.jsc_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES public.jsc_companies(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL,
  entity_id UUID NOT NULL,
  doc_type TEXT NOT NULL DEFAULT 'autre',
  title TEXT NOT NULL,
  storage_path TEXT,
  external_url TEXT,
  mime_type TEXT,
  size_bytes BIGINT,
  notes TEXT,
  uploaded_by UUID,
  archived_at TIMESTAMPTZ,
  archived_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX jsc_documents_entity_idx ON public.jsc_documents (entity_type, entity_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.jsc_documents TO authenticated;
GRANT ALL ON public.jsc_documents TO service_role;
ALTER TABLE public.jsc_documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "jsc_documents_manage" ON public.jsc_documents FOR ALL TO authenticated
  USING (public.jsc_can_manage(auth.uid())) WITH CHECK (public.jsc_can_manage(auth.uid()));

-- 4. Réglages du pilote automatique
CREATE TABLE public.jsc_autopilot_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID UNIQUE REFERENCES public.jsc_companies(id) ON DELETE CASCADE,
  enabled BOOLEAN NOT NULL DEFAULT false,
  auto_send_quotes BOOLEAN NOT NULL DEFAULT false,
  auto_schedule_deliveries BOOLEAN NOT NULL DEFAULT false,
  auto_followups BOOLEAN NOT NULL DEFAULT true,
  auto_invoices BOOLEAN NOT NULL DEFAULT false,
  auto_assign_drivers BOOLEAN NOT NULL DEFAULT false,
  auto_dispatch_orders BOOLEAN NOT NULL DEFAULT false,
  auto_execute_decisions BOOLEAN NOT NULL DEFAULT false,
  max_auto_amount NUMERIC NOT NULL DEFAULT 5000,
  min_confidence NUMERIC NOT NULL DEFAULT 0.75,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.jsc_autopilot_settings TO authenticated;
GRANT ALL ON public.jsc_autopilot_settings TO service_role;
ALTER TABLE public.jsc_autopilot_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "jsc_autopilot_settings_manage" ON public.jsc_autopilot_settings FOR ALL TO authenticated
  USING (public.jsc_can_manage(auth.uid())) WITH CHECK (public.jsc_can_manage(auth.uid()));

-- 5. Journal du pilote automatique
CREATE TABLE public.jsc_autopilot_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES public.jsc_companies(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  entity_type TEXT,
  entity_id UUID,
  decision_id UUID REFERENCES public.jsc_decisions(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'ok',
  detail TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  executed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX jsc_autopilot_log_time_idx ON public.jsc_autopilot_log (executed_at DESC);
GRANT SELECT, INSERT ON public.jsc_autopilot_log TO authenticated;
GRANT ALL ON public.jsc_autopilot_log TO service_role;
ALTER TABLE public.jsc_autopilot_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "jsc_autopilot_log_read" ON public.jsc_autopilot_log FOR SELECT TO authenticated
  USING (public.jsc_can_manage(auth.uid()));
CREATE POLICY "jsc_autopilot_log_write" ON public.jsc_autopilot_log FOR INSERT TO authenticated
  WITH CHECK (public.jsc_can_manage(auth.uid()));

CREATE TRIGGER touch_jsc_decisions BEFORE UPDATE ON public.jsc_decisions
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER touch_jsc_monitor_alerts BEFORE UPDATE ON public.jsc_monitor_alerts
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER touch_jsc_documents BEFORE UPDATE ON public.jsc_documents
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER touch_jsc_autopilot_settings BEFORE UPDATE ON public.jsc_autopilot_settings
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 6. Tableau de bord 360°
CREATE OR REPLACE FUNCTION public.jsc_dashboard_360(p_company_id UUID DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v JSONB;
BEGIN
  IF NOT (public.jsc_can_manage(auth.uid()) OR auth.role() = 'service_role') THEN
    RAISE EXCEPTION 'Accès refusé';
  END IF;

  SELECT jsonb_build_object(
    'generated_at', now(),
    'decisions', (
      SELECT jsonb_build_object(
        'pending', count(*) FILTER (WHERE status = 'pending'),
        'accepted', count(*) FILTER (WHERE status = 'accepted'),
        'rejected', count(*) FILTER (WHERE status = 'rejected'),
        'executed', count(*) FILTER (WHERE status = 'executed'),
        'pending_impact', COALESCE(sum(impact_amount) FILTER (WHERE status = 'pending'), 0)
      ) FROM public.jsc_decisions
      WHERE archived_at IS NULL AND (p_company_id IS NULL OR company_id = p_company_id)
    ),
    'alerts', (
      SELECT jsonb_build_object(
        'open', count(*) FILTER (WHERE status = 'open'),
        'critical', count(*) FILTER (WHERE status = 'open' AND severity = 'critical'),
        'impact', COALESCE(sum(impact_amount) FILTER (WHERE status = 'open'), 0)
      ) FROM public.jsc_monitor_alerts
      WHERE (p_company_id IS NULL OR company_id = p_company_id)
    ),
    'autopilot', (
      SELECT jsonb_build_object(
        'actions_24h', count(*) FILTER (WHERE executed_at > now() - interval '24 hours'),
        'errors_24h', count(*) FILTER (WHERE executed_at > now() - interval '24 hours' AND status <> 'ok'),
        'actions_7d', count(*) FILTER (WHERE executed_at > now() - interval '7 days')
      ) FROM public.jsc_autopilot_log
      WHERE (p_company_id IS NULL OR company_id = p_company_id)
    ),
    'settings', (
      SELECT to_jsonb(s) FROM public.jsc_autopilot_settings s
      WHERE (p_company_id IS NULL OR s.company_id = p_company_id) LIMIT 1
    ),
    'documents', (
      SELECT jsonb_build_object(
        'total', count(*),
        'last_30d', count(*) FILTER (WHERE created_at > now() - interval '30 days')
      ) FROM public.jsc_documents
      WHERE archived_at IS NULL AND (p_company_id IS NULL OR company_id = p_company_id)
    )
  ) INTO v;

  RETURN v;
END;
$$;
REVOKE ALL ON FUNCTION public.jsc_dashboard_360(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.jsc_dashboard_360(UUID) TO authenticated, service_role;