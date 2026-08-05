CREATE TABLE public.route_cache (
  cache_key TEXT PRIMARY KEY,
  distance_km NUMERIC,
  duration_minutes INTEGER,
  route_exists BOOLEAN NOT NULL DEFAULT true,
  hits INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.route_cache TO authenticated;
GRANT ALL ON public.route_cache TO service_role;

ALTER TABLE public.route_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read route cache"
ON public.route_cache FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX idx_route_cache_last_used ON public.route_cache (last_used_at);