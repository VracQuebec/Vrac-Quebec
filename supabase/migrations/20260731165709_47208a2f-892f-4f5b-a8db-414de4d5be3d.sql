
-- 1. SCORING COMMERCIAL
CREATE TABLE public.jsc_lead_scores (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID REFERENCES public.jsc_companies(id) ON DELETE CASCADE,
  request_id UUID NOT NULL REFERENCES public.jsc_requests(id) ON DELETE CASCADE,
  stars INTEGER NOT NULL DEFAULT 3,
  score INTEGER NOT NULL DEFAULT 50,
  priority TEXT NOT NULL DEFAULT 'normale',
  client_type TEXT,
  project_type TEXT,
  potential_revenue NUMERIC DEFAULT 0,
  win_probability NUMERIC DEFAULT 0,
  recommended_rep_user_id UUID,
  recommended_rep_name TEXT,
  reasoning TEXT,
  signals JSONB NOT NULL DEFAULT '{}'::jsonb,
  model TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (request_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.jsc_lead_scores TO authenticated;
GRANT ALL ON public.jsc_lead_scores TO service_role;
ALTER TABLE public.jsc_lead_scores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage lead scores" ON public.jsc_lead_scores FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 2. RECOMMANDATIONS IA
CREATE TABLE public.jsc_recommendations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID REFERENCES public.jsc_companies(id) ON DELETE CASCADE,
  request_id UUID REFERENCES public.jsc_requests(id) ON DELETE CASCADE,
  scope TEXT NOT NULL DEFAULT 'request',
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  summary TEXT,
  model TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_jsc_reco_request ON public.jsc_recommendations(request_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.jsc_recommendations TO authenticated;
GRANT ALL ON public.jsc_recommendations TO service_role;
ALTER TABLE public.jsc_recommendations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage recommendations" ON public.jsc_recommendations FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 3. AUTOMATISATION
CREATE TABLE public.jsc_automation_rules (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID REFERENCES public.jsc_companies(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  label TEXT NOT NULL,
  description TEXT,
  trigger_event TEXT NOT NULL,
  delay_minutes INTEGER NOT NULL DEFAULT 0,
  action JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  archived_at TIMESTAMPTZ,
  archived_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id, code)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.jsc_automation_rules TO authenticated;
GRANT ALL ON public.jsc_automation_rules TO service_role;
ALTER TABLE public.jsc_automation_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage automation rules" ON public.jsc_automation_rules FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.jsc_automation_runs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID REFERENCES public.jsc_companies(id) ON DELETE CASCADE,
  rule_code TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id UUID,
  status TEXT NOT NULL DEFAULT 'done',
  detail TEXT,
  result JSONB NOT NULL DEFAULT '{}'::jsonb,
  executed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX idx_jsc_autorun_unique ON public.jsc_automation_runs(rule_code, entity_type, entity_id);
CREATE INDEX idx_jsc_autorun_time ON public.jsc_automation_runs(executed_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.jsc_automation_runs TO authenticated;
GRANT ALL ON public.jsc_automation_runs TO service_role;
ALTER TABLE public.jsc_automation_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read automation runs" ON public.jsc_automation_runs FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 4. CONSEILLER IA
CREATE TABLE public.jsc_ai_insights (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID REFERENCES public.jsc_companies(id) ON DELETE CASCADE,
  kind TEXT NOT NULL DEFAULT 'recommendation',
  severity TEXT NOT NULL DEFAULT 'info',
  title TEXT NOT NULL,
  body TEXT,
  impact_amount NUMERIC,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'new',
  period_start DATE,
  period_end DATE,
  model TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_jsc_insights_time ON public.jsc_ai_insights(created_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.jsc_ai_insights TO authenticated;
GRANT ALL ON public.jsc_ai_insights TO service_role;
ALTER TABLE public.jsc_ai_insights ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage ai insights" ON public.jsc_ai_insights FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 5. PREVISIONS
CREATE TABLE public.jsc_forecasts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID REFERENCES public.jsc_companies(id) ON DELETE CASCADE,
  metric TEXT NOT NULL,
  period_month DATE NOT NULL,
  predicted NUMERIC NOT NULL DEFAULT 0,
  low NUMERIC,
  high NUMERIC,
  confidence NUMERIC,
  method TEXT NOT NULL DEFAULT 'trend',
  detail JSONB NOT NULL DEFAULT '{}'::jsonb,
  computed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id, metric, period_month)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.jsc_forecasts TO authenticated;
GRANT ALL ON public.jsc_forecasts TO service_role;
ALTER TABLE public.jsc_forecasts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage forecasts" ON public.jsc_forecasts FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 6. APPRENTISSAGE
CREATE TABLE public.jsc_learning_signals (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID REFERENCES public.jsc_companies(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL DEFAULT 'quote',
  entity_id UUID,
  outcome TEXT NOT NULL,
  amount NUMERIC DEFAULT 0,
  margin NUMERIC DEFAULT 0,
  factors JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX idx_jsc_learning_unique ON public.jsc_learning_signals(entity_type, entity_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.jsc_learning_signals TO authenticated;
GRANT ALL ON public.jsc_learning_signals TO service_role;
ALTER TABLE public.jsc_learning_signals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage learning signals" ON public.jsc_learning_signals FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Triggers updated_at
CREATE TRIGGER trg_lead_scores_updated BEFORE UPDATE ON public.jsc_lead_scores
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_reco_updated BEFORE UPDATE ON public.jsc_recommendations
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_auto_rules_updated BEFORE UPDATE ON public.jsc_automation_rules
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_insights_updated BEFORE UPDATE ON public.jsc_ai_insights
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Apprentissage automatique : chaque soumission gagnée/perdue devient un signal
CREATE OR REPLACE FUNCTION public.jsc_capture_learning_signal()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_outcome TEXT;
BEGIN
  IF NEW.status = 'accepted' THEN v_outcome := 'won';
  ELSIF NEW.status IN ('refused', 'expired') THEN v_outcome := 'lost';
  ELSE RETURN NEW;
  END IF;

  INSERT INTO public.jsc_learning_signals (company_id, entity_type, entity_id, outcome, amount, factors)
  VALUES (
    NEW.company_id, 'quote', NEW.id, v_outcome, COALESCE(NEW.total, 0),
    jsonb_build_object('request_id', NEW.request_id, 'client_id', NEW.client_id,
                       'refusal_reason', NEW.refusal_reason, 'status', NEW.status)
  )
  ON CONFLICT (entity_type, entity_id) DO UPDATE
    SET outcome = EXCLUDED.outcome, amount = EXCLUDED.amount, factors = EXCLUDED.factors;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_jsc_quote_learning ON public.jsc_quotes;
CREATE TRIGGER trg_jsc_quote_learning AFTER INSERT OR UPDATE OF status ON public.jsc_quotes
  FOR EACH ROW EXECUTE FUNCTION public.jsc_capture_learning_signal();

-- 7. TABLEAU DE BORD DIRECTION
CREATE OR REPLACE FUNCTION public.jsc_executive_dashboard(_company_id UUID DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v JSONB;
  d_start DATE := date_trunc('month', now())::date;
  y_start DATE := date_trunc('year', now())::date;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Accès admin requis';
  END IF;

  SELECT jsonb_build_object(
    'generated_at', now(),
    'revenue', jsonb_build_object(
      'today', COALESCE((SELECT SUM(total) FROM jsc_invoices i
        WHERE (_company_id IS NULL OR i.company_id = _company_id) AND i.archived_at IS NULL
          AND i.created_at::date = now()::date), 0),
      'month', COALESCE((SELECT SUM(total) FROM jsc_invoices i
        WHERE (_company_id IS NULL OR i.company_id = _company_id) AND i.archived_at IS NULL
          AND i.created_at::date >= d_start), 0),
      'year', COALESCE((SELECT SUM(total) FROM jsc_invoices i
        WHERE (_company_id IS NULL OR i.company_id = _company_id) AND i.archived_at IS NULL
          AND i.created_at::date >= y_start), 0),
      'outstanding', COALESCE((SELECT SUM(balance) FROM jsc_invoices i
        WHERE (_company_id IS NULL OR i.company_id = _company_id) AND i.archived_at IS NULL
          AND COALESCE(i.balance,0) > 0), 0)
    ),
    'profit', (
      SELECT jsonb_build_object(
        'revenue', COALESCE(SUM(e.total), 0),
        'cost', COALESCE(SUM(COALESCE(e.material_cost,0) + COALESCE(e.transport_cost,0)), 0),
        'profit', COALESCE(SUM(e.total - COALESCE(e.material_cost,0) - COALESCE(e.transport_cost,0) - COALESCE(e.tax_total,0)), 0),
        'margin_pct', CASE WHEN COALESCE(SUM(e.subtotal),0) > 0
          THEN ROUND(100 * SUM(e.subtotal - COALESCE(e.material_cost,0) - COALESCE(e.transport_cost,0)) / SUM(e.subtotal), 1)
          ELSE 0 END)
      FROM jsc_estimates e
      WHERE (_company_id IS NULL OR e.company_id = _company_id) AND e.is_selected IS TRUE
        AND e.created_at::date >= y_start
    ),
    'conversion', (
      SELECT jsonb_build_object(
        'requests', COUNT(*) FILTER (WHERE true),
        'quotes', (SELECT COUNT(*) FROM jsc_quotes q WHERE (_company_id IS NULL OR q.company_id = _company_id) AND q.archived_at IS NULL),
        'orders', (SELECT COUNT(*) FROM jsc_orders o WHERE (_company_id IS NULL OR o.company_id = _company_id) AND o.archived_at IS NULL),
        'rate_pct', CASE WHEN COUNT(*) > 0 THEN ROUND(100.0 * (SELECT COUNT(*) FROM jsc_orders o
            WHERE (_company_id IS NULL OR o.company_id = _company_id) AND o.archived_at IS NULL) / COUNT(*), 1) ELSE 0 END)
      FROM jsc_requests r
      WHERE (_company_id IS NULL OR r.company_id = _company_id) AND r.archived_at IS NULL
    ),
    'top_clients', COALESCE((
      SELECT jsonb_agg(t) FROM (
        SELECT c.name, COUNT(o.id) AS orders, COALESCE(SUM(o.total),0) AS revenue
        FROM jsc_orders o JOIN jsc_clients c ON c.id = o.client_id
        WHERE (_company_id IS NULL OR o.company_id = _company_id) AND o.archived_at IS NULL
        GROUP BY c.name ORDER BY revenue DESC LIMIT 8) t), '[]'::jsonb),
    'top_carriers', COALESCE((
      SELECT jsonb_agg(t) FROM (
        SELECT co.name, COUNT(o.id) AS orders, COALESCE(SUM(o.total),0) AS revenue
        FROM jsc_orders o JOIN jsc_companies co ON co.id = o.carrier_id
        WHERE (_company_id IS NULL OR o.company_id = _company_id) AND o.archived_at IS NULL
        GROUP BY co.name ORDER BY revenue DESC LIMIT 8) t), '[]'::jsonb),
    'top_suppliers', COALESCE((
      SELECT jsonb_agg(t) FROM (
        SELECT s.name, COUNT(o.id) AS orders, COALESCE(SUM(o.total),0) AS revenue
        FROM jsc_orders o JOIN jsc_suppliers s ON s.id = o.supplier_id
        WHERE (_company_id IS NULL OR o.company_id = _company_id) AND o.archived_at IS NULL
        GROUP BY s.name ORDER BY revenue DESC LIMIT 8) t), '[]'::jsonb),
    'top_reps', COALESCE((
      SELECT jsonb_agg(t) FROM (
        SELECT COALESCE(m.full_name, m.email, 'Non assigné') AS name,
               COUNT(o.id) AS orders, COALESCE(SUM(o.total),0) AS revenue
        FROM jsc_orders o LEFT JOIN jsc_company_members m ON m.user_id = o.created_by
        WHERE (_company_id IS NULL OR o.company_id = _company_id) AND o.archived_at IS NULL
        GROUP BY 1 ORDER BY revenue DESC LIMIT 8) t), '[]'::jsonb),
    'deliveries_today', COALESCE((
      SELECT jsonb_agg(t) FROM (
        SELECT d.id, d.delivery_number, d.city, d.status, d.scheduled_time, d.quantity, d.quantity_unit
        FROM jsc_deliveries d
        WHERE (_company_id IS NULL OR d.company_id = _company_id) AND d.archived_at IS NULL
          AND d.scheduled_date = now()::date
        ORDER BY d.scheduled_time NULLS LAST LIMIT 50) t), '[]'::jsonb),
    'late_orders', COALESCE((
      SELECT jsonb_agg(t) FROM (
        SELECT o.id, o.order_number, o.status, o.scheduled_date, o.total
        FROM jsc_orders o
        WHERE (_company_id IS NULL OR o.company_id = _company_id) AND o.archived_at IS NULL
          AND o.status NOT IN ('completed','cancelled','invoiced','paid')
          AND o.scheduled_date < now()::date
        ORDER BY o.scheduled_date LIMIT 50) t), '[]'::jsonb),
    'capacity', (
      SELECT jsonb_build_object(
        'trucks_total', (SELECT COUNT(*) FROM jsc_trucks t WHERE (_company_id IS NULL OR t.company_id = _company_id) AND t.archived_at IS NULL AND t.is_active),
        'drivers_total', (SELECT COUNT(*) FROM jsc_drivers dr WHERE (_company_id IS NULL OR dr.company_id = _company_id) AND dr.archived_at IS NULL AND dr.is_active),
        'trucks_busy', (SELECT COUNT(DISTINCT d.truck_id) FROM jsc_deliveries d
           WHERE (_company_id IS NULL OR d.company_id = _company_id) AND d.scheduled_date = now()::date AND d.truck_id IS NOT NULL),
        'drivers_busy', (SELECT COUNT(DISTINCT d.driver_id) FROM jsc_deliveries d
           WHERE (_company_id IS NULL OR d.company_id = _company_id) AND d.scheduled_date = now()::date AND d.driver_id IS NOT NULL))
    ),
    'delays', (
      SELECT jsonb_build_object(
        'avg_request_to_quote_hours', COALESCE(ROUND(AVG(EXTRACT(EPOCH FROM (q.created_at - r.created_at))/3600)::numeric, 1), 0),
        'avg_quote_to_order_hours', COALESCE(ROUND(AVG(EXTRACT(EPOCH FROM (q.accepted_at - q.created_at))/3600)::numeric, 1), 0))
      FROM jsc_quotes q LEFT JOIN jsc_requests r ON r.id = q.request_id
      WHERE (_company_id IS NULL OR q.company_id = _company_id)
    ),
    'pipeline', COALESCE((
      SELECT jsonb_agg(t) FROM (
        SELECT r.status, COUNT(*) AS count FROM jsc_requests r
        WHERE (_company_id IS NULL OR r.company_id = _company_id) AND r.archived_at IS NULL
        GROUP BY r.status) t), '[]'::jsonb),
    'hot_leads', COALESCE((
      SELECT jsonb_agg(t) FROM (
        SELECT r.id, r.request_number, r.city, s.stars, s.priority, s.potential_revenue,
               s.win_probability, s.client_type, s.project_type, s.recommended_rep_name
        FROM jsc_lead_scores s JOIN jsc_requests r ON r.id = s.request_id
        WHERE (_company_id IS NULL OR s.company_id = _company_id)
        ORDER BY s.score DESC, s.potential_revenue DESC LIMIT 10) t), '[]'::jsonb),
    'forecast', COALESCE((
      SELECT jsonb_agg(t) FROM (
        SELECT f.metric, f.period_month, f.predicted, f.low, f.high, f.confidence
        FROM jsc_forecasts f
        WHERE (_company_id IS NULL OR f.company_id = _company_id) AND f.period_month >= d_start
        ORDER BY f.period_month LIMIT 60) t), '[]'::jsonb),
    'insights', COALESCE((
      SELECT jsonb_agg(t) FROM (
        SELECT i.id, i.kind, i.severity, i.title, i.body, i.impact_amount, i.created_at
        FROM jsc_ai_insights i
        WHERE (_company_id IS NULL OR i.company_id = _company_id) AND i.status = 'new'
        ORDER BY i.created_at DESC LIMIT 20) t), '[]'::jsonb),
    'automation', jsonb_build_object(
      'runs_24h', (SELECT COUNT(*) FROM jsc_automation_runs a
        WHERE (_company_id IS NULL OR a.company_id = _company_id) AND a.executed_at > now() - interval '24 hours'),
      'errors_24h', (SELECT COUNT(*) FROM jsc_automation_runs a
        WHERE (_company_id IS NULL OR a.company_id = _company_id) AND a.status = 'error' AND a.executed_at > now() - interval '24 hours'))
  ) INTO v;

  RETURN v;
END;
$$;
GRANT EXECUTE ON FUNCTION public.jsc_executive_dashboard(UUID) TO authenticated;

-- 8. STATISTIQUES D'APPRENTISSAGE
CREATE OR REPLACE FUNCTION public.jsc_learning_stats(_company_id UUID DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v JSONB;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Accès admin requis';
  END IF;
  SELECT jsonb_build_object(
    'total', COUNT(*),
    'won', COUNT(*) FILTER (WHERE outcome = 'won'),
    'lost', COUNT(*) FILTER (WHERE outcome = 'lost'),
    'win_rate_pct', CASE WHEN COUNT(*) > 0 THEN ROUND(100.0 * COUNT(*) FILTER (WHERE outcome = 'won') / COUNT(*), 1) ELSE 0 END,
    'avg_won_amount', COALESCE(ROUND(AVG(amount) FILTER (WHERE outcome = 'won'), 2), 0),
    'avg_lost_amount', COALESCE(ROUND(AVG(amount) FILTER (WHERE outcome = 'lost'), 2), 0),
    'by_client_type', COALESCE((
      SELECT jsonb_agg(t) FROM (
        SELECT COALESCE(c.client_type,'inconnu') AS client_type,
               COUNT(*) AS total,
               COUNT(*) FILTER (WHERE l.outcome = 'won') AS won,
               ROUND(100.0 * COUNT(*) FILTER (WHERE l.outcome = 'won') / GREATEST(COUNT(*),1), 1) AS win_rate_pct
        FROM jsc_learning_signals l
        LEFT JOIN jsc_clients c ON c.id = (l.factors->>'client_id')::uuid
        WHERE (_company_id IS NULL OR l.company_id = _company_id)
        GROUP BY 1 ORDER BY total DESC LIMIT 20) t), '[]'::jsonb),
    'top_refusal_reasons', COALESCE((
      SELECT jsonb_agg(t) FROM (
        SELECT l.factors->>'refusal_reason' AS reason, COUNT(*) AS count
        FROM jsc_learning_signals l
        WHERE (_company_id IS NULL OR l.company_id = _company_id)
          AND COALESCE(l.factors->>'refusal_reason','') <> ''
        GROUP BY 1 ORDER BY count DESC LIMIT 10) t), '[]'::jsonb)
  ) INTO v
  FROM jsc_learning_signals l2
  WHERE (_company_id IS NULL OR l2.company_id = _company_id);
  RETURN v;
END;
$$;
GRANT EXECUTE ON FUNCTION public.jsc_learning_stats(UUID) TO authenticated;
