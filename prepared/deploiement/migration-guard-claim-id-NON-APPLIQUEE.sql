-- ============================================================
-- PROPOSITION — NON APPLIQUÉE. Prérequis : migration anti-doublon v2.
-- Anti-doublon durable : chaque demande porte l'identifiant EXACT de la
-- réservation (public_request_guard.id) qui l'a créée.
--  * Reprise d'une réservation périmée : recherche par cet identifiant
--    exact (jamais par courriel/adresse) → aucune ambiguïté.
--  * Index unique partiel : une réservation ne peut produire qu'UNE demande.
-- Additif seulement : colonnes nullables, aucune donnée historique modifiée
-- (les demandes existantes gardent guard_claim_id = NULL).
-- Durée : ALTER TABLE ADD COLUMN nullable sans défaut = métadonnées seulement ;
-- CREATE UNIQUE INDEX sur une colonne entièrement NULL est rapide mais prend
-- un verrou SHARE sur la table pendant la construction (quelques secondes).
-- ============================================================
ALTER TABLE public.submissions  ADD COLUMN IF NOT EXISTS guard_claim_id uuid;
ALTER TABLE public.jsc_requests ADD COLUMN IF NOT EXISTS guard_claim_id uuid;

CREATE UNIQUE INDEX IF NOT EXISTS submissions_guard_claim_id_uq
  ON public.submissions (guard_claim_id) WHERE guard_claim_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS jsc_requests_guard_claim_id_uq
  ON public.jsc_requests (guard_claim_id) WHERE guard_claim_id IS NOT NULL;

COMMENT ON COLUMN public.submissions.guard_claim_id  IS 'Réservation anti-doublon (public_request_guard.id) ayant créé la demande; NULL pour l''historique et les saisies internes.';
COMMENT ON COLUMN public.jsc_requests.guard_claim_id IS 'Réservation anti-doublon (public_request_guard.id) ayant créé la demande; NULL pour l''historique et les saisies internes.';

-- Aucun GRANT nouveau : la colonne hérite des droits de table existants.
-- Le questionnaire public (insertion anonyme dans submissions) n'écrit pas
-- cette colonne ; elle reste NULL.

-- ---------------- Retour arrière (à n'exécuter qu'après retour du code) ----------------
-- Le code préparé écrit guard_claim_id : revenir d'abord à l'ancien code,
-- PUIS seulement :
--   DROP INDEX IF EXISTS public.submissions_guard_claim_id_uq;
--   DROP INDEX IF EXISTS public.jsc_requests_guard_claim_id_uq;
--   COMMENT ON COLUMN public.submissions.guard_claim_id  IS 'DEPRECATED';
--   COMMENT ON COLUMN public.jsc_requests.guard_claim_id IS 'DEPRECATED';
-- (ne pas supprimer les colonnes : retrait non destructif)
