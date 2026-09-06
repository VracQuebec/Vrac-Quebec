-- Les membres d'une même entreprise peuvent voir leurs collègues
CREATE POLICY "Members read their company roster"
ON public.jsc_company_members FOR SELECT TO authenticated
USING (public.jsc_company_role(auth.uid(), company_id) IS NOT NULL);

-- Les admins et gestionnaires de l'entreprise gèrent leurs employés
CREATE POLICY "Company managers manage their members"
ON public.jsc_company_members FOR ALL TO authenticated
USING (public.jsc_company_role(auth.uid(), company_id) IN ('admin','manager'))
WITH CHECK (public.jsc_company_role(auth.uid(), company_id) IN ('admin','manager'));

-- Ajout d'un employé par courriel (compte existant requis)
CREATE OR REPLACE FUNCTION public.jsc_add_company_member(_company_id uuid, _email text, _full_name text DEFAULT NULL, _role text DEFAULT 'sales')
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid;
  _id uuid;
BEGIN
  IF public.jsc_company_role(auth.uid(), _company_id) NOT IN ('admin','manager') THEN
    RAISE EXCEPTION 'permission_refusee';
  END IF;
  IF _role NOT IN ('admin','manager','dispatcher','sales','accounting','driver') THEN
    RAISE EXCEPTION 'role_invalide';
  END IF;
  SELECT id INTO _uid FROM auth.users WHERE lower(email) = lower(trim(_email)) LIMIT 1;
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'aucun_compte';
  END IF;
  INSERT INTO public.jsc_company_members (company_id, user_id, email, full_name, role)
  VALUES (_company_id, _uid, lower(trim(_email)), _full_name, _role)
  ON CONFLICT (company_id, user_id) DO UPDATE SET role = EXCLUDED.role, full_name = EXCLUDED.full_name, is_active = true
  RETURNING id INTO _id;
  RETURN _id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.jsc_add_company_member(uuid, text, text, text) TO authenticated;