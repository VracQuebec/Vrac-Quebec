-- ============================================================
-- WORKFLOW MÉTIER : approbation DOMPE PAR DOMPE dans une demande.
-- Une ligne = relation (demande + dompe) avec son propre état.
-- L'adresse réelle n'est divulguée que si CETTE relation est approuvée.
-- Aucune modification de la géolocalisation, des positions publiques,
-- de l'admissibilité (« en attente de livraison »), du SEO.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.submission_site_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id uuid NOT NULL REFERENCES public.submissions(id) ON DELETE CASCADE,
  site_id uuid NOT NULL REFERENCES public.submissions(id) ON DELETE CASCADE,
  site_label text,
  status text NOT NULL DEFAULT 'en_attente',
  source text NOT NULL DEFAULT 'selection',
  decision_note text,
  decided_at timestamptz,
  decided_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT submission_site_decisions_status_chk
    CHECK (status IN ('en_attente','approuvee','refusee')),
  CONSTRAINT submission_site_decisions_unique UNIQUE (submission_id, site_id)
);

CREATE INDEX IF NOT EXISTS submission_site_decisions_submission_idx
  ON public.submission_site_decisions (submission_id);
CREATE INDEX IF NOT EXISTS submission_site_decisions_site_idx
  ON public.submission_site_decisions (site_id);

GRANT SELECT ON public.submission_site_decisions TO authenticated;
GRANT ALL ON public.submission_site_decisions TO service_role;

ALTER TABLE public.submission_site_decisions ENABLE ROW LEVEL SECURITY;

-- Lecture : administration, ou propriétaire réel de la demande.
-- Aucune policy d'écriture : les décisions passent uniquement par les RPC
-- SECURITY DEFINER ci-dessous (admin) ou la sélection du propriétaire.
DROP POLICY IF EXISTS ssd_select_admin_or_owner ON public.submission_site_decisions;
CREATE POLICY ssd_select_admin_or_owner
ON public.submission_site_decisions
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR EXISTS (
    SELECT 1 FROM public.submissions s
    WHERE s.id = submission_site_decisions.submission_id
      AND (
        s.created_by = auth.uid()
        OR (s.email IS NOT NULL
            AND lower(trim(s.email)) = lower(trim(coalesce(public.current_user_email(), ''))))
      )
  )
);

-- Propriétaire réel de la demande (helper interne).
CREATE OR REPLACE FUNCTION public.submission_belongs_to_current_user(p_submission_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.submissions s
    WHERE s.id = p_submission_id
      AND auth.uid() IS NOT NULL
      AND (
        s.created_by = auth.uid()
        OR (s.email IS NOT NULL
            AND lower(trim(s.email)) = lower(trim(coalesce(public.current_user_email(), ''))))
      )
  )
$function$;

