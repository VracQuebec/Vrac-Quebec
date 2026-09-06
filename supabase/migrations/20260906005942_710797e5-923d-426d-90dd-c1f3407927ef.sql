
CREATE TABLE IF NOT EXISTS public.mkt_settings (
  id text PRIMARY KEY DEFAULT 'global',
  distribution_mode text NOT NULL DEFAULT 'manuel' CHECK (distribution_mode IN ('auto','manuel')),
  auto_top_n integer NOT NULL DEFAULT 5,
  auto_min_score numeric NOT NULL DEFAULT 60,
  require_compliance boolean NOT NULL DEFAULT false,
  invite_expiry_hours integer NOT NULL DEFAULT 72,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);

GRANT SELECT, INSERT, UPDATE ON public.mkt_settings TO authenticated;
GRANT ALL ON public.mkt_settings TO service_role;
ALTER TABLE public.mkt_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS mkt_settings_read ON public.mkt_settings;
CREATE POLICY mkt_settings_read ON public.mkt_settings
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS mkt_settings_admin ON public.mkt_settings;
CREATE POLICY mkt_settings_admin ON public.mkt_settings
  FOR ALL TO authenticated USING (public.mkt_is_admin()) WITH CHECK (public.mkt_is_admin());

INSERT INTO public.mkt_settings (id) VALUES ('global') ON CONFLICT (id) DO NOTHING;

