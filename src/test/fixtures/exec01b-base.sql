-- LOCAL EMPTY DATABASE ONLY. Minimal model based on inspected public metadata;
-- deliberately no production data, business notification triggers or cron jobs.
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE SCHEMA IF NOT EXISTS auth;
DO $$ BEGIN
 IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon; END IF;
 IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated; END IF;
 IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role BYPASSRLS; END IF;
END $$;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT null::uuid $$;
CREATE FUNCTION public.has_role(uuid,text) RETURNS boolean LANGUAGE sql AS $$ SELECT false $$;
CREATE TABLE public.submissions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), materials text[] NOT NULL, property_type text NOT NULL,
 quantity text NOT NULL, tonnage text NOT NULL, address text NOT NULL,name text NOT NULL,email text NOT NULL,
 city text,submission_number integer,status text DEFAULT 'nouvelle',request_type text DEFAULT 'remblai',
 quantity_value numeric,quantity_unit text,remaining_capacity text,opening_hours text,truck_types_allowed text[],access_details jsonb,
 availability_status text DEFAULT 'unavailable' CHECK(availability_status IN ('available','limited','unavailable','completed','suspended','owner_closed')),
 availability_updated_at timestamptz,availability_source text,availability_reason text,availability_note text,revalidation_requested_at timestamptz,internal_notes text
);
CREATE TABLE public.submission_fill_profile (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),submission_id uuid NOT NULL REFERENCES public.submissions(id) UNIQUE,
 capacity_kind text NOT NULL DEFAULT 'unknown' CHECK(capacity_kind IN ('known','approximate','unlimited','unknown')),
 capacity_value numeric,capacity_unit text CHECK(capacity_unit IN ('voyages','tonnes','verges3','m3')),
 accepted_truck_codes text[],access_notes text,source text DEFAULT 'inferred_pending_review' CHECK(source IN ('historical','user_manual','user_assistant','admin_manual','inferred_pending_review')),
 updated_at timestamptz DEFAULT now()
);
CREATE TABLE public.submission_material_conditions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),submission_id uuid NOT NULL REFERENCES public.submissions(id),condition_key text NOT NULL,
 stance text NOT NULL DEFAULT 'unknown' CHECK(stance IN ('accepted','forbidden','unknown')),source text DEFAULT 'suggested',updated_at timestamptz DEFAULT now(),UNIQUE(submission_id,condition_key)
);
CREATE TABLE public.submission_availability_log (id uuid PRIMARY KEY DEFAULT gen_random_uuid(),submission_id uuid REFERENCES public.submissions(id),old_status text,new_status text,created_at timestamptz DEFAULT now());
CREATE FUNCTION public.local_availability_log() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN IF OLD.availability_status IS DISTINCT FROM NEW.availability_status THEN INSERT INTO public.submission_availability_log(submission_id,old_status,new_status) VALUES(NEW.id,OLD.availability_status,NEW.availability_status); END IF;RETURN NEW;END $$;
CREATE TRIGGER local_availability AFTER UPDATE ON public.submissions FOR EACH ROW EXECUTE FUNCTION public.local_availability_log();