-- Correction structurelle du blogue (aucune réécriture d'article, aucun slug modifié).
-- 1) Catégorie manquante -> déduite du slug, repli « Guides pratiques ».
UPDATE public.blog_posts p
SET category_id = c.id
FROM public.blog_categories c
WHERE p.category_id IS NULL
  AND c.slug = CASE
    WHEN p.slug ~ 'remblai' THEN 'remblai'
    WHEN p.slug ~ 'terre' THEN 'terre'
    WHEN p.slug ~ 'sable' THEN 'sable'
    WHEN p.slug ~ 'gravier' THEN 'gravier'
    WHEN p.slug ~ 'pierre|concass' THEN 'pierre'
    WHEN p.slug ~ 'excavation|dompe|depot|disposition' THEN 'excavation'
    WHEN p.slug ~ 'transport|camion|livraison|voyage' THEN 'transport-en-vrac'
    WHEN p.slug ~ 'calcul|tonnage|volume|metre|verge' THEN 'calculs'
    WHEN p.slug ~ 'reglement|permis|loi|norme' THEN 'reglementation'
    WHEN p.slug ~ 'entrepreneur' THEN 'entrepreneurs'
    WHEN p.slug ~ 'proprietaire|terrain-residentiel|maison' THEN 'proprietaires'
    ELSE 'guides'
  END;

-- 2) Canonique auto-référentielle manquante.
UPDATE public.blog_posts
SET canonical_url = 'https://vracquebec.ca/blog/' || slug
WHERE canonical_url IS NULL OR canonical_url = '';

-- 3) Maillage interne : villes et matériaux réellement nommés dans le titre/slug.
UPDATE public.blog_posts p
SET related_city_slugs = sub.slugs
FROM (
  SELECT p2.id, array_agg(DISTINCT c.slug) AS slugs
  FROM public.blog_posts p2
  JOIN public.seo_cities c
    ON c.active
   AND position(public.geo_normalize(c.name) IN public.geo_normalize(p2.title)) > 0
   AND length(c.name) > 4
  WHERE p2.status = 'published'
  GROUP BY p2.id
) sub
WHERE p.id = sub.id
  AND (p.related_city_slugs IS NULL OR array_length(p.related_city_slugs, 1) IS NULL);

UPDATE public.blog_posts p
SET related_material_slugs = sub.slugs
FROM (
  SELECT p2.id, array_agg(DISTINCT m.slug) AS slugs
  FROM public.blog_posts p2
  JOIN public.seo_materials m
    ON m.active
   AND position(public.geo_normalize(m.name) IN public.geo_normalize(p2.title)) > 0
  WHERE p2.status = 'published'
  GROUP BY p2.id
) sub
WHERE p.id = sub.id
  AND (p.related_material_slugs IS NULL OR array_length(p.related_material_slugs, 1) IS NULL);