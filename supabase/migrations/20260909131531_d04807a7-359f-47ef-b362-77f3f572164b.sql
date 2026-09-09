UPDATE public.seo_pages SET content_html = replace(content_html,
 'que ce soit pour une nouvelle fondation rue des Lilas ou un aménagement paysager boulevard des Grandes-Fourches',
 'que ce soit pour une nouvelle fondation ou un aménagement paysager'), updated_at = now()
WHERE slug = 'courtage-materiaux-limoilou';

UPDATE public.seo_pages SET content_html = replace(replace(content_html,
 'située sur une rue étroite comme la rue Saint-Pierre ou nécessite', 'située sur une rue étroite ou nécessite'),
 'le passage d''un camion dompeur sur la rue des Rosiers ou près du parc fluvial', 'le passage d''un camion dompeur devant chez vous'), updated_at = now()
WHERE slug = 'poussiere-de-pierre-portneuf';

UPDATE public.seo_pages SET content_html = replace(content_html,
 'dans des secteurs comme la route Lagueux ou la route du Domaine peut parfois être restreint',
 'dans les secteurs ruraux et les rangs peut parfois être restreint'), updated_at = now()
WHERE slug = 'sable-saint-apollinaire';

UPDATE public.seo_pages p SET word_count = array_length(regexp_split_to_array(trim(regexp_replace(regexp_replace(coalesce(content_html,''),'<[^>]+>',' ','g'),'\s+',' ','g')),' '),1)
WHERE p.id IN (SELECT id FROM public.seo_wave2_before_20260909);