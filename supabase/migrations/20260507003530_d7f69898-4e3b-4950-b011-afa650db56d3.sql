-- Auto-incrementing DOMPE number for new leads
CREATE SEQUENCE IF NOT EXISTS public.dompe_number_seq START WITH 171 INCREMENT BY 1;

CREATE OR REPLACE FUNCTION public.assign_dompe_number()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.dompe_number IS NULL OR btrim(NEW.dompe_number) = '' THEN
    NEW.dompe_number := 'Dompe ' || nextval('public.dompe_number_seq')::text;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_assign_dompe_number ON public.submissions;
CREATE TRIGGER trg_assign_dompe_number
BEFORE INSERT ON public.submissions
FOR EACH ROW
EXECUTE FUNCTION public.assign_dompe_number();