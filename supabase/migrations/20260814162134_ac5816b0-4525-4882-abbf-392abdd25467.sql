-- 1. Sauvegarde réversible des anciennes métadonnées SEO
CREATE TABLE IF NOT EXISTS public.seo_pages_meta_backup_20260814 AS
SELECT id, slug, meta_title, meta_description, now() AS backed_up_at FROM public.seo_pages;
GRANT ALL ON public.seo_pages_meta_backup_20260814 TO service_role;
ALTER TABLE public.seo_pages_meta_backup_20260814 ENABLE ROW LEVEL SECURITY;

-- 2. Réécriture des méta-descriptions à partir de l'introduction réelle de chaque page
UPDATE public.seo_pages p
SET meta_description = sub.new_desc,
    meta_title = sub.new_title
FROM (
  SELECT id,
    CASE
      WHEN length(src) <= 155 THEN src
      ELSE regexp_replace(left(src, 155), '\s+\S*$', '') || '…'
    END AS new_desc,
    CASE
      WHEN length(title) <= 46 THEN title || ' | Vrac Québec'
      WHEN length(title) <= 60 THEN title
      ELSE regexp_replace(left(title, 57), '\s+\S*$', '') || '…'
    END AS new_title
  FROM (
    SELECT id, title,
      btrim(regexp_replace(coalesce(nullif(btrim(intro), ''), title), '\s+', ' ', 'g')) AS src
    FROM public.seo_pages
  ) s
) sub
WHERE p.id = sub.id;