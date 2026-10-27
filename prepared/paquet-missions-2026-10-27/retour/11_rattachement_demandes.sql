-- Retour du fichier 11 : retire déclencheurs et fonctions, restaure la règle de création d'origine.
-- CONSERVE les tables de demandes de vérification et leur journal (aucune perte d'historique).
-- Les auteurs/entreprises déjà rattachés restent tels quels (données métier, pas de schéma).
DROP TRIGGER IF EXISTS zz_submission_capture_author ON public.submissions;
DROP TRIGGER IF EXISTS zz_submission_author_journal ON public.submissions;
DROP FUNCTION IF EXISTS public.zz_submission_capture_author();
DROP FUNCTION IF EXISTS public.zz_submission_author_journal();
DROP FUNCTION IF EXISTS public.submission_ownership_status(uuid);
DROP FUNCTION IF EXISTS public.submission_ownership_request(uuid,uuid,text);
DROP FUNCTION IF EXISTS public.submission_ownership_decide(uuid,boolean,text,text,text);
ALTER POLICY "Anyone can submit a request" ON public.submissions WITH CHECK ((((auth.uid() IS NOT NULL) AND has_role(auth.uid(), 'admin'::app_role)) OR ((creation_origin = 'public_form'::text) AND (status = 'nouveau'::text) AND (priority = 'normal'::text) AND (assigned_entrepreneur IS NULL) AND (created_by IS NULL) AND (lead_source = ANY (ARRAY['vracquebec.ca'::text, 'google'::text, 'facebook'::text, 'referencement_naturel'::text, 'pages_locales'::text, 'campagne'::text])) AND (lead_category IS NOT NULL) AND (latitude IS NULL) AND (longitude IS NULL))));
