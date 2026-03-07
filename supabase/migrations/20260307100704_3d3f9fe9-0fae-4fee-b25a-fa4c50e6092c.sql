
-- Drop existing RESTRICTIVE policies
DROP POLICY IF EXISTS "Anyone can submit a request" ON public.submissions;
DROP POLICY IF EXISTS "Admins can read submissions" ON public.submissions;
DROP POLICY IF EXISTS "Admins can delete submissions" ON public.submissions;
DROP POLICY IF EXISTS "Admins can read roles" ON public.user_roles;

-- Recreate as PERMISSIVE policies
CREATE POLICY "Anyone can submit a request"
  ON public.submissions FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "Admins can read submissions"
  ON public.submissions FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete submissions"
  ON public.submissions FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can read roles"
  ON public.user_roles FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