-- Moteur de correspondance : entreprises suggérées pour une demande (ou un lot)
CREATE OR REPLACE FUNCTION public.mkt_match_partners(_request_id uuid, _lot_id uuid DEFAULT NULL)
RETURNS TABLE (
  company_id uuid,
  partner_name text,
  city text,
  region text,
  distance_km numeric,
  score numeric,
  reasons jsonb,
  matched_services text[],
  availability_status text,
  is_verified boolean,
  already_invited boolean,
  last_activity timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r record;
  target_ids uuid[];
BEGIN
  IF NOT public.mkt_is_admin() THEN
    RAISE EXCEPTION 'Accès réservé aux administrateurs.';
  END IF;

  SELECT q.*, l.category_id AS lot_category_id
    INTO r
    FROM public.mkt_quote_requests q
    LEFT JOIN public.mkt_request_lots l ON l.id = _lot_id
   WHERE q.id = _request_id;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  target_ids := ARRAY(
    SELECT DISTINCT x FROM unnest(ARRAY[r.lot_category_id, r.subcategory_id, r.category_id]) AS x
     WHERE x IS NOT NULL
  );

  RETURN QUERY
  WITH RECURSIVE cible AS (
    SELECT c.id, c.parent_id FROM public.mkt_service_categories c WHERE c.id = ANY(target_ids)
  ),
  descendants AS (
    SELECT c.id, c.parent_id FROM public.mkt_service_categories c WHERE c.id = ANY(target_ids)
    UNION ALL
    SELECT c.id, c.parent_id FROM public.mkt_service_categories c JOIN descendants d ON c.parent_id = d.id
  ),
  ancestors AS (
    SELECT c.id, c.parent_id FROM public.mkt_service_categories c WHERE c.id = ANY(target_ids)
    UNION ALL
    SELECT c.id, c.parent_id FROM public.mkt_service_categories c JOIN ancestors a ON a.parent_id = c.id
  ),
  services AS (
    SELECT ps.company_id,
           max(CASE
                 WHEN ps.category_id = ANY(target_ids) THEN 35
                 WHEN ps.category_id IN (SELECT d.id FROM descendants d) THEN 33
                 WHEN ps.category_id IN (SELECT a.id FROM ancestors a) THEN 28
                 ELSE 0
               END) AS pts,
           array_agg(DISTINCT sc.name) FILTER (
             WHERE ps.category_id = ANY(target_ids)
                OR ps.category_id IN (SELECT d.id FROM descendants d)
                OR ps.category_id IN (SELECT a.id FROM ancestors a)
           ) AS noms
      FROM public.mkt_partner_services ps
      JOIN public.mkt_service_categories sc ON sc.id = ps.category_id
     WHERE ps.is_active
     GROUP BY ps.company_id
  ),
  terr AS (
    SELECT t.company_id,
           max(CASE
                 WHEN t.scope = 'ville' AND r.city IS NOT NULL AND lower(t.city) = lower(r.city) THEN 20
                 WHEN t.scope = 'rayon' AND t.latitude IS NOT NULL AND r.latitude IS NOT NULL
                      AND public._haversine_km(t.latitude, t.longitude, r.latitude, r.longitude) <= COALESCE(t.radius_km, 50) THEN 18
                 WHEN t.scope = 'region' AND r.region IS NOT NULL AND lower(t.region) = lower(r.region) THEN 16
                 WHEN t.scope = 'province' THEN 12
                 ELSE 0
               END) AS pts
      FROM public.mkt_partner_territories t
     WHERE t.is_active
     GROUP BY t.company_id
  ),
  clients AS (
    SELECT ct.company_id, bool_or(ct.client_type = r.client_type) AS ok, count(*) AS n
      FROM public.mkt_partner_client_types ct GROUP BY ct.company_id
  ),
  dispo AS (
    SELECT a.company_id, min(a.status) AS statut
      FROM public.mkt_partner_availability a
     WHERE a.is_active
       AND (a.starts_on IS NULL OR a.starts_on <= COALESCE(r.desired_date, CURRENT_DATE))
       AND (a.ends_on IS NULL OR a.ends_on >= COALESCE(r.desired_date, CURRENT_DATE))
     GROUP BY a.company_id
  ),
  invites AS (
    SELECT DISTINCT i.company_id FROM public.mkt_invitations i
     WHERE i.request_id = _request_id
       AND (_lot_id IS NULL OR i.lot_id = _lot_id OR i.lot_id IS NULL)
  ),
  calc AS (
    SELECT
      p.company_id,
      COALESCE(NULLIF(p.trade_name, ''), p.legal_name, 'Entreprise') AS nom,
      p.city AS ville,
      p.region AS region,
      CASE WHEN p.latitude IS NOT NULL AND r.latitude IS NOT NULL
           THEN round(public._haversine_km(p.latitude, p.longitude, r.latitude, r.longitude)::numeric, 1)
           END AS dist,
      COALESCE(s.pts, 0) AS pts_service,
      s.noms AS services,
      COALESCE(t.pts, 0) AS pts_terr,
      CASE WHEN c.company_id IS NULL OR c.n = 0 THEN 6 WHEN c.ok THEN 10 ELSE 0 END AS pts_client,
      CASE
        WHEN r.estimated_value IS NULL THEN 5
        WHEN (p.min_project_amount IS NULL OR r.estimated_value >= p.min_project_amount)
         AND (p.max_project_amount IS NULL OR r.estimated_value <= p.max_project_amount) THEN 8
        ELSE 2
      END AS pts_taille,
      CASE COALESCE(d.statut, p.availability_status)
        WHEN 'disponible' THEN 7
        WHEN 'limitee' THEN 4
        WHEN 'urgences' THEN 2
        WHEN 'complet' THEN 0
        WHEN 'inactif' THEN 0
        ELSE 5
      END AS pts_dispo,
      COALESCE(d.statut, p.availability_status, 'inconnu') AS statut_dispo,
      (
        CASE WHEN pr.company_id IS NULL THEN 3 ELSE
          (CASE WHEN pr.category_ids IS NULL OR array_length(pr.category_ids, 1) IS NULL
                     OR pr.category_ids && target_ids THEN 2 ELSE 0 END)
        + (CASE WHEN pr.regions IS NULL OR array_length(pr.regions, 1) IS NULL
                     OR r.region IS NULL OR r.region = ANY(pr.regions) THEN 2 ELSE 0 END)
        + (CASE WHEN pr.paused_until IS NOT NULL AND pr.paused_until >= CURRENT_DATE THEN -4 ELSE 1 END)
        END
      ) AS pts_pref,
      COALESCE(sco.internal_score, 50) / 100.0 * 5 AS pts_score,
      p.is_verified,
      (inv.company_id IS NOT NULL) AS deja_invitee,
      GREATEST(p.updated_at, COALESCE(sco.updated_at, p.updated_at)) AS derniere_activite
    FROM public.mkt_partners p
    LEFT JOIN services s ON s.company_id = p.company_id
    LEFT JOIN terr t ON t.company_id = p.company_id
    LEFT JOIN clients c ON c.company_id = p.company_id
    LEFT JOIN dispo d ON d.company_id = p.company_id
    LEFT JOIN public.mkt_partner_preferences pr ON pr.company_id = p.company_id
    LEFT JOIN public.mkt_partner_scores sco ON sco.company_id = p.company_id
    LEFT JOIN invites inv ON inv.company_id = p.company_id
    WHERE p.is_active AND p.archived_at IS NULL
  ),
  final AS (
    SELECT calc.*,
      CASE
        WHEN dist IS NULL THEN 6
        WHEN dist <= 25 THEN 15
        WHEN dist <= 50 THEN 12
        WHEN dist <= 100 THEN 8
        WHEN dist <= 200 THEN 4
        ELSE 0
      END AS pts_dist
    FROM calc
  )
  SELECT
    f.company_id,
    f.nom,
    f.ville,
    f.region,
    f.dist,
    LEAST(100, round((f.pts_service + f.pts_terr + f.pts_dist + f.pts_client + f.pts_taille
                      + f.pts_dispo + f.pts_pref + f.pts_score)::numeric, 0)) AS score,
    jsonb_build_object(
      'services', f.pts_service, 'territoire', f.pts_terr, 'distance', f.pts_dist,
      'clientele', f.pts_client, 'taille', f.pts_taille, 'disponibilite', f.pts_dispo,
      'preferences', f.pts_pref, 'performance', round(f.pts_score::numeric, 1)
    ) AS reasons,
    COALESCE(f.services, ARRAY[]::text[]) AS matched_services,
    f.statut_dispo,
    f.is_verified,
    f.deja_invitee,
    f.derniere_activite
  FROM final f
  WHERE f.pts_service > 0
  ORDER BY score DESC, f.dist NULLS LAST;
END;
$$;

REVOKE ALL ON FUNCTION public.mkt_match_partners(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mkt_match_partners(uuid, uuid) TO authenticated, service_role;

-- Envoi des invitations aux entreprises choisies
CREATE OR REPLACE FUNCTION public.mkt_invite_partners(
  _request_id uuid,
  _company_ids uuid[],
  _lot_id uuid DEFAULT NULL,
  _mode text DEFAULT 'manuel'
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  n integer := 0;
  m record;
BEGIN
  IF NOT public.mkt_is_admin() THEN
    RAISE EXCEPTION 'Accès réservé aux administrateurs.';
  END IF;

  FOR m IN SELECT * FROM public.mkt_match_partners(_request_id, _lot_id)
            WHERE company_id = ANY(_company_ids)
  LOOP
    INSERT INTO public.mkt_invitations
      (request_id, lot_id, company_id, match_score, match_reasons, distance_km, mode, status, sent_at, created_by)
    VALUES
      (_request_id, _lot_id, m.company_id, m.score, m.reasons, m.distance_km,
       COALESCE(_mode, 'manuel'), 'envoyee', now(), auth.uid())
    ON CONFLICT (request_id, lot_id, company_id) DO UPDATE
      SET status = 'envoyee', sent_at = now(), match_score = EXCLUDED.match_score,
          match_reasons = EXCLUDED.match_reasons, distance_km = EXCLUDED.distance_km,
          mode = EXCLUDED.mode, updated_at = now();
    n := n + 1;
  END LOOP;

  UPDATE public.mkt_quote_requests
     SET status = CASE WHEN status IN ('nouvelle','a_qualifier') THEN 'distribuee' ELSE status END,
         updated_at = now()
   WHERE id = _request_id AND n > 0;

  RETURN n;
END;
$$;

REVOKE ALL ON FUNCTION public.mkt_invite_partners(uuid, uuid[], uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mkt_invite_partners(uuid, uuid[], uuid, text) TO authenticated, service_role;
