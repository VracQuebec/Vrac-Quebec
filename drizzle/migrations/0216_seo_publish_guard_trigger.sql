CREATE OR REPLACE FUNCTION public.seo_page_content_hash_of(_p public.seo_pages)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path TO 'public' AS $$
  SELECT md5(concat_ws('␟', coalesce(_p.title,''), coalesce(_p.meta_title,''), coalesce(_p.meta_description,''), coalesce(_p.h1,''),
                        coalesce(_p.intro,''), coalesce(_p.content_html,''), coalesce(_p.faq::text,''), coalesce(_p.slug,'')))
$$;

-- Garde ultime : aucune voie (fonction serveur, tableau de bord, ancien panneau) ne peut mettre une page
-- en ligne ou la rendre indexable sans disponibilité confirmée, ni la publier sans note >= 90 à jour.
CREATE OR REPLACE FUNCTION public.seo_pages_publish_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _av text; _q record; _going_live boolean; _going_indexable boolean;
BEGIN
  _going_live := NEW.status = 'published' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'published');
  _going_indexable := coalesce(NEW.noindex, false) = false AND NEW.status = 'published'
                      AND (TG_OP = 'INSERT' OR coalesce(OLD.noindex, false) = true OR OLD.status IS DISTINCT FROM 'published');
  IF NOT (_going_live OR _going_indexable) THEN RETURN NEW; END IF;
  IF NEW.noindex_volontaire AND coalesce(NEW.noindex, false) = false THEN
    RAISE EXCEPTION 'Noindex volontaire — il ne peut pas être retiré par une publication';
  END IF;
  _av := public.seo_slot_availability(NEW.city_slug, NEW.material_slug, NEW.service_slug);
  IF _av IS DISTINCT FROM 'confirmee' THEN
    RAISE EXCEPTION 'Disponibilité % — publication ou indexation refusée', coalesce(_av, 'inconnue');
  END IF;
  IF _going_live THEN
    SELECT q.score, q.content_hash, q.blockers INTO _q FROM seo_qa_reports q
     WHERE q.page_id = NEW.id ORDER BY q.checked_at DESC LIMIT 1;
    IF _q.score IS NULL THEN RAISE EXCEPTION 'Note de qualité absente — recalcul requis avant publication'; END IF;
    IF _q.content_hash IS DISTINCT FROM public.seo_page_content_hash_of(NEW) THEN
      RAISE EXCEPTION 'Note de qualité périmée — recalcul requis avant publication';
    END IF;
    IF _q.score < 90 THEN RAISE EXCEPTION 'Note de qualité %/100 inférieure à 90 — publication refusée', _q.score; END IF;
    IF coalesce(array_length(_q.blockers,1),0) > 0 THEN RAISE EXCEPTION 'Contrôle qualité bloquant — publication refusée'; END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS seo_pages_publish_guard ON public.seo_pages;
CREATE TRIGGER seo_pages_publish_guard BEFORE INSERT OR UPDATE OF status, noindex ON public.seo_pages
  FOR EACH ROW EXECUTE FUNCTION public.seo_pages_publish_guard();