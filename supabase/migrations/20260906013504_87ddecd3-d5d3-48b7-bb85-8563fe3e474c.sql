-- Notes internes (invisibles au client et aux partenaires)
CREATE TABLE IF NOT EXISTS public.mkt_admin_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES public.mkt_quote_requests(id) ON DELETE CASCADE,
  body text NOT NULL,
  pinned boolean NOT NULL DEFAULT false,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.mkt_admin_notes TO authenticated;
GRANT ALL ON public.mkt_admin_notes TO service_role;
ALTER TABLE public.mkt_admin_notes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS mkt_admin_notes_admin ON public.mkt_admin_notes;
CREATE POLICY mkt_admin_notes_admin ON public.mkt_admin_notes FOR ALL TO authenticated
  USING (public.mkt_is_admin()) WITH CHECK (public.mkt_is_admin());
CREATE INDEX IF NOT EXISTS idx_mkt_admin_notes_request ON public.mkt_admin_notes(request_id);

-- Journal d'activité de la place de marché
CREATE TABLE IF NOT EXISTS public.mkt_activity_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid REFERENCES public.mkt_quote_requests(id) ON DELETE CASCADE,
  company_id uuid,
  entity text NOT NULL,
  entity_id uuid,
  action text NOT NULL,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  actor_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.mkt_activity_log TO authenticated;
GRANT ALL ON public.mkt_activity_log TO service_role;
ALTER TABLE public.mkt_activity_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS mkt_activity_log_admin ON public.mkt_activity_log;
CREATE POLICY mkt_activity_log_admin ON public.mkt_activity_log FOR SELECT TO authenticated
  USING (public.mkt_is_admin());
CREATE INDEX IF NOT EXISTS idx_mkt_activity_request ON public.mkt_activity_log(request_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.mkt_log_event()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_request uuid;
  v_company uuid;
  v_action text;
  v_detail jsonb := '{}'::jsonb;
BEGIN
  v_request := COALESCE((to_jsonb(NEW)->>'request_id')::uuid, CASE WHEN TG_TABLE_NAME = 'mkt_quote_requests' THEN NEW.id END);
  v_company := (to_jsonb(NEW)->>'company_id')::uuid;
  IF TG_OP = 'INSERT' THEN
    v_action := 'creation';
  ELSE
    IF (to_jsonb(NEW)->>'status') IS NOT DISTINCT FROM (to_jsonb(OLD)->>'status') THEN
      RETURN NEW;
    END IF;
    v_action := 'statut';
    v_detail := jsonb_build_object('avant', to_jsonb(OLD)->>'status', 'apres', to_jsonb(NEW)->>'status');
  END IF;
  INSERT INTO public.mkt_activity_log(request_id, company_id, entity, entity_id, action, detail, actor_id)
  VALUES (v_request, v_company, TG_TABLE_NAME, NEW.id, v_action, v_detail, auth.uid());
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_mkt_log_requests ON public.mkt_quote_requests;
CREATE TRIGGER trg_mkt_log_requests AFTER INSERT OR UPDATE ON public.mkt_quote_requests
  FOR EACH ROW EXECUTE FUNCTION public.mkt_log_event();
DROP TRIGGER IF EXISTS trg_mkt_log_invitations ON public.mkt_invitations;
CREATE TRIGGER trg_mkt_log_invitations AFTER INSERT OR UPDATE ON public.mkt_invitations
  FOR EACH ROW EXECUTE FUNCTION public.mkt_log_event();
DROP TRIGGER IF EXISTS trg_mkt_log_bids ON public.mkt_bids;
CREATE TRIGGER trg_mkt_log_bids AFTER INSERT OR UPDATE ON public.mkt_bids
  FOR EACH ROW EXECUTE FUNCTION public.mkt_log_event();
DROP TRIGGER IF EXISTS trg_mkt_log_awards ON public.mkt_awards;
CREATE TRIGGER trg_mkt_log_awards AFTER INSERT OR UPDATE ON public.mkt_awards
  FOR EACH ROW EXECUTE FUNCTION public.mkt_log_event();

-- Tableau de bord administratif : une ligne par demande avec ses agrégats
CREATE OR REPLACE FUNCTION public.mkt_admin_board()
RETURNS TABLE (
  id uuid, request_number text, title text, status text, city text, region text,
  client_type text, contact_name text, organization_name text,
  estimated_value numeric, created_at timestamptz, deadline_at timestamptz, desired_date date,
  invitations_count int, invitations_sent_at timestamptz, responses_count int,
  bids_count int, bids_total numeric, last_bid_at timestamptz,
  award_status text, award_amount numeric, awarded_at timestamptz,
  commission_status text, commission_amount numeric,
  notes_count int, unread_messages int, last_activity_at timestamptz
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT r.id, r.request_number, r.title, r.status, r.city, r.region,
         r.client_type, r.contact_name, r.organization_name,
         r.estimated_value, r.created_at, r.deadline_at, r.desired_date,
         COALESCE(i.cnt, 0), i.sent_at, COALESCE(i.responses, 0),
         COALESCE(b.cnt, 0), b.total, b.last_at,
         a.status, a.amount, a.awarded_at,
         c.status, c.amount,
         COALESCE(n.cnt, 0), 0,
         GREATEST(r.updated_at, COALESCE(b.last_at, r.updated_at), COALESCE(a.awarded_at, r.updated_at))
  FROM public.mkt_quote_requests r
  LEFT JOIN LATERAL (
    SELECT count(*)::int cnt, min(sent_at) sent_at,
           count(*) FILTER (WHERE responded_at IS NOT NULL)::int responses
    FROM public.mkt_invitations WHERE request_id = r.id
  ) i ON true
  LEFT JOIN LATERAL (
    SELECT count(*)::int cnt, sum(amount) total, max(submitted_at) last_at
    FROM public.mkt_bids WHERE request_id = r.id AND status <> 'brouillon'
  ) b ON true
  LEFT JOIN LATERAL (
    SELECT status, COALESCE(final_amount, amount) amount, awarded_at
    FROM public.mkt_awards WHERE request_id = r.id ORDER BY created_at DESC LIMIT 1
  ) a ON true
  LEFT JOIN LATERAL (
    SELECT status, amount FROM public.mkt_commissions WHERE request_id = r.id ORDER BY created_at DESC LIMIT 1
  ) c ON true
  LEFT JOIN LATERAL (
    SELECT count(*)::int cnt FROM public.mkt_admin_notes WHERE request_id = r.id
  ) n ON true
  WHERE public.mkt_is_admin() AND COALESCE(r.is_active, true)
  ORDER BY r.created_at DESC
  LIMIT 500;
$$;
REVOKE EXECUTE ON FUNCTION public.mkt_admin_board() FROM anon;

CREATE OR REPLACE FUNCTION public.mkt_admin_set_status(_request_id uuid, _status text, _note text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.mkt_is_admin() THEN RAISE EXCEPTION 'Accès refusé'; END IF;
  UPDATE public.mkt_quote_requests SET status = _status, updated_at = now() WHERE id = _request_id;
  IF _note IS NOT NULL AND length(btrim(_note)) > 0 THEN
    INSERT INTO public.mkt_admin_notes(request_id, body, created_by) VALUES (_request_id, _note, auth.uid());
  END IF;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.mkt_admin_set_status(uuid, text, text) FROM anon;