ALTER TABLE public.transport_requests
  ADD COLUMN IF NOT EXISTS origin_submission_id uuid REFERENCES public.submissions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS origin_stage text NOT NULL DEFAULT 'transport_request';

CREATE INDEX IF NOT EXISTS idx_transport_requests_origin_submission
  ON public.transport_requests (origin_submission_id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_transport_requests_origin_stage
  ON public.transport_requests (origin_submission_id, origin_stage)
  WHERE origin_submission_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.get_submission_transport_request(
  p_submission_id uuid,
  p_stage text DEFAULT 'transport_request'
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.transport_requests%ROWTYPE;
BEGIN
  IF p_submission_id IS NULL THEN
    RAISE EXCEPTION 'submission_id_required';
  END IF;
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  SELECT * INTO v_row
  FROM public.transport_requests
  WHERE origin_submission_id = p_submission_id
    AND origin_stage = COALESCE(p_stage, 'transport_request')
  ORDER BY created_at ASC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  RETURN jsonb_build_object(
    'id', v_row.id,
    'request_number', v_row.request_number,
    'status', v_row.status,
    'created_at', v_row.created_at,
    'origin_submission_id', v_row.origin_submission_id,
    'origin_stage', v_row.origin_stage,
    'dump_name', v_row.dump_name,
    'site_address', v_row.site_address
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_submission_transport_request(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_submission_transport_request(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_submission_transport_request(uuid, text) TO service_role;