-- ------------------------------------------------------------
-- Sélection : l'entrepreneur ajoute / retire une dompe de sa demande.
-- Une dompe n'est sélectionnable que si elle est ADMISSIBLE
-- (statut exact « en attente de livraison ») — règle inchangée.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.add_submission_site(p_submission_id uuid, p_site_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_site public.submissions%ROWTYPE;
  v_row public.submission_site_decisions%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;
  IF p_submission_id IS NULL OR p_site_id IS NULL THEN
    RAISE EXCEPTION 'ids_required';
  END IF;
  IF NOT (public.has_role(auth.uid(), 'admin'::app_role)
          OR public.submission_belongs_to_current_user(p_submission_id)) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  SELECT * INTO v_site FROM public.submissions WHERE id = p_site_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'site_not_found';
  END IF;
  IF lower(trim(coalesce(v_site.status,''))) IS DISTINCT FROM 'en attente de livraison' THEN
    RAISE EXCEPTION 'site_not_eligible';
  END IF;

  INSERT INTO public.submission_site_decisions (submission_id, site_id, site_label, source)
  VALUES (
    p_submission_id, p_site_id,
    COALESCE(v_site.dompe_number, 'Dompe #' || v_site.submission_number),
    'manuelle'
  )
  ON CONFLICT (submission_id, site_id) DO UPDATE
    SET site_label = COALESCE(EXCLUDED.site_label, public.submission_site_decisions.site_label),
        updated_at = now()
  RETURNING * INTO v_row;

  RETURN jsonb_build_object(
    'submission_id', v_row.submission_id,
    'site_id', v_row.site_id,
    'site_label', v_row.site_label,
    'status', v_row.status
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.add_submission_site(uuid, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.remove_submission_site(p_submission_id uuid, p_site_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;
  IF NOT (public.has_role(auth.uid(), 'admin'::app_role)
          OR public.submission_belongs_to_current_user(p_submission_id)) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  DELETE FROM public.submission_site_decisions
   WHERE submission_id = p_submission_id AND site_id = p_site_id;

  -- Si la dompe retirée était le site principal, l'approbation tombe aussi.
  UPDATE public.submissions
     SET site_validated_at = NULL, site_validated_by = NULL
   WHERE id = p_submission_id AND selected_site_id = p_site_id;

  RETURN jsonb_build_object('submission_id', p_submission_id, 'site_id', p_site_id, 'removed', true);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.remove_submission_site(uuid, uuid) TO authenticated;

-- ------------------------------------------------------------
-- Lecture : liste des dompes d'une demande, avec divulgation progressive.
-- L'adresse / les coordonnées RÉELLES ne sortent que pour une relation
-- (demande + dompe) APPROUVÉE, ou pour l'administration.
-- Sinon : uniquement la position publique anonymisée déjà en place.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_submission_sites(p_submission_id uuid)
 RETURNS TABLE(
   submission_id uuid, site_id uuid, site_label text, status text,
   decided_at timestamptz, decision_note text, created_at timestamptz,
   site_status text, site_material text,
   public_latitude double precision, public_longitude double precision,
   site_address text, site_latitude double precision, site_longitude double precision
 )
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_admin boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;
  v_admin := public.has_role(auth.uid(), 'admin'::app_role);
  IF NOT v_admin AND NOT public.submission_belongs_to_current_user(p_submission_id) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  RETURN QUERY
  SELECT
    d.submission_id, d.site_id,
    COALESCE(d.site_label, site.dompe_number, 'Dompe #' || site.submission_number),
    d.status, d.decided_at, d.decision_note, d.created_at,
    site.status, COALESCE(site.materials[1], site.other_material),
    site.public_latitude, site.public_longitude,
    CASE WHEN v_admin OR d.status = 'approuvee'
         THEN COALESCE(site.formatted_address, site.address) END,
    CASE WHEN v_admin OR d.status = 'approuvee' THEN site.latitude END,
    CASE WHEN v_admin OR d.status = 'approuvee' THEN site.longitude END
  FROM public.submission_site_decisions d
  JOIN public.submissions site ON site.id = d.site_id
  WHERE d.submission_id = p_submission_id
  ORDER BY d.created_at ASC;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.get_submission_sites(uuid) TO authenticated;

-- ------------------------------------------------------------
-- Décision administrateur, dompe par dompe.
-- Une décision ne touche QUE la relation (demande + dompe) visée.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.decide_submission_site(
  p_submission_id uuid, p_site_id uuid, p_decision text, p_note text DEFAULT NULL
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_sub public.submissions%ROWTYPE;
  v_site public.submissions%ROWTYPE;
  v_row public.submission_site_decisions%ROWTYPE;
  v_prev text;
  v_changed boolean := false;
  v_title text;
  v_body text;
  v_level text;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;
  IF p_submission_id IS NULL OR p_site_id IS NULL THEN
    RAISE EXCEPTION 'ids_required';
  END IF;
  IF p_decision NOT IN ('approuvee','refusee','en_attente') THEN
    RAISE EXCEPTION 'invalid_decision';
  END IF;

  SELECT * INTO v_sub FROM public.submissions WHERE id = p_submission_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'submission_not_found'; END IF;
  SELECT * INTO v_site FROM public.submissions WHERE id = p_site_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'site_not_found'; END IF;

  SELECT * INTO v_row FROM public.submission_site_decisions
   WHERE submission_id = p_submission_id AND site_id = p_site_id;
  IF NOT FOUND THEN
    INSERT INTO public.submission_site_decisions (submission_id, site_id, site_label, source)
    VALUES (p_submission_id, p_site_id,
            COALESCE(v_site.dompe_number, 'Dompe #' || v_site.submission_number), 'selection')
    RETURNING * INTO v_row;
  END IF;

  v_prev := v_row.status;
  IF v_prev IS DISTINCT FROM p_decision THEN
    UPDATE public.submission_site_decisions
       SET status = p_decision,
           decision_note = p_note,
           decided_at = CASE WHEN p_decision = 'en_attente' THEN NULL ELSE now() END,
           decided_by = CASE WHEN p_decision = 'en_attente' THEN NULL ELSE auth.uid() END,
           updated_at = now()
     WHERE id = v_row.id
    RETURNING * INTO v_row;
    v_changed := true;
  END IF;

  -- Cohérence avec le champ historique `site_validated_at` (même logique,
  -- pas une deuxième logique parallèle) : il ne reflète QUE le site principal.
  IF v_sub.selected_site_id = p_site_id THEN
    IF p_decision = 'approuvee' AND v_sub.site_validated_at IS NULL THEN
      UPDATE public.submissions
         SET site_validated_at = now(), site_validated_by = auth.uid()
       WHERE id = p_submission_id;
    ELSIF p_decision <> 'approuvee' AND v_sub.site_validated_at IS NOT NULL THEN
      UPDATE public.submissions
         SET site_validated_at = NULL, site_validated_by = NULL
       WHERE id = p_submission_id;
    END IF;
  END IF;

  -- Avis entrepreneur : une notification par décision réellement changée.
  IF v_changed AND v_sub.created_by IS NOT NULL THEN
    IF p_decision = 'approuvee' THEN
      v_title := 'Dompe approuvée — adresse réelle disponible';
      v_body := concat_ws(' · ', nullif(v_row.site_label, ''),
        'L''adresse réelle est maintenant visible dans le détail de votre demande.');
      v_level := 'succes';
    ELSIF p_decision = 'refusee' THEN
      v_title := 'Dompe refusée';
      v_body := concat_ws(' · ', nullif(v_row.site_label, ''),
        COALESCE(nullif(btrim(p_note), ''), 'Cette dompe n''a pas été autorisée pour votre demande.'));
      v_level := 'avertissement';
    ELSE
      v_title := 'Approbation retirée';
      v_body := concat_ws(' · ', nullif(v_row.site_label, ''),
        'L''adresse réelle n''est plus accessible pour cette dompe.');
      v_level := 'avertissement';
    END IF;

    PERFORM public.mkt_notify(
      'client', 'dompe_decision', v_title, v_body,
      v_sub.created_by, NULL, NULL,
      '/entrepreneur/demandes?demande=' || v_sub.id::text,
      v_level,
      'entr:sub:site-decision:' || v_sub.id::text || ':' || p_site_id::text || ':'
        || p_decision || ':' || extract(epoch from clock_timestamp())::bigint::text,
      jsonb_build_object('source','submission','request_id',v_sub.id,
                         'site_id',p_site_id,'decision',p_decision,'previous',v_prev)
    );
  END IF;

  RETURN jsonb_build_object(
    'submission_id', v_row.submission_id,
    'site_id', v_row.site_id,
    'site_label', v_row.site_label,
    'status', v_row.status,
    'previous_status', v_prev,
    'changed', v_changed,
    'decided_at', v_row.decided_at
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.decide_submission_site(uuid, uuid, text, text) TO authenticated;

-- ------------------------------------------------------------
-- Les RPC historiques deviennent des enveloppes du même moteur.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.validate_selected_site(p_submission_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_row public.submissions%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;
  IF p_submission_id IS NULL THEN
    RAISE EXCEPTION 'submission_id_required';
  END IF;

  SELECT * INTO v_row FROM public.submissions WHERE id = p_submission_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'submission_not_found'; END IF;
  IF v_row.selected_site_id IS NULL THEN RAISE EXCEPTION 'no_site_selected'; END IF;

  PERFORM public.decide_submission_site(p_submission_id, v_row.selected_site_id, 'approuvee', NULL);

  SELECT * INTO v_row FROM public.submissions WHERE id = p_submission_id;

  RETURN jsonb_build_object(
    'submission_id', v_row.id,
    'submission_number', v_row.submission_number,
    'selected_site_id', v_row.selected_site_id,
    'selected_site_label', v_row.selected_site_label,
    'selected_site_address', v_row.selected_site_address,
    'selected_site_latitude', v_row.selected_site_latitude,
    'selected_site_longitude', v_row.selected_site_longitude,
    'site_validated_at', v_row.site_validated_at,
    'site_validated_by', v_row.site_validated_by
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.revoke_selected_site_validation(p_submission_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_row public.submissions%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;
  IF p_submission_id IS NULL THEN
    RAISE EXCEPTION 'submission_id_required';
  END IF;

  SELECT * INTO v_row FROM public.submissions WHERE id = p_submission_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'submission_not_found'; END IF;

  IF v_row.selected_site_id IS NOT NULL THEN
    PERFORM public.decide_submission_site(p_submission_id, v_row.selected_site_id, 'en_attente', NULL);
  END IF;

  UPDATE public.submissions
     SET site_validated_at = NULL, site_validated_by = NULL
   WHERE id = p_submission_id;

  RETURN jsonb_build_object('submission_id', p_submission_id, 'site_validated_at', NULL::timestamptz);
END;
$function$;

-- ------------------------------------------------------------
-- Synchronisation : le site principal choisi par l'entrepreneur possède
-- toujours sa ligne de décision. Un changement de site n'hérite JAMAIS
-- de l'approbation précédente.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.submissions_sync_site_decision()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_site public.submissions%ROWTYPE;
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.selected_site_id IS NOT NULL
     AND NEW.selected_site_id IS DISTINCT FROM OLD.selected_site_id THEN
    DELETE FROM public.submission_site_decisions
     WHERE submission_id = NEW.id AND site_id = OLD.selected_site_id AND source = 'selection';
  END IF;

  IF NEW.selected_site_id IS NOT NULL
     AND (TG_OP = 'INSERT' OR NEW.selected_site_id IS DISTINCT FROM OLD.selected_site_id) THEN
    SELECT * INTO v_site FROM public.submissions WHERE id = NEW.selected_site_id;
    INSERT INTO public.submission_site_decisions (submission_id, site_id, site_label, source)
    VALUES (NEW.id, NEW.selected_site_id,
            COALESCE(NEW.selected_site_label, v_site.dompe_number,
                     'Dompe #' || v_site.submission_number), 'selection')
    ON CONFLICT (submission_id, site_id) DO NOTHING;
  END IF;

  RETURN NULL;
END;
$function$;

DROP TRIGGER IF EXISTS trg_submissions_sync_site_decision ON public.submissions;
CREATE TRIGGER trg_submissions_sync_site_decision
AFTER INSERT OR UPDATE OF selected_site_id ON public.submissions
FOR EACH ROW EXECUTE FUNCTION public.submissions_sync_site_decision();

-- Reprise des demandes existantes : une ligne de décision par site déjà
-- choisi, avec l'état réel courant (approuvée si déjà validée).
INSERT INTO public.submission_site_decisions
  (submission_id, site_id, site_label, status, source, decided_at, decided_by)
SELECT s.id, s.selected_site_id, s.selected_site_label,
       CASE WHEN s.site_validated_at IS NOT NULL THEN 'approuvee' ELSE 'en_attente' END,
       'selection', s.site_validated_at, s.site_validated_by
FROM public.submissions s
WHERE s.selected_site_id IS NOT NULL
ON CONFLICT (submission_id, site_id) DO NOTHING;