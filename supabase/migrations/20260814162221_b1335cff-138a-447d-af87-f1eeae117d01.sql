-- Affiner les méta-descriptions : privilégier des phrases complètes
UPDATE public.seo_pages p
SET meta_description = sub.d
FROM (
  SELECT id,
    CASE
      -- coupe à la dernière phrase complète contenue dans les 158 premiers caractères
      WHEN length(src) > 155 AND position('.' in left(src, 158)) > 80
        THEN left(src, length(regexp_replace(left(src, 158), '[^.!?]*$', '')))
      WHEN length(src) <= 155 THEN src
      ELSE regexp_replace(left(src, 155), '\s+\S*$', '') || '…'
    END AS d
  FROM (
    SELECT id, btrim(regexp_replace(coalesce(nullif(btrim(intro), ''), title), '\s+', ' ', 'g')) AS src
    FROM public.seo_pages
  ) s
) sub
WHERE p.id = sub.id;