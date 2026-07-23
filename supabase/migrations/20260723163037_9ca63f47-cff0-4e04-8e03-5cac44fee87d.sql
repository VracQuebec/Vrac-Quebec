
CREATE OR REPLACE FUNCTION public.ai_cache_hit(_key TEXT, _credits NUMERIC)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.ai_cache
     SET hit_count = hit_count + 1,
         estimated_credits_saved = estimated_credits_saved + COALESCE(_credits, 0),
         last_used_at = now()
   WHERE cache_key = _key;
$$;
REVOKE ALL ON FUNCTION public.ai_cache_hit(TEXT, NUMERIC) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ai_cache_hit(TEXT, NUMERIC) TO service_role;
