ALTER TABLE public.transport_requests
  ADD COLUMN IF NOT EXISTS request_kind text DEFAULT 'dump_access',
  ADD COLUMN IF NOT EXISTS transport_mode text;
ALTER TABLE public.transport_requests
  ADD CONSTRAINT transport_requests_request_kind_chk CHECK (request_kind IS NULL OR request_kind IN ('dump_access','transport')) NOT VALID,
  ADD CONSTRAINT transport_requests_transport_mode_chk CHECK (transport_mode IS NULL OR transport_mode IN ('own_trucks','requested')) NOT VALID;
COMMENT ON COLUMN public.transport_requests.request_kind IS 'dump_access = demande d''accès à une dompe (n''accorde pas l''accès); transport = commande de transport';
COMMENT ON COLUMN public.transport_requests.transport_mode IS 'own_trucks = l''entrepreneur transporte lui-même; requested = transport demandé; NULL = non précisé (historique)';

-- Métadonnées de lecture : sens du besoin, raison de visibilité, précision du lieu, incertitude de date.
CREATE OR REPLACE FUNCTION public.get_my_submission_meta()
RETURNS TABLE(id uuid, parcours_direction text, deliver_or_remove text, visibility_reason text,
  location_type text, geocoding_status text, creation_origin text, lead_source text, shared_timestamp_count integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  WITH me AS (
    SELECT auth.uid() AS uid, lower(trim(coalesce(public.current_user_email(), ''))) AS mail
  ), ent AS (
    SELECT e.id FROM public.entrepreneurs e, me WHERE e.user_id = me.uid
  )
  SELECT s.id, s.parcours_direction, s.deliver_or_remove,
    CASE
      WHEN s.created_by = me.uid THEN 'compte'
      WHEN s.assigned_entrepreneur IS NOT NULL AND s.assigned_entrepreneur IN (SELECT id FROM ent) THEN 'affectation'
      ELSE 'courriel'
    END,
    s.location_type, s.geocoding_status, s.creation_origin, s.lead_source,
    (SELECT count(*)::int FROM public.submissions x WHERE x.created_at = s.created_at)
  FROM public.submissions s, me
  WHERE me.uid IS NOT NULL
    AND (s.created_by = me.uid
      OR (s.email IS NOT NULL AND me.mail <> '' AND lower(trim(s.email)) = me.mail))
$$;
REVOKE ALL ON FUNCTION public.get_my_submission_meta() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_submission_meta() TO authenticated;