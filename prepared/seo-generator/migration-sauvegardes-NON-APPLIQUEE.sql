-- PROPOSITION — NON APPLIQUÉE. Sauvegardes de pages SEO conservées même si la page est supprimée.
-- Aucune clé étrangère vers seo_pages : la suppression d'une page n'efface jamais ses sauvegardes.

CREATE TABLE public.seo_page_backups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id uuid NOT NULL,              -- identifiant d'origine, sans lien de suppression
  page_slug text NOT NULL,
  reason text NOT NULL,               -- 'avant-regeneration' | 'avant-application' | 'avant-restauration' | 'avant-suppression'
  snapshot jsonb NOT NULL,            -- ligne seo_pages complète
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  is_pinned boolean NOT NULL DEFAULT false   -- true = conservée indéfiniment (avant suppression)
);
CREATE INDEX seo_page_backups_slug_idx ON public.seo_page_backups (page_slug, created_at DESC);

GRANT SELECT ON public.seo_page_backups TO authenticated;
GRANT ALL ON public.seo_page_backups TO service_role;
ALTER TABLE public.seo_page_backups ENABLE ROW LEVEL SECURITY;
-- Lecture : administrateurs seulement. Aucune écriture directe (ni modification ni suppression)
-- depuis l'application : seules les fonctions serveur et le déclencheur écrivent.
CREATE POLICY "Admins read SEO backups" ON public.seo_page_backups
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Sauvegarde automatique avant toute suppression d'une page.
CREATE OR REPLACE FUNCTION public.seo_pages_backup_before_delete()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO seo_page_backups(page_id, page_slug, reason, snapshot, created_by, is_pinned)
  VALUES (OLD.id, OLD.slug, 'avant-suppression', to_jsonb(OLD), auth.uid(), true);
  -- is_pinned forcé ci-dessous; si l'INSERT échoue, l'exception annule la suppression.
  RETURN OLD;
END $$;
CREATE TRIGGER trg_seo_pages_backup_before_delete
  BEFORE DELETE ON public.seo_pages FOR EACH ROW EXECUTE FUNCTION public.seo_pages_backup_before_delete();

-- Restauration d'une page supprimée : recrée la ligne à l'identique, en BROUILLON non indexé
-- (jamais remise en ligne automatiquement), et refuse si l'adresse est déjà occupée.
CREATE OR REPLACE FUNCTION public.seo_page_restore_deleted(_backup_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE b record; r seo_pages;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Réservé aux administrateurs'; END IF;
  SELECT * INTO b FROM seo_page_backups WHERE id = _backup_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Sauvegarde introuvable'; END IF;
  IF EXISTS (SELECT 1 FROM seo_pages WHERE id = b.page_id OR slug = b.page_slug) THEN
    RAISE EXCEPTION 'Une page existe déjà à cette adresse — restauration refusée';
  END IF;
  r := jsonb_populate_record(NULL::seo_pages, b.snapshot);
  r.status := 'draft'; r.noindex := true; r.published_at := NULL;
  INSERT INTO seo_pages SELECT r.*;
  RETURN jsonb_build_object('restored', true, 'slug', b.page_slug, 'status', 'draft');
END $$;
REVOKE ALL ON FUNCTION public.seo_page_restore_deleted(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.seo_page_restore_deleted(uuid) TO authenticated;

-- Politique : aucune suppression automatique. Interdire toute suppression/modification,
-- même par le rôle serveur, sauf intervention manuelle approuvée.
CREATE OR REPLACE FUNCTION public.seo_page_backups_immutable()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Les sauvegardes SEO ne peuvent être ni modifiées ni supprimées'; END $$;
CREATE TRIGGER trg_seo_page_backups_immutable
  BEFORE UPDATE OR DELETE ON public.seo_page_backups FOR EACH ROW EXECUTE FUNCTION public.seo_page_backups_immutable();

-- Restauration d'une page EXISTANTE : refusée si la page a été modifiée après la sauvegarde
-- attendue (_expected_updated_at = date de modification affichée à l'administrateur).
-- Sauvegarde de l'état courant avant restauration; statut et indexation conservés.
CREATE OR REPLACE FUNCTION public.seo_page_restore_backup(_backup_id uuid, _expected_updated_at timestamptz)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE b record; pg seo_pages; s jsonb;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Réservé aux administrateurs'; END IF;
  SELECT * INTO b FROM seo_page_backups WHERE id = _backup_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Sauvegarde introuvable'; END IF;
  SELECT * INTO pg FROM seo_pages WHERE id = b.page_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Page supprimée : utiliser seo_page_restore_deleted'; END IF;
  IF pg.updated_at IS DISTINCT FROM _expected_updated_at THEN
    RAISE EXCEPTION 'Page modifiée depuis la consultation — restauration refusée';
  END IF;
  INSERT INTO seo_page_backups(page_id, page_slug, reason, snapshot, created_by)
  VALUES (pg.id, pg.slug, 'avant-restauration', to_jsonb(pg), auth.uid());
  s := b.snapshot;
  UPDATE seo_pages SET
    title = s->>'title', h1 = s->>'h1', meta_title = s->>'meta_title', meta_description = s->>'meta_description',
    cover_image_alt = s->>'cover_image_alt', intro = s->>'intro', content_html = s->>'content_html',
    faq = s->'faq', internal_links = s->'internal_links',
    word_count = (s->>'word_count')::int, h2_count = (s->>'h2_count')::int, h3_count = (s->>'h3_count')::int,
    internal_link_count = (s->>'internal_link_count')::int
  WHERE id = pg.id;
  RETURN jsonb_build_object('restored', true, 'page_id', pg.id);
END $$;
REVOKE ALL ON FUNCTION public.seo_page_restore_backup(uuid, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.seo_page_restore_backup(uuid, timestamptz) TO authenticated;
