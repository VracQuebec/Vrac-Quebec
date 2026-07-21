
-- Idempotency key on transport_requests so the same submission never creates duplicates
ALTER TABLE public.transport_requests
  ADD COLUMN IF NOT EXISTS idempotency_key text;

CREATE UNIQUE INDEX IF NOT EXISTS transport_requests_idempotency_key_uniq
  ON public.transport_requests(idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- Server-side error log: every failed attempt, retry, cause, latency
CREATE TABLE IF NOT EXISTS public.transport_request_errors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  idempotency_key text,
  request_id uuid REFERENCES public.transport_requests(id) ON DELETE SET NULL,
  stage text NOT NULL, -- 'validation' | 'insert' | 'trigger' | 'unexpected' | 'client_retry'
  error_code text,
  error_message text,
  payload jsonb,
  attempt integer NOT NULL DEFAULT 1,
  duration_ms integer,
  user_agent text,
  ip text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.transport_request_errors TO service_role;
GRANT SELECT ON public.transport_request_errors TO authenticated;

ALTER TABLE public.transport_request_errors ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view transport error logs"
  ON public.transport_request_errors
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE INDEX IF NOT EXISTS transport_request_errors_created_at_idx
  ON public.transport_request_errors(created_at DESC);

CREATE INDEX IF NOT EXISTS transport_request_errors_stage_idx
  ON public.transport_request_errors(stage);
