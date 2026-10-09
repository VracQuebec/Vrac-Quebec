-- PROPOSITION — NON APPLIQUÉE. Application et restauration d'une version de page SEO.
-- Ne modifie jamais slug, statut, noindex ni published_at : seul le contenu change.
-- Chaque opération enregistre d'abord l'état courant (restauration toujours possible).

CREATE OR REPLACE FUNCTION public.seo_page_apply_improvement(_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE imp record; pg record; a jsonb;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Réservé aux administrateurs'; END IF;
  SELECT * INTO imp FROM seo_page_improvements WHERE id = _id FOR UPDATE;
  IF NOT FOUND OR imp.applied THEN RAISE EXCEPTION 'Proposition introuvable ou déjà appliquée'; END IF;
  SELECT * INTO pg FROM seo_pages WHERE id = imp.page_id FOR UPDATE;
  IF pg.updated_at::text IS DISTINCT FROM (imp.before_snapshot->>'updated_at') THEN
    RAISE EXCEPTION 'Page modifiée depuis la proposition — application refusée';
  END IF;
  INSERT INTO seo_page_improvements(page_id, before_snapshot, after_snapshot, applied, applied_at, notes, created_by)
  VALUES (pg.id, to_jsonb(pg), imp.after_snapshot, true, now(), 'application:sauvegarde', auth.uid());
  a := imp.after_snapshot;
  UPDATE seo_pages SET
    title = a->>'title', h1 = a->>'h1', meta_title = a->>'meta_title', meta_description = a->>'meta_description',
    cover_image_alt = a->>'cover_image_alt', intro = a->>'intro', content_html = a->>'content_html',
    faq = a->'faq', internal_links = a->'internal_links',
    word_count = (a->>'word_count')::int, internal_link_count = (a->>'internal_link_count')::int
  WHERE id = pg.id;
  UPDATE seo_page_improvements SET applied = true, applied_at = now() WHERE id = _id;
  RETURN jsonb_build_object('applied', true, 'page_id', pg.id);
END $$;

CREATE OR REPLACE FUNCTION public.seo_page_restore_improvement(_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE imp record; pg record; b jsonb;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Réservé aux administrateurs'; END IF;
  SELECT * INTO imp FROM seo_page_improvements WHERE id = _id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Sauvegarde introuvable'; END IF;
  SELECT * INTO pg FROM seo_pages WHERE id = imp.page_id FOR UPDATE;
  IF pg.content_html IS DISTINCT FROM (imp.after_snapshot->>'content_html') THEN
    RAISE EXCEPTION 'Page modifiée depuis cette version — restauration refusée';
  END IF;
  INSERT INTO seo_page_improvements(page_id, before_snapshot, after_snapshot, applied, applied_at, notes, created_by)
  VALUES (pg.id, to_jsonb(pg), imp.before_snapshot, true, now(), 'restauration:sauvegarde', auth.uid());
  b := imp.before_snapshot;
  UPDATE seo_pages SET
    title = b->>'title', h1 = b->>'h1', meta_title = b->>'meta_title', meta_description = b->>'meta_description',
    cover_image_alt = b->>'cover_image_alt', intro = b->>'intro', content_html = b->>'content_html',
    faq = b->'faq', internal_links = b->'internal_links',
    word_count = (b->>'word_count')::int, internal_link_count = (b->>'internal_link_count')::int
  WHERE id = pg.id;
  RETURN jsonb_build_object('restored', true, 'page_id', pg.id);
END $$;

REVOKE ALL ON FUNCTION public.seo_page_apply_improvement(uuid), public.seo_page_restore_improvement(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.seo_page_apply_improvement(uuid), public.seo_page_restore_improvement(uuid) TO authenticated;
