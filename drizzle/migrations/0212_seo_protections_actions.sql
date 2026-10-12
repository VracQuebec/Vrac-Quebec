-- Additive uniquement : aucune suppression, aucune page modifiée hormis l'indicateur noindex volontaire de remblai-adstock.
ALTER TABLE public.seo_pages ADD COLUMN IF NOT EXISTS noindex_volontaire boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN public.seo_pages.noindex_volontaire IS 'Noindex décidé par un humain : jamais retiré par une publication automatique.';
ALTER TABLE public.seo_pages DISABLE TRIGGER trg_seo_pages_updated_at;
UPDATE public.seo_pages SET noindex_volontaire = true WHERE slug = 'remblai-adstock' AND status = 'published' AND noindex = true;
ALTER TABLE public.seo_pages ENABLE TRIGGER trg_seo_pages_updated_at;

CREATE TABLE IF NOT EXISTS public.seo_generation_locks (
  lock_key text PRIMARY KEY,
  holder text NOT NULL,
  acquired_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);
GRANT ALL ON public.seo_generation_locks TO service_role;
ALTER TABLE public.seo_generation_locks ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.seo_lock_acquire(_key text, _holder text, _ttl_seconds int DEFAULT 600)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _ok boolean;
BEGIN
  INSERT INTO seo_generation_locks(lock_key, holder, expires_at)
  VALUES (_key, _holder, now() + make_interval(secs => _ttl_seconds))
  ON CONFLICT (lock_key) DO UPDATE SET holder = EXCLUDED.holder, acquired_at = now(), expires_at = EXCLUDED.expires_at
    WHERE seo_generation_locks.expires_at < now() OR seo_generation_locks.holder = EXCLUDED.holder
  RETURNING true INTO _ok;
  RETURN coalesce(_ok, false);
END $$;

CREATE OR REPLACE FUNCTION public.seo_lock_release(_key text, _holder text)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path TO 'public' AS $$
  DELETE FROM seo_generation_locks WHERE lock_key = _key AND holder = _holder;
$$;
REVOKE ALL ON FUNCTION public.seo_lock_acquire(text,text,int), public.seo_lock_release(text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.seo_lock_acquire(text,text,int), public.seo_lock_release(text,text) TO service_role;

CREATE OR REPLACE FUNCTION public.seo_page_publish_validated(_page_id uuid, _expected_updated_at timestamptz, _remove_noindex boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _p seo_pages; _issues text[]; _n int;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN RAISE EXCEPTION 'Réservé aux administrateurs'; END IF;
  SELECT * INTO _p FROM seo_pages WHERE id = _page_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'issues', ARRAY['Page introuvable']); END IF;
  IF _p.status = 'published' THEN RETURN jsonb_build_object('ok', true, 'already', true); END IF;
  IF _p.updated_at IS DISTINCT FROM _expected_updated_at THEN
    RETURN jsonb_build_object('ok', false, 'issues', ARRAY['Brouillon modifié depuis la lecture — aucune publication']);
  END IF;
  IF _remove_noindex AND _p.noindex_volontaire THEN
    RETURN jsonb_build_object('ok', false, 'issues', ARRAY['Noindex volontaire — décision distincte requise']);
  END IF;
  _issues := public.seo_validate_page_fields(_p.meta_title, _p.meta_description, _p.h1, _p.content_html,
              _p.slug, _p.city_slug, (SELECT count(*) FROM seo_pages d WHERE d.slug = _p.slug) > 1);
  IF coalesce(array_length(_issues,1),0) > 0 THEN RETURN jsonb_build_object('ok', false, 'issues', _issues); END IF;
  UPDATE seo_pages SET status = 'published', published_at = coalesce(published_at, now()), updated_at = now(),
         noindex = CASE WHEN _remove_noindex THEN false ELSE noindex END
   WHERE id = _page_id AND status <> 'published';
  GET DIAGNOSTICS _n = ROW_COUNT;
  RETURN jsonb_build_object('ok', _n = 1);
END $$;
REVOKE ALL ON FUNCTION public.seo_page_publish_validated(uuid,timestamptz,boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.seo_page_publish_validated(uuid,timestamptz,boolean) TO authenticated;