-- Drop the fully permissive public SELECT policy and replace it with grants-based column exposure.
DROP POLICY IF EXISTS "blog_authors public read" ON public.blog_authors;

-- Revoke blanket SELECT so column-level grants take effect.
REVOKE SELECT ON public.blog_authors FROM anon;
REVOKE SELECT ON public.blog_authors FROM authenticated;

-- Public-safe columns only (no email).
GRANT SELECT (id, slug, name, title, bio, avatar_url, user_id, created_at, updated_at) ON public.blog_authors TO anon;
GRANT SELECT (id, slug, name, title, bio, avatar_url, user_id, created_at, updated_at) ON public.blog_authors TO authenticated;

-- Admins keep full access via the existing "blog_authors admin write" ALL policy;
-- add an explicit SELECT-all policy so admins can still read the email column.
CREATE POLICY "blog_authors public read (no email)"
  ON public.blog_authors
  FOR SELECT
  TO anon, authenticated
  USING (true);

GRANT ALL ON public.blog_authors TO service_role;