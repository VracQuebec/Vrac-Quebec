-- PRÉPARÉ, NON APPLIQUÉ. CORRECTIF ciblé public.exec01_dispatch(jsonb).
-- Trois blocs seulement : attente des codes, condition de renouvellement, compteur d'erreurs.
-- Aucun changement de table, permission, quota IP, projection ou action sensible.
-- code_expires_at est la date du code tant qu'il existe; après cinq erreurs,
-- code_hash est effacé et code_expires_at devient la fin du délai de 15 minutes.
-- Les anciens blocages sans date restent refusés (intervention ciblée à autoriser).
DO $patch$
DECLARE
 d text := pg_get_functiondef('public.exec01_dispatch(jsonb)'::regprocedure);
BEGIN
 IF md5(d)<>'2da0b80649cfacf5db57fe559adab3c2' THEN RAISE EXCEPTION 'BLOQUÉ : empreinte/signature inattendue'; END IF;
 IF (length(d)-length(replace(d,$old0$ IF kind='renew' THEN$old0$,'')))/length($old0$ IF kind='renew' THEN$old0$)<>1 THEN RAISE EXCEPTION 'BLOQUÉ : texte inattendu (0)'; END IF;
 d:=replace(d,$old0$ IF kind='renew' THEN$old0$,$new0$ -- After five incorrect codes, the consumed code becomes a 15-minute lock deadline.
 -- Only code/verify/renew are gated; verified contacts retain read access.
 IF kind IN ('code','verify','renew') AND l.failures>=5 THEN
  IF l.code_expires_at IS NULL OR l.code_expires_at>now() THEN RETURN jsonb_build_object('denied',true); END IF;
  UPDATE public.submission_portal_links SET failures=0,code_hash=NULL,code_expires_at=NULL WHERE id=l.id;
  l.failures:=0; l.code_hash:=NULL; l.code_expires_at:=NULL;
 END IF;
 IF kind='renew' THEN$new0$);
 IF (length(d)-length(replace(d,$old1$  IF s.exec01_contact_verified_at IS NULL OR s.exec01_verified_contact_hash IS DISTINCT FROM l.contact_hash OR l.verified_at IS NULL OR l.failures>=5 OR l.code_requested_at>now()-interval '60 seconds' THEN RETURN jsonb_build_object('denied',true); END IF;$old1$,'')))/length($old1$  IF s.exec01_contact_verified_at IS NULL OR s.exec01_verified_contact_hash IS DISTINCT FROM l.contact_hash OR l.verified_at IS NULL OR l.failures>=5 OR l.code_requested_at>now()-interval '60 seconds' THEN RETURN jsonb_build_object('denied',true); END IF;$old1$)<>1 THEN RAISE EXCEPTION 'BLOQUÉ : texte inattendu (1)'; END IF;
 d:=replace(d,$old1$  IF s.exec01_contact_verified_at IS NULL OR s.exec01_verified_contact_hash IS DISTINCT FROM l.contact_hash OR l.verified_at IS NULL OR l.failures>=5 OR l.code_requested_at>now()-interval '60 seconds' THEN RETURN jsonb_build_object('denied',true); END IF;$old1$,$new1$  IF l.code_requested_at>now()-interval '60 seconds'
   OR EXISTS(SELECT 1 FROM public.submission_portal_links x WHERE x.submission_id=s.id AND x.created_at>now()-interval '60 seconds')
   OR (SELECT count(*) FROM public.submission_portal_links x WHERE x.submission_id=s.id AND x.created_at>now()-interval '24 hours')>=5
  THEN RETURN jsonb_build_object('denied',true); END IF;$new1$);
 IF (length(d)-length(replace(d,$old2$   UPDATE public.submission_portal_links SET failures=failures+1 WHERE id=l.id;$old2$,'')))/length($old2$   UPDATE public.submission_portal_links SET failures=failures+1 WHERE id=l.id;$old2$)<>1 THEN RAISE EXCEPTION 'BLOQUÉ : texte inattendu (2)'; END IF;
 d:=replace(d,$old2$   UPDATE public.submission_portal_links SET failures=failures+1 WHERE id=l.id;$old2$,$new2$   UPDATE public.submission_portal_links SET failures=least(failures+1,5),
    code_hash=CASE WHEN failures>=4 THEN NULL ELSE code_hash END,
    code_expires_at=CASE WHEN failures>=4 THEN now()+interval '15 minutes' ELSE code_expires_at END,
    verified_at=NULL WHERE id=l.id;$new2$);
 IF md5(d)<>'447920fb7b5e8902f6cd2e9118c26ef5' THEN RAISE EXCEPTION 'BLOQUÉ : résultat inattendu'; END IF;
 EXECUTE d;
END $patch$;
