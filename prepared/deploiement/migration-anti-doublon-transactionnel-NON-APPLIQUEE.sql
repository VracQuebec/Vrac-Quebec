-- ============================================================================
-- PRÉPARÉE — NE PAS APPLIQUER SANS AUTORISATION (phase finale, 15 oct. 2026)
-- Anti-doublon transactionnel des demandes publiques (remblai / soumission).
--
-- Problème : guardPublicRequest (supabase/functions/_shared/public-guard.ts)
-- fait LIRE le doublon (étape 5) PUIS INSÉRER le journal (étape 6) en deux
-- requêtes séparées. Deux requêtes parfaitement simultanées — y compris sur
-- des instances serveur différentes — peuvent toutes deux lire avant que
-- l'autre n'écrive, et créer chacune une demande.
--
-- Pourquoi pas une contrainte d'unicité permanente :
--   - UNIQUE (scope, fingerprint) bloquerait les demandes LÉGITIMES répétées
--     des jours/mois plus tard (règle métier : fenêtre de 30 minutes seulement).
--   - Un index unique partiel sur la fenêtre est impossible : now() n'est pas
--     immutable, PostgreSQL l'interdit dans un prédicat d'index.
--
-- Solution transactionnelle : une fonction SECURITY DEFINER qui, DANS UNE
-- SEULE TRANSACTION :
--   1. prend un verrou consultatif de transaction (pg_advisory_xact_lock) sur
--      l'empreinte — verrou global à la base, donc efficace même si les deux
--      requêtes arrivent sur des instances Edge différentes ;
--   2. vérifie la fenêtre de déduplication de 30 minutes ;
--   3. insère la ligne de journal ;
--   4. retourne le verdict (doublon + contenu précédent).
-- La seconde requête simultanée attend la fin de la transaction de la
-- première, puis voit sa ligne et est déclarée doublon. Aucune écriture de
-- demande n'a lieu côté appelant entre-temps.
--
-- Données existantes : lecture seule du 15 oct. 2026 — 293 lignes
-- (scope parcours-reception), 2 répétitions à moins de 30 min. La fonction
-- n'impose AUCUNE contrainte sur les lignes existantes : la migration ne peut
-- pas échouer à cause d'elles. Aucune ligne n'est modifiée, fusionnée ou
-- supprimée.
--
-- Précondition de déploiement : appliquer CETTE migration AVANT de déployer
-- la version de public-guard.ts qui appelle le RPC (ordre imposé, voir
-- plan-deploiement-2026-10-15.md). Sans la fonction, le nouveau code
-- fonction renverrait une erreur RPC.
--
-- Retour arrière base : exécuter le bloc « RETOUR ARRIÈRE » en fin de fichier
-- (DROP FUNCTION). Le code fonction d'avant n'utilise pas ce RPC, il reste
-- donc fonctionnel ; il faut seulement redéployer l'ancienne version de la
-- fonction Edge si elle avait déjà été déployée.
-- ============================================================================

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
  -- Verrou consultatif de transaction : sérialise les requêtes identiques,
  -- quelle que soit l'instance serveur qui les reçoit. Libéré automatiquement
  -- à la fin de la transaction (COMMIT ou ROLLBACK).
  PERFORM pg_advisory_xact_lock(hashtextextended(p_scope || '|' || coalesce(p_fingerprint, ''), 0));

  -- Fenêtre de déduplication (30 min par défaut) : une demande identique
  -- envoyée plus tard reste créable — la règle métier est préservée.
  SELECT payload, created_at
    INTO v_prev
    FROM public.public_request_guard
   WHERE scope = p_scope
     AND fingerprint = p_fingerprint
     AND created_at >= now() - make_interval(mins => p_dedupe_minutes)
   ORDER BY created_at DESC
   LIMIT 1;

  -- Journalisation de la tentative (compteur de débit + mémoire), dans la
  -- même transaction que la lecture : plus aucune course possible.
  INSERT INTO public.public_request_guard (scope, identity, fingerprint, payload)
  VALUES (p_scope, p_identity, p_fingerprint, p_payload);

  RETURN jsonb_build_object(
    'duplicate',    v_prev IS NOT NULL,
    'previous',     coalesce(v_prev.payload, '{}'::jsonb),
    'previous_at',  v_prev.created_at
  );
END;
$$;

-- La fonction n'est appelée que par les fonctions Edge (clé service) :
-- jamais exposée aux rôles anon / authenticated.
REVOKE ALL ON FUNCTION public.guard_check_and_log(text, text, text, jsonb, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.guard_check_and_log(text, text, text, jsonb, integer) TO service_role;

-- ============================================================================
-- RETOUR ARRIÈRE (à exécuter manuellement si nécessaire) :
--   DROP FUNCTION IF EXISTS public.guard_check_and_log(text, text, text, jsonb, integer);
-- Puis redéployer la version antérieure de _shared/public-guard.ts.
-- Aucune donnée n'est touchée par ce retour arrière.
-- ============================================================================
