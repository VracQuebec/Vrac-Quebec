-- Empty local structural dependencies, no real company or user data.
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
CREATE TABLE public.jsc_companies(id uuid PRIMARY KEY,name text NOT NULL);
GRANT SELECT ON public.jsc_companies TO authenticated;
GRANT ALL ON public.jsc_companies TO service_role;
ALTER TABLE public.jsc_companies ENABLE ROW LEVEL SECURITY;
CREATE TABLE public.jsc_company_members(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid NOT NULL,company_id uuid NOT NULL REFERENCES public.jsc_companies(id),is_active boolean NOT NULL DEFAULT true,archived_at timestamptz);
GRANT SELECT ON public.jsc_company_members TO authenticated;
GRANT ALL ON public.jsc_company_members TO service_role;
ALTER TABLE public.jsc_company_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY own_membership ON public.jsc_company_members FOR SELECT TO authenticated USING(user_id=auth.uid());