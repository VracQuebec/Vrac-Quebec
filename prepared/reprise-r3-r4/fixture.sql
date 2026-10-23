-- Minimal EMPTY structural fixture, never production data. Auth claim emulates PostgreSQL JWT context only.
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
CREATE TABLE public.user_roles(user_id uuid,role text,approved boolean);
CREATE FUNCTION public.has_role(u uuid,r text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$SELECT EXISTS(SELECT 1 FROM user_roles WHERE user_id=u AND role=r AND approved)$$;
CREATE TABLE public.jsc_companies(id uuid PRIMARY KEY,name text);
CREATE TABLE public.jsc_company_members(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),company_id uuid,user_id uuid,role text,is_active boolean DEFAULT true,archived_at timestamptz);
CREATE TABLE public.jsc_drivers(id uuid PRIMARY KEY,company_id uuid,user_id uuid,is_active boolean DEFAULT true,archived_at timestamptz);
CREATE TABLE public.jsc_trucks(id uuid PRIMARY KEY,company_id uuid,is_active boolean DEFAULT true,archived_at timestamptz);
CREATE TABLE public.submissions(id uuid PRIMARY KEY,created_by uuid,status text,availability_status text,materials text[],address text,formatted_address text,latitude float8,longitude float8,place_id text,quantity_value numeric,quantity_unit text,quantity text,desired_date date,truck_type_key text,exec01_version integer DEFAULT 1,exec01_owner_confirmed_at timestamptz,revalidation_requested_at timestamptz,site_validated_at timestamptz,updated_at timestamptz,submission_number integer,description text,access_details jsonb);
CREATE TABLE public.transport_requests(id uuid PRIMARY KEY,request_number text,origin_submission_id uuid,driver_id uuid,truck_id uuid,lifecycle_status text,current_version integer DEFAULT 1,dump_name text,updated_at timestamptz);
CREATE TABLE public.submission_site_decisions(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),submission_id uuid,site_id uuid,status text,decision_note text,updated_at timestamptz);
CREATE TABLE public.trips(id uuid PRIMARY KEY,submission_id uuid,status text);
CREATE TABLE public.ent_crm_history(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),company_id uuid,entity text,entity_id uuid,action text,before jsonb,after jsonb,actor_id uuid,origin text,created_at timestamptz DEFAULT now());
CREATE TABLE public.transport_request_events(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),request_id uuid,action text,version integer,reason text,details jsonb DEFAULT '{}',actor_id uuid,actor_role text,origin text,created_at timestamptz DEFAULT now());
CREATE TABLE public.jsc_notifications(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),company_id uuid,audience text,user_id uuid,channel text,title text,body text,entity_type text,entity_id uuid,status text);
CREATE TABLE public.crm_notifications(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),dedupe_key text UNIQUE,entity_type text,entity_id uuid,meta jsonb);
CREATE FUNCTION public.crm_notify(p_dedupe_key text,p_category text,p_type text,p_priority text,p_title text,p_body text DEFAULT NULL,p_entity_type text DEFAULT NULL,p_entity_id uuid DEFAULT NULL,p_action_url text DEFAULT NULL,p_client_name text DEFAULT NULL,p_lead_number text DEFAULT NULL,p_due_at timestamptz DEFAULT NULL,p_meta jsonb DEFAULT '{}',p_reopen boolean DEFAULT false) RETURNS uuid LANGUAGE plpgsql AS $$DECLARE i uuid;BEGIN INSERT INTO crm_notifications(dedupe_key,entity_type,entity_id,meta)VALUES(p_dedupe_key,p_entity_type,p_entity_id,p_meta) ON CONFLICT(dedupe_key)DO UPDATE SET meta=excluded.meta RETURNING id INTO i;RETURN i;END$$;
CREATE FUNCTION public.entcrm_can_write(_company uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$SELECT EXISTS(SELECT 1 FROM jsc_company_members WHERE company_id=_company AND user_id=auth.uid() AND is_active AND archived_at IS NULL AND role IN ('proprietaire','gestionnaire'))$$;

DO $$DECLARE t text;BEGIN
 FOREACH t IN ARRAY ARRAY['user_roles','jsc_companies','jsc_company_members','jsc_drivers','jsc_trucks','submissions','transport_requests','submission_site_decisions','trips','ent_crm_history','transport_request_events','jsc_notifications','crm_notifications'] LOOP
  EXECUTE format('GRANT ALL ON public.%I TO service_role',t);
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
 END LOOP;
END$$;
GRANT USAGE ON SCHEMA public,auth TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated;
