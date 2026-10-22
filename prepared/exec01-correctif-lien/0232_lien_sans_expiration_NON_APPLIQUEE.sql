-- PRÉPARÉE UNIQUEMENT — NON APPLIQUÉE. Autorisation explicite requise.
-- Objet : le lien personnel n'expire plus après 30 jours. Seule la date du
-- lien change; le code (10 min), le délai de 15 min, la révocation et le
-- renouvellement restent inchangés. Une demande fermée reste consultable
-- (lecture) mais les actions restent refusées (availability_status='owner_closed').
-- Prérequis : 0231 appliquée OU règle de production d'origine. Garde d'arrêt :
-- la règle doit contenir exactement deux occurrences de l'ancienne durée.
DO $$
DECLARE def text; n int;
BEGIN
 SELECT pg_get_functiondef('public.exec01_dispatch(jsonb)'::regprocedure) INTO def;
 n := (length(def) - length(replace(def, 'now()+interval ''30 days''', ''))) / length('now()+interval ''30 days''');
 IF n <> 2 THEN RAISE EXCEPTION '0232 arrêt : % occurrence(s) au lieu de 2, règle inattendue', n; END IF;
 EXECUTE replace(def, 'now()+interval ''30 days''', '''infinity''::timestamptz');
END $$;
-- Étape SÉPARÉE (modification de données, autorisation distincte) : prolonger
-- uniquement les liens actifs, jamais les liens révoqués ou déjà remplacés.
-- UPDATE public.submission_portal_links SET expires_at='infinity'
--  WHERE revoked_at IS NULL AND expires_at > now();
-- Retour arrière : réexécuter le même bloc en inversant les deux chaînes
-- ('infinity'::timestamptz -> now()+interval '30 days'), garde n = 2.
