DROP POLICY IF EXISTS "Users can read their own role" ON public.user_roles;
CREATE POLICY "Users can read their own role"
ON public.user_roles
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Entrepreneurs can read their own profile" ON public.entrepreneurs;
CREATE POLICY "Entrepreneurs can read their own profile"
ON public.entrepreneurs
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

CREATE UNIQUE INDEX IF NOT EXISTS entrepreneurs_user_id_unique_idx
ON public.entrepreneurs(user_id)
WHERE user_id IS NOT NULL;