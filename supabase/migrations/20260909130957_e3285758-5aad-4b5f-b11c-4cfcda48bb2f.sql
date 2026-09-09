CREATE TABLE IF NOT EXISTS public.seo_wave2_before_20260909 AS
SELECT p.id, p.slug, p.title, p.meta_title, p.meta_description, p.h1, p.intro,
       p.content_html, p.faq, p.keywords, p.internal_links, p.word_count,
       p.seo_score, p.status, p.updated_at, now() AS captured_at
FROM public.seo_pages p
WHERE p.slug IN (
 'transport-vrac-montcalm','mg-20-beaupre','sable-lac-beauport','livraison-pierre-saint-raymond','mg-56-beaupre',
 'transport-vrac-sainte-catherine-de-la-jacques-cartier','courtage-materiaux-limoilou','livraison-sable-sainte-brigitte-de-laval',
 'sable-saint-apollinaire','poussiere-de-pierre-portneuf','saint-jean-chrysostome','livraison-sable-saint-sauveur'
);
ALTER TABLE public.seo_wave2_before_20260909 ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.seo_wave2_before_20260909 TO service_role;
GRANT SELECT ON public.seo_wave2_before_20260909 TO authenticated;
DROP POLICY IF EXISTS "admins read seo_wave2_before" ON public.seo_wave2_before_20260909;
CREATE POLICY "admins read seo_wave2_before" ON public.seo_wave2_before_20260909
FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));