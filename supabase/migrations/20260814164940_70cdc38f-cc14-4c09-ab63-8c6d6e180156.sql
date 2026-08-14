
CREATE OR REPLACE FUNCTION pg_temp.fix_open_anchors(t text) RETURNS text LANGUAGE plpgsql AS $f$
DECLARE parts text[] := '{}'; stack int[] := '{}';
        rest text := t; ia int; ic int; tag text; res text := ''; i int;
BEGIN
  LOOP
    ia := position('<a ' in rest);
    ic := position('</a>' in rest);
    IF ia = 0 AND ic = 0 THEN
      parts := array_append(parts, rest); EXIT;
    END IF;
    IF ia > 0 AND (ic = 0 OR ia < ic) THEN
      parts := array_append(parts, substr(rest,1,ia-1));
      tag := substring(substr(rest,ia) from '^<a [^>]*>');
      IF tag IS NULL THEN
        parts := array_append(parts, substr(rest,ia,3));
        rest := substr(rest,ia+3); CONTINUE;
      END IF;
      parts := array_append(parts, tag);
      stack := array_append(stack, array_length(parts,1));
      rest := substr(rest, ia + length(tag));
    ELSE
      parts := array_append(parts, substr(rest,1,ic-1));
      parts := array_append(parts, '</a>');
      IF array_length(stack,1) IS NOT NULL THEN stack := stack[1:array_length(stack,1)-1]; END IF;
      rest := substr(rest, ic+4);
    END IF;
  END LOOP;
  FOR i IN 1..coalesce(array_length(stack,1),0) LOOP parts[stack[i]] := ''; END LOOP;
  FOR i IN 1..array_length(parts,1) LOOP res := res || parts[i]; END LOOP;
  RETURN res;
END $f$;

DO $$
DECLARE p RECORD; txt text;
BEGIN
  FOR p IN SELECT id, content_html FROM public.seo_pages WHERE status='published'
    AND (length(content_html)-length(replace(content_html,'<a ','')))/3
      <> (length(content_html)-length(replace(content_html,'</a>','')))/4
  LOOP
    txt := pg_temp.fix_open_anchors(p.content_html);
    IF txt IS DISTINCT FROM p.content_html THEN
      UPDATE public.seo_pages SET content_html = txt WHERE id = p.id;
    END IF;
  END LOOP;
END $$;
