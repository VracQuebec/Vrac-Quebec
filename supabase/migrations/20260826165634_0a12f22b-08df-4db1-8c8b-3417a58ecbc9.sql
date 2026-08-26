CREATE TABLE public.seo_orchestrator_lease (
  lock_name text PRIMARY KEY,
  holder_id uuid,
  acquired_at timestamptz,
  expires_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.seo_orchestrator_lease TO service_role;
ALTER TABLE public.seo_orchestrator_lease ENABLE ROW LEVEL SECURITY;

INSERT INTO public.seo_orchestrator_lease (lock_name)
VALUES ('seo-pipeline-v2')
ON CONFLICT (lock_name) DO NOTHING;

CREATE OR REPLACE FUNCTION public.seo_orchestrator_acquire_lease(
  _holder_id uuid,
  _ttl_seconds integer DEFAULT 120
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _acquired boolean;
BEGIN
  INSERT INTO public.seo_orchestrator_lease (
    lock_name, holder_id, acquired_at, expires_at, updated_at
  )
  VALUES (
    'seo-pipeline-v2', _holder_id, now(), now() + make_interval(secs => greatest(30, least(_ttl_seconds, 300))), now()
  )
  ON CONFLICT (lock_name) DO UPDATE
  SET holder_id = EXCLUDED.holder_id,
      acquired_at = CASE
        WHEN seo_orchestrator_lease.holder_id = EXCLUDED.holder_id THEN seo_orchestrator_lease.acquired_at
        ELSE now()
      END,
      expires_at = EXCLUDED.expires_at,
      updated_at = now()
  WHERE seo_orchestrator_lease.holder_id IS NULL
     OR seo_orchestrator_lease.holder_id = EXCLUDED.holder_id
     OR seo_orchestrator_lease.expires_at IS NULL
     OR seo_orchestrator_lease.expires_at <= now()
  RETURNING true INTO _acquired;

  RETURN coalesce(_acquired, false);
END;
$$;

CREATE OR REPLACE FUNCTION public.seo_orchestrator_release_lease(_holder_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _released boolean;
BEGIN
  UPDATE public.seo_orchestrator_lease
  SET holder_id = NULL,
      expires_at = NULL,
      updated_at = now()
  WHERE lock_name = 'seo-pipeline-v2'
    AND holder_id = _holder_id
  RETURNING true INTO _released;

  RETURN coalesce(_released, false);
END;
$$;

REVOKE ALL ON FUNCTION public.seo_orchestrator_acquire_lease(uuid, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.seo_orchestrator_release_lease(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.seo_orchestrator_acquire_lease(uuid, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.seo_orchestrator_release_lease(uuid) TO service_role;