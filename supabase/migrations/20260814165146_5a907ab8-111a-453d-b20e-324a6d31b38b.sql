UPDATE public.seo_pages
SET content_html = replace(content_html, 'href="/materiaux/terre"', 'href="/materiaux"')
WHERE status='published' AND content_html LIKE '%href="/materiaux/terre"%';