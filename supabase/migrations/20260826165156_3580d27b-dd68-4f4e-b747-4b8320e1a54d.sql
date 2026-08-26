REVOKE ALL ON FUNCTION public.seo_control_center() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.seo_control_center() TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.seo_pipeline_detect_stalls(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.seo_pipeline_detect_stalls(integer) TO service_role;