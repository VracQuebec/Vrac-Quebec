
-- Move blog author emails into a separate admin-only table so RLS can protect them.
CREATE TABLE IF NOT EXISTS public.blog_author_emails (
  author_id UUID PRIMARY KEY REFERENCES public.blog_authors(id) ON DELETE CASCADE,
  email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.blog_author_emails TO authenticated;
GRANT ALL ON public.blog_author_emails TO service_role;

ALTER TABLE public.blog_author_emails ENABLE ROW LEVEL SECURITY;

CREATE POLICY "blog_author_emails admin read"
  ON public.blog_author_emails FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "blog_author_emails admin write"
  ON public.blog_author_emails FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

-- Migrate existing emails, then drop the column from blog_authors.
INSERT INTO public.blog_author_emails (author_id, email)
SELECT id, email FROM public.blog_authors WHERE email IS NOT NULL
ON CONFLICT (author_id) DO NOTHING;

-- Drop the exposed policy that USING(true) covered the email column via.
DROP POLICY IF EXISTS "blog_authors public read (no email)" ON public.blog_authors;

ALTER TABLE public.blog_authors DROP COLUMN IF EXISTS email;

-- Re-grant full-table SELECT now that email no longer exists.
REVOKE SELECT ON public.blog_authors FROM anon, authenticated;
GRANT SELECT ON public.blog_authors TO anon, authenticated;

-- Restore a clean public read policy on the (now email-free) table.
CREATE POLICY "blog_authors public read"
  ON public.blog_authors FOR SELECT
  USING (true);
