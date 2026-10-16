-- ============================================================================
-- PRÉPARÉE — NE PAS APPLIQUER SANS AUTORISATION (version 2, 16 oct. 2026)
-- Anti-doublon transactionnel des demandes publiques.
--
-- Version 2 — corrige le défaut relevé par l'audit du 15 oct. 2026 :
--   la v1 (guard_check_and_log seule) enregistrait l'empreinte AVANT la
--   validation d'adresse et la création de la demande. Un échec ultérieur
--   faisait passer la nouvelle tentative pour un doublon (perte de demande).
--
-- Cycle de vie en 3 temps (table existante public_request_guard, aucune
-- colonne ajoutée : l'état vit dans payload->>'state') :
--   1. guard_claim     : verrou consultatif + fenêtre 30 min ; réserve
--                        l'empreinte à l'état « pending » et renvoie l'id
--                        EXACT de la réservation.
--   2a. guard_complete : appelé UNIQUEMENT après création confirmée de la
--                        demande ; passe CETTE réservation (par id) à « done »
--                        avec la référence réelle (submission_id).
--   2b. guard_release  : appelé si la création échoue ; passe CETTE
--                        réservation (par id) à « failed ». Jamais de DELETE :
--                        aucune ligne d'une requête concurrente n'est touchée,
--                        et la tentative continue de compter pour le débit.
-- Seule une ligne « done » vaut doublon. Une ligne « pending » récente
-- (< p_pending_seconds) signale une création en cours (réponse « réessayez »),
-- jamais un succès. Une ligne « failed » n'empêche aucune nouvelle tentative.
--
-- Lignes historiques (payload sans 'state', 486 au 16 oct. 2026) : ignorées
-- par la nouvelle logique. Conséquence assumée : pendant les 30 minutes qui
-- suivent le déploiement, une répétition d'une demande envoyée juste avant
-- n'est pas reconnue (même comportement qu'avant correction). Aucune ligne
-- existante n'est modifiée ni supprimée.
--
-- Pourquoi pas une contrainte d'unicité : la fenêtre de 30 min n'est pas
-- représentable (now() non immuable dans un index partiel) et UNIQUE
-- (scope, fingerprint) bloquerait les demandes légitimes ultérieures.
--
-- Idempotente : CREATE OR REPLACE + REVOKE/GRANT ; ré-exécutable sans effet.
-- Retour arrière : bloc en fin de fichier (DROP FUNCTION uniquement, aucune
-- donnée touchée). Redéployer AU PRÉALABLE l'ancienne version des fonctions
-- Edge qui appellent ces RPC (sinon : mode de secours journalisé).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Validation commune des paramètres (échec explicite, AVANT toute écriture).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.guard_validate_params(
  p_scope text, p_identity text, p_fingerprint text, p_dedupe_minutes integer
) RETURNS void
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
BEGIN
  IF p_scope IS NULL OR btrim(p_scope) = '' THEN
    RAISE EXCEPTION 'guard: portée (scope) vide' USING ERRCODE = '22023';
  END IF;
  IF p_identity IS NULL OR btrim(p_identity) = '' THEN
    RAISE EXCEPTION 'guard: identité vide' USING ERRCODE = '22023';
  END IF;
  IF p_fingerprint IS NULL OR btrim(p_fingerprint) = '' THEN
    RAISE EXCEPTION 'guard: empreinte vide' USING ERRCODE = '22023';
  END IF;
  IF p_dedupe_minutes IS NULL OR p_dedupe_minutes < 1 OR p_dedupe_minutes > 1440 THEN
    RAISE EXCEPTION 'guard: durée de déduplication hors plage (1 à 1440 minutes)' USING ERRCODE = '22023';
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- v1 conservée (utilisée par quote-submit, mkt-request-submit… via
-- guardPublicRequest), désormais avec validation des paramètres.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.guard_check_and_log(
  p_scope          text,
  p_identity       text,
  p_fingerprint    text,
  p_payload        jsonb DEFAULT '{}'::jsonb,
  p_dedupe_minutes integer DEFAULT 30
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_prev record;
BEGIN
  PERFORM public.guard_validate_params(p_scope, p_identity, p_fingerprint, p_dedupe_minutes);
  PERFORM pg_advisory_xact_lock(hashtextextended(p_scope || '|' || p_fingerprint, 0));

  SELECT payload, created_at INTO v_prev
    FROM public.public_request_guard
   WHERE scope = p_scope
     AND fingerprint = p_fingerprint
     AND created_at >= now() - make_interval(mins => p_dedupe_minutes)
     AND coalesce(payload->>'state', 'legacy') <> 'failed'
   ORDER BY created_at DESC
   LIMIT 1;

  INSERT INTO public.public_request_guard (scope, identity, fingerprint, payload)
  VALUES (p_scope, p_identity, p_fingerprint, coalesce(p_payload, '{}'::jsonb));

  RETURN jsonb_build_object(
    'duplicate',   v_prev IS NOT NULL,
    'previous',    coalesce(v_prev.payload, '{}'::jsonb),
    'previous_at', v_prev.created_at
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- 1. Réservation.
-- Retour : { state: 'new' | 'duplicate' | 'in_progress',
--            claim_id, result, previous_at,
--            stale_claim_id, stale_at }   (stale_* : réservation « pending »
--            plus ancienne que p_pending_seconds, dont l'issue est inconnue —
--            l'appelant vérifie alors la table métier avant de créer.)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.guard_claim(
  p_scope           text,
  p_identity        text,
  p_fingerprint     text,
  p_payload         jsonb   DEFAULT '{}'::jsonb,
  p_dedupe_minutes  integer DEFAULT 30,
  p_pending_seconds integer DEFAULT 120
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_done    record;
  v_pending record;
  v_stale   record;
  v_id      uuid;
BEGIN
  PERFORM public.guard_validate_params(p_scope, p_identity, p_fingerprint, p_dedupe_minutes);
  IF p_pending_seconds IS NULL OR p_pending_seconds < 10 OR p_pending_seconds > 3600 THEN
    RAISE EXCEPTION 'guard: délai de réservation hors plage (10 à 3600 s)' USING ERRCODE = '22023';
  END IF;
  IF p_payload IS NOT NULL AND jsonb_typeof(p_payload) <> 'object' THEN
    RAISE EXCEPTION 'guard: payload doit être un objet JSON' USING ERRCODE = '22023';
  END IF;

  -- Sérialise les requêtes de même empreinte, toutes instances confondues.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_scope || '|' || p_fingerprint, 0));

  SELECT id, payload, created_at INTO v_done
    FROM public.public_request_guard
   WHERE scope = p_scope AND fingerprint = p_fingerprint
     AND created_at >= now() - make_interval(mins => p_dedupe_minutes)
     AND payload->>'state' = 'done'
   ORDER BY created_at DESC LIMIT 1;
  IF FOUND THEN
    RETURN jsonb_build_object('state', 'duplicate', 'claim_id', v_done.id,
      'result', coalesce(v_done.payload->'result', '{}'::jsonb), 'previous_at', v_done.created_at);
  END IF;

  SELECT id, created_at INTO v_pending
    FROM public.public_request_guard
   WHERE scope = p_scope AND fingerprint = p_fingerprint
     AND created_at >= now() - make_interval(secs => p_pending_seconds)
     AND payload->>'state' = 'pending'
   ORDER BY created_at DESC LIMIT 1;
  IF FOUND THEN
    RETURN jsonb_build_object('state', 'in_progress', 'claim_id', v_pending.id, 'previous_at', v_pending.created_at);
  END IF;

  SELECT id, created_at INTO v_stale
    FROM public.public_request_guard
   WHERE scope = p_scope AND fingerprint = p_fingerprint
     AND created_at >= now() - make_interval(mins => p_dedupe_minutes)
     AND payload->>'state' = 'pending'
   ORDER BY created_at DESC LIMIT 1;

  INSERT INTO public.public_request_guard (scope, identity, fingerprint, payload)
  VALUES (p_scope, p_identity, p_fingerprint,
          coalesce(p_payload, '{}'::jsonb) || jsonb_build_object('state', 'pending'))
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('state', 'new', 'claim_id', v_id,
    'stale_claim_id', v_stale.id, 'stale_at', v_stale.created_at);
END;
$$;

-- ---------------------------------------------------------------------------
-- 2a. Confirmation — uniquement après création réelle de la demande.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.guard_complete(p_claim_id uuid, p_result jsonb)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_n integer;
BEGIN
  IF p_claim_id IS NULL THEN
    RAISE EXCEPTION 'guard: réservation absente' USING ERRCODE = '22023';
  END IF;
  IF p_result IS NULL OR jsonb_typeof(p_result) <> 'object'
     OR coalesce(btrim(p_result->>'submission_id'), '') = '' THEN
    RAISE EXCEPTION 'guard: résultat sans référence de demande' USING ERRCODE = '22023';
  END IF;
  -- « failed » accepté : une création réussie mais lente après un abandon
  -- (rare) doit tout de même être mémorisée sous SA réservation.
  UPDATE public.public_request_guard
     SET payload = payload || jsonb_build_object('state', 'done', 'result', p_result)
   WHERE id = p_claim_id AND payload->>'state' IN ('pending', 'failed');
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n = 0 THEN
    RAISE EXCEPTION 'guard: réservation introuvable ou déjà confirmée' USING ERRCODE = 'P0002';
  END IF;
  RETURN true;
END;
$$;

-- ---------------------------------------------------------------------------
-- 2b. Abandon — la création a échoué ; nouvelle tentative permise.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.guard_release(p_claim_id uuid, p_reason text DEFAULT NULL)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_n integer;
BEGIN
  IF p_claim_id IS NULL THEN
    RAISE EXCEPTION 'guard: réservation absente' USING ERRCODE = '22023';
  END IF;
  UPDATE public.public_request_guard
     SET payload = payload || jsonb_build_object('state', 'failed', 'reason', left(coalesce(p_reason, 'inconnue'), 80))
   WHERE id = p_claim_id AND payload->>'state' = 'pending';
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n > 0;
END;
$$;

-- Exécution réservée au rôle serveur (fonctions Edge, clé service).
REVOKE ALL ON FUNCTION public.guard_validate_params(text, text, text, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.guard_check_and_log(text, text, text, jsonb, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.guard_claim(text, text, text, jsonb, integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.guard_complete(uuid, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.guard_release(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.guard_validate_params(text, text, text, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.guard_check_and_log(text, text, text, jsonb, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.guard_claim(text, text, text, jsonb, integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.guard_complete(uuid, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.guard_release(uuid, text) TO service_role;

-- ============================================================================
-- RETOUR ARRIÈRE (manuel, après redéploiement de l'ancien code Edge) :
--   DROP FUNCTION IF EXISTS public.guard_release(uuid, text);
--   DROP FUNCTION IF EXISTS public.guard_complete(uuid, jsonb);
--   DROP FUNCTION IF EXISTS public.guard_claim(text, text, text, jsonb, integer, integer);
--   DROP FUNCTION IF EXISTS public.guard_check_and_log(text, text, text, jsonb, integer);
--   DROP FUNCTION IF EXISTS public.guard_validate_params(text, text, text, integer);
-- Les lignes écrites entre-temps (payload.state = pending/done/failed)
-- restent dans public_request_guard : elles sont inoffensives pour l'ancien
-- code (qui ne lit que scope/fingerprint/created_at) et ne sont pas effacées.
-- ============================================================================
