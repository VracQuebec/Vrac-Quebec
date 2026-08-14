UPDATE public.seo_pages
SET content_html = replace(content_html, 'href="/transport-request"', 'href="/soumission"')
WHERE content_html LIKE '%"/transport-request"%';