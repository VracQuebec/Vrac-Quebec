
-- Fix 1: is_approved_entrepreneur must require approved = true
CREATE OR REPLACE FUNCTION public.is_approved_entrepreneur(_uid uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _uid
      AND role = 'entrepreneur'
      AND approved = true
  )
$function$;

-- Fix 2: Hide blog_authors.email from public reads via column-level privileges.
-- Admins still get full access via the admin policy + service_role.
REVOKE SELECT ON public.blog_authors FROM anon, authenticated;
GRANT SELECT (id, slug, name, avatar_url, title, bio, created_at, updated_at)
  ON public.blog_authors TO anon, authenticated;
GRANT UPDATE, INSERT, DELETE ON public.blog_authors TO authenticated;
GRANT ALL ON public.blog_authors TO service_role;
