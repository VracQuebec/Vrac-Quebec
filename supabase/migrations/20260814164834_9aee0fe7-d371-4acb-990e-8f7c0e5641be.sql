
CREATE OR REPLACE FUNCTION pg_temp.fix_anchors(t text) RETURNS text LANGUAGE plpgsql AS $f$
DECLARE out text := ''; rest text := t; depth int := 0; ia int; ic int;
BEGIN
  LOOP
    ia := position('<a ' in rest);
    ic := position('</a>' in rest);
    IF ia = 0 AND ic = 0 THEN out := out || rest; EXIT; END IF;
    IF ia > 0 AND (ic = 0 OR ia < ic) THEN
      out := out || substr(rest,1,ia+2); rest := substr(rest,ia+3); depth := depth + 1;
    ELSE
      IF depth > 0 THEN out := out || substr(rest,1,ic+3); depth := depth - 1;
      ELSE out := out || substr(rest,1,ic-1); END IF;
      rest := substr(rest,ic+4);
    END IF;
  END LOOP;
  RETURN out;
END $f$;

DO $$
DECLARE p RECORD; txt text; r RECORD;
BEGIN
  FOR p IN SELECT id, slug, content_html FROM public.seo_pages WHERE status='published' LOOP
    txt := p.content_html;
    FOR r IN
      WITH pub AS (SELECT slug FROM public.seo_pages WHERE status='published'),
      h AS (SELECT DISTINCT (regexp_matches(txt,'href="(/[^"#?]*)"','g'))[1] AS href)
      SELECT href FROM h WHERE href LIKE '/%' AND href <> '/'
        AND href !~ '^/(livraison|blog|materiaux|soumission|calculateur|remblai|depot-materiaux|types-de-camions|entrepreneur|admin|login|404)(/|$)'
        AND ltrim(href,'/') NOT IN (SELECT slug FROM pub)
    LOOP
      txt := regexp_replace(txt, '<a\s[^>]*href="'||regexp_replace(r.href,'([\.\+\*\?\(\)\[\]\{\}\^\$\|\\])','\\\1','g')||'"[^>]*>(.*?)</a>', '\1', 'g');
      txt := regexp_replace(txt, '<a\s[^>]*href="'||regexp_replace(r.href,'([\.\+\*\?\(\)\[\]\{\}\^\$\|\\])','\\\1','g')||'"[^>]*>', '', 'g');
    END LOOP;
    txt := pg_temp.fix_anchors(txt);
    IF txt IS DISTINCT FROM p.content_html THEN
      UPDATE public.seo_pages SET content_html = txt WHERE id = p.id;
    END IF;
  END LOOP;
END $$;
