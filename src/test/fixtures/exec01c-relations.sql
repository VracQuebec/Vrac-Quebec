-- LOCAL ONLY: columns/constraints inspected in Cloud on 2026-10-19.
-- Not a full production snapshot; notifications, SEO and company auth excluded.
CREATE TYPE public.trip_status AS ENUM ('demande','soumission_envoyee','accepte','planifie','en_route','chargement','transport','livraison','termine','facture','paye','annule');
CREATE TABLE public.trips(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),submission_id uuid REFERENCES public.submissions(id),status public.trip_status DEFAULT 'demande',internal_notes text,entrepreneur_id uuid,carrier_id uuid);
CREATE TABLE public.cpn_trips(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),submission_id uuid REFERENCES public.submissions(id),side text CHECK(side IN ('recu','livre')),kind text CHECK(kind IN ('voyage','total_jour')),trip_date date,count integer CHECK(count BETWEEN 0 AND 500),voided_at timestamptz,entrepreneur_label text);
CREATE TABLE public.public_request_guard(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),scope text NOT NULL,identity text NOT NULL,fingerprint text NOT NULL,payload jsonb DEFAULT '{}',created_at timestamptz DEFAULT now());
CREATE FUNCTION public.submissions_touch_availability() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NEW.availability_updated_at IS DISTINCT FROM OLD.availability_updated_at THEN
  IF NEW.availability_updated_at IS NOT NULL AND NEW.availability_updated_at>now() THEN NEW.availability_updated_at:=now(); END IF;
  RETURN NEW;
 END IF;
 IF NEW.availability_status IS DISTINCT FROM OLD.availability_status THEN NEW.availability_updated_at:=now(); END IF;
 IF NEW.status IS DISTINCT FROM OLD.status THEN NEW.availability_status:=OLD.availability_status; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER trg_submissions_touch_availability BEFORE UPDATE ON public.submissions FOR EACH ROW EXECUTE FUNCTION public.submissions_touch_availability();
