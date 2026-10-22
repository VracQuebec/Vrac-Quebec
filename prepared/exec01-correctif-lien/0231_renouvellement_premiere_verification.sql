-- PRÉPARÉ, NON APPLIQUÉ. Correctif EXEC-01 : renouvellement du lien personnel
-- pour un particulier qui n'a jamais réussi sa première vérification.
--
-- Pourquoi : la branche kind='renew' de public.exec01_dispatch exige un contact
-- déjà vérifié. Un lien expiré (30 jours) avant le premier code ne peut donc
-- jamais être remplacé : le particulier est bloqué.
--
-- Effet : SEULE la condition de la branche 'renew' change. Restent inchangés :
--  - jeton exact + lien non révoqué + adresse du dossier inchangée (contrôlés avant);
--  - le nouveau lien part uniquement à l'adresse déjà enregistrée (exec01_dispatch_mail);
--  - aucune adresse fournie par le visiteur, aucune nouvelle demande créée.
-- Limites ajoutées : 60 s entre deux liens/codes, 5 liens par dossier par 24 h.
-- Garde : échoue sans rien modifier si la définition en ligne a changé.
-- Retour arrière : exécuter le même bloc en inversant v_old et v_new.
DO $$
DECLARE
 d text := pg_get_functiondef('public.exec01_dispatch'::regproc);
 v_old text := $o$  IF s.exec01_contact_verified_at IS NULL OR s.exec01_verified_contact_hash IS DISTINCT FROM l.contact_hash OR l.verified_at IS NULL OR l.failures>=5 OR l.code_requested_at>now()-interval '60 seconds' THEN RETURN jsonb_build_object('denied',true); END IF;$o$;
 v_new text := $n$  IF l.code_requested_at>now()-interval '60 seconds'
   OR EXISTS(SELECT 1 FROM public.submission_portal_links x WHERE x.submission_id=s.id AND x.created_at>now()-interval '60 seconds')
   OR (SELECT count(*) FROM public.submission_portal_links x WHERE x.submission_id=s.id AND x.created_at>now()-interval '24 hours')>=5
  THEN RETURN jsonb_build_object('denied',true); END IF;$n$;
BEGIN
 IF position(v_old IN d) = 0 THEN RAISE EXCEPTION 'exec01_dispatch: définition inattendue, correctif non appliqué'; END IF;
 EXECUTE replace(d, v_old, v_new);
END $$;
