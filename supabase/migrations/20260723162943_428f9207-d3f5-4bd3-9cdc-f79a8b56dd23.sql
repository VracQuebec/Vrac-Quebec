
-- ===== Phase 3: AI Economy — Cache, Dedup, Counters =====

-- Permanent AI response cache
CREATE TABLE IF NOT EXISTS public.ai_cache (
  cache_key TEXT PRIMARY KEY,
  model TEXT NOT NULL,
  function_name TEXT,
  response JSONB NOT NULL,
  prompt_tokens INT DEFAULT 0,
  completion_tokens INT DEFAULT 0,
  hit_count INT NOT NULL DEFAULT 0,
  estimated_credits_saved NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.ai_cache TO authenticated;
GRANT ALL ON public.ai_cache TO service_role;
ALTER TABLE public.ai_cache ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ai_cache admin read" ON public.ai_cache FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Per-call log (append-only)
CREATE TABLE IF NOT EXISTS public.ai_call_log (
  id BIGSERIAL PRIMARY KEY,
  function_name TEXT,
  model TEXT,
  cache_key TEXT,
  cached BOOLEAN NOT NULL DEFAULT false,
  prompt_tokens INT DEFAULT 0,
  completion_tokens INT DEFAULT 0,
  estimated_credits NUMERIC NOT NULL DEFAULT 0,
  duration_ms INT DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ai_call_log_created_idx ON public.ai_call_log(created_at DESC);
GRANT SELECT ON public.ai_call_log TO authenticated;
GRANT ALL ON public.ai_call_log TO service_role;
ALTER TABLE public.ai_call_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ai_call_log admin read" ON public.ai_call_log FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Settings singleton
CREATE TABLE IF NOT EXISTS public.ai_settings (
  id INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  economy_mode BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO public.ai_settings (id, economy_mode) VALUES (1, true) ON CONFLICT (id) DO NOTHING;
GRANT SELECT ON public.ai_settings TO authenticated;
GRANT ALL ON public.ai_settings TO service_role;
ALTER TABLE public.ai_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ai_settings read auth" ON public.ai_settings FOR SELECT TO authenticated USING (true);
CREATE POLICY "ai_settings admin write" ON public.ai_settings FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Realtime economy stats
CREATE OR REPLACE FUNCTION public.ai_economy_stats(_days INT DEFAULT 1)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH win AS (
    SELECT * FROM public.ai_call_log
    WHERE created_at >= now() - make_interval(days => GREATEST(_days,1))
  )
  SELECT jsonb_build_object(
    'window_days', GREATEST(_days,1),
    'calls_total', (SELECT COUNT(*) FROM win),
    'calls_ai', (SELECT COUNT(*) FROM win WHERE cached = false),
    'calls_cached', (SELECT COUNT(*) FROM win WHERE cached = true),
    'credits_spent', COALESCE((SELECT SUM(estimated_credits) FROM win WHERE cached=false), 0),
    'credits_saved', COALESCE((SELECT SUM(estimated_credits) FROM win WHERE cached=true), 0),
    'time_saved_ms', COALESCE((SELECT SUM(duration_ms) FROM win WHERE cached=true), 0),
    'cache_hit_rate', CASE WHEN (SELECT COUNT(*) FROM win) = 0 THEN 0
      ELSE ROUND(100.0 * (SELECT COUNT(*) FROM win WHERE cached=true) / (SELECT COUNT(*) FROM win), 1) END,
    'cache_entries', (SELECT COUNT(*) FROM public.ai_cache),
    'total_hits_all_time', COALESCE((SELECT SUM(hit_count) FROM public.ai_cache), 0),
    'total_saved_all_time', COALESCE((SELECT SUM(estimated_credits_saved) FROM public.ai_cache), 0)
  );
$$;
GRANT EXECUTE ON FUNCTION public.ai_economy_stats(INT) TO authenticated;
