-- ÉTAPE 10 — Confidentialité des coordonnées et messagerie interne

ALTER TABLE public.mkt_settings
  ADD COLUMN IF NOT EXISTS contact_reveal_default text NOT NULL DEFAULT 'apres_attribution';
ALTER TABLE public.mkt_settings DROP CONSTRAINT IF EXISTS mkt_settings_contact_reveal_check;
ALTER TABLE public.mkt_settings ADD CONSTRAINT mkt_settings_contact_reveal_check
  CHECK (contact_reveal_default IN ('toujours_cachees','apres_soumission','apres_preselection','apres_attribution','manuelle','visibles'));

ALTER TABLE public.mkt_quote_requests
  ADD COLUMN IF NOT EXISTS contact_revealed_at timestamptz,
  ADD COLUMN IF NOT EXISTS contact_revealed_by uuid;

-- Règle applicable à une demande : réglage de la demande, sinon réglage global.
CREATE OR REPLACE FUNCTION public.mkt_contact_rule(_request_id uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(r.contact_visibility, s.contact_reveal_default, 'apres_attribution')
    FROM public.mkt_quote_requests r
    LEFT JOIN public.mkt_settings s ON s.id = 'global'
   WHERE r.id = _request_id;
$$;

-- Les coordonnées sont-elles visibles entre le client et une entreprise donnée ?
CREATE OR REPLACE FUNCTION public.mkt_contact_visible(_request_id uuid, _company_id uuid)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE rule text; revealed timestamptz;
BEGIN
  IF public.mkt_is_admin() THEN RETURN true; END IF;
  IF NOT (public.mkt_can_see_request(_request_id) OR public.mkt_is_member(_company_id)) THEN
    RETURN false;
  END IF;
  rule := public.mkt_contact_rule(_request_id);
  SELECT contact_revealed_at INTO revealed FROM public.mkt_quote_requests WHERE id = _request_id;

  IF rule = 'visibles' THEN RETURN true; END IF;
  IF rule = 'toujours_cachees' THEN RETURN false; END IF;
  IF rule = 'manuelle' THEN RETURN revealed IS NOT NULL; END IF;
  IF revealed IS NOT NULL THEN RETURN true; END IF;

  IF rule = 'apres_soumission' THEN
    RETURN EXISTS (SELECT 1 FROM public.mkt_bids b
      WHERE b.request_id = _request_id AND b.company_id = _company_id
        AND b.status IN ('envoyee','vue','preselectionnee','retenue','non_retenue'));
  END IF;
  IF rule = 'apres_preselection' THEN
    RETURN EXISTS (SELECT 1 FROM public.mkt_bids b
      WHERE b.request_id = _request_id AND b.company_id = _company_id
        AND b.status IN ('preselectionnee','retenue'));
  END IF;
  -- apres_attribution
  RETURN EXISTS (SELECT 1 FROM public.mkt_awards a
    WHERE a.request_id = _request_id AND a.company_id = _company_id
      AND a.status IN ('a_confirmer','confirmee','en_cours','terminee'));
END;
$$;

-- Coordonnées du client transmises à une entreprise partenaire (jamais avant l'heure).
CREATE OR REPLACE FUNCTION public.mkt_client_contact(_request_id uuid, _company_id uuid)
RETURNS TABLE (visible boolean, rule text, contact_name text, contact_phone text, contact_email text, address text, organization_name text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE ok boolean;
BEGIN
  IF NOT (public.mkt_is_admin() OR public.mkt_is_member(_company_id)) THEN
    RAISE EXCEPTION 'Accès refusé';
  END IF;
  ok := public.mkt_contact_visible(_request_id, _company_id);
  RETURN QUERY
  SELECT ok, public.mkt_contact_rule(_request_id),
         CASE WHEN ok THEN r.contact_name END,
         CASE WHEN ok THEN r.contact_phone END,
         CASE WHEN ok THEN r.contact_email END,
         CASE WHEN ok THEN r.address END,
         CASE WHEN ok THEN r.organization_name END
    FROM public.mkt_quote_requests r WHERE r.id = _request_id;
END;
$$;

-- Coordonnées de l'entreprise transmises au client (mêmes règles).
CREATE OR REPLACE FUNCTION public.mkt_partner_contact(_request_id uuid, _company_id uuid)
RETURNS TABLE (visible boolean, rule text, trade_name text, phone text, email text, address text, website text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE ok boolean;
BEGIN
  IF NOT (public.mkt_is_admin() OR public.mkt_can_see_request(_request_id)) THEN
    RAISE EXCEPTION 'Accès refusé';
  END IF;
  ok := public.mkt_contact_visible(_request_id, _company_id);
  RETURN QUERY
  SELECT ok, public.mkt_contact_rule(_request_id),
         COALESCE(p.trade_name, p.legal_name),
         CASE WHEN ok THEN p.phone END,
         CASE WHEN ok THEN p.email END,
         CASE WHEN ok THEN p.address END,
         CASE WHEN ok THEN p.website END
    FROM public.mkt_partners p WHERE p.company_id = _company_id;
END;
$$;

-- Dévoilement manuel par Vrac Québec.
CREATE OR REPLACE FUNCTION public.mkt_reveal_contact(_request_id uuid, _reveal boolean DEFAULT true)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.mkt_is_admin() THEN RAISE EXCEPTION 'Accès refusé'; END IF;
  UPDATE public.mkt_quote_requests
     SET contact_revealed_at = CASE WHEN _reveal THEN now() ELSE NULL END,
         contact_revealed_by = CASE WHEN _reveal THEN auth.uid() ELSE NULL END,
         updated_at = now()
   WHERE id = _request_id;
END;
$$;

-- Marquer un fil comme lu pour la personne connectée.
CREATE OR REPLACE FUNCTION public.mkt_thread_mark_read(_thread_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.mkt_in_thread(_thread_id) THEN RAISE EXCEPTION 'Accès refusé'; END IF;
  UPDATE public.mkt_thread_participants
     SET last_read_at = now(), updated_at = now()
   WHERE thread_id = _thread_id AND user_id = auth.uid();
END;
$$;

REVOKE EXECUTE ON FUNCTION public.mkt_contact_rule(uuid), public.mkt_contact_visible(uuid, uuid),
  public.mkt_client_contact(uuid, uuid), public.mkt_partner_contact(uuid, uuid),
  public.mkt_reveal_contact(uuid, boolean), public.mkt_thread_mark_read(uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.mkt_contact_visible(uuid, uuid), public.mkt_client_contact(uuid, uuid),
  public.mkt_partner_contact(uuid, uuid), public.mkt_reveal_contact(uuid, boolean),
  public.mkt_thread_mark_read(uuid) TO authenticated;