
CREATE TABLE IF NOT EXISTS public.seo_pages_links_backup_20260814 AS
SELECT id, slug, content_html, internal_links FROM public.seo_pages WHERE status='published';
REVOKE ALL ON public.seo_pages_links_backup_20260814 FROM anon, authenticated;
GRANT ALL ON public.seo_pages_links_backup_20260814 TO service_role;

CREATE TEMP TABLE _broken AS
WITH pub AS (SELECT slug FROM public.seo_pages WHERE status='published'),
h AS (SELECT DISTINCT (regexp_matches(p.content_html,'href="(/[^"#?]*)"','g'))[1] AS href
      FROM public.seo_pages p WHERE p.status='published'
      UNION
      SELECT DISTINCT (jsonb_array_elements(coalesce(p.internal_links,'[]'::jsonb)))->>'href'
      FROM public.seo_pages p WHERE p.status='published'),
b AS (SELECT href FROM h WHERE href LIKE '/%' AND href <> '/'
      AND href !~ '^/(livraison|blog|materiaux|soumission|calculateur|remblai|depot-materiaux|types-de-camions|entrepreneur|admin|login|404)(/|$)'
      AND ltrim(href,'/') NOT IN (SELECT slug FROM pub))
SELECT b.href,
       (SELECT '/livraison/'||c.slug FROM public.seo_cities c
         WHERE c.active AND ltrim(b.href,'/') LIKE '%-'||c.slug
         ORDER BY length(c.slug) DESC LIMIT 1) AS replacement
FROM b;

DO $$
DECLARE r RECORD; p RECORD; txt text; links jsonb;
BEGIN
  FOR p IN SELECT id, content_html, internal_links FROM public.seo_pages WHERE status='published' LOOP
    txt := p.content_html;
    links := coalesce(p.internal_links,'[]'::jsonb);
    FOR r IN SELECT * FROM _broken LOOP
      IF position('"'||r.href||'"' in txt) > 0 OR links::text LIKE '%"'||r.href||'"%' THEN
        IF r.replacement IS NOT NULL THEN
          txt := replace(txt, 'href="'||r.href||'"', 'href="'||r.replacement||'"');
          links := (SELECT coalesce(jsonb_agg(CASE WHEN e->>'href' = r.href THEN jsonb_set(e,'{href}', to_jsonb(r.replacement)) ELSE e END),'[]'::jsonb)
                    FROM jsonb_array_elements(links) e);
        ELSE
          txt := regexp_replace(txt, '<a\s[^>]*href="'||regexp_replace(r.href,'([\.\+\*\?\(\)\[\]\{\}\^\$\|\\])','\\\1','g')||'"[^>]*>(.*?)</a>', '\1', 'g');
          links := (SELECT coalesce(jsonb_agg(e),'[]'::jsonb) FROM jsonb_array_elements(links) e WHERE e->>'href' IS DISTINCT FROM r.href);
        END IF;
      END IF;
    END LOOP;
    -- dédoublonne les liens internes devenus identiques
    IF txt IS DISTINCT FROM p.content_html OR links IS DISTINCT FROM coalesce(p.internal_links,'[]'::jsonb) THEN
      UPDATE public.seo_pages SET content_html = txt, internal_links = links WHERE id = p.id;
    END IF;
  END LOOP;
END $$;
