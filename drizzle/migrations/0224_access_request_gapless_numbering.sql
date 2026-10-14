CREATE TABLE public.transport_request_number_counter (
  id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  last_value integer NOT NULL
);
GRANT ALL ON public.transport_request_number_counter TO service_role;
ALTER TABLE public.transport_request_number_counter ENABLE ROW LEVEL SECURITY;
INSERT INTO public.transport_request_number_counter (id, last_value)
SELECT 1, GREATEST(
  (SELECT last_value FROM public.transport_requests_number_seq),
  COALESCE((SELECT max((substring(request_number from '^DT-(\d+)$'))::int) FROM public.transport_requests), 0));
CREATE OR REPLACE FUNCTION public.assign_transport_request_number()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $f$
DECLARE v integer;
BEGIN
  IF NEW.request_number IS NULL OR btrim(NEW.request_number) = '' THEN
    UPDATE public.transport_request_number_counter SET last_value = last_value + 1
      WHERE id = 1 RETURNING last_value INTO v;
    NEW.request_number := 'DT-' || lpad(v::text, 4, '0');
  END IF;
  RETURN NEW;
END $f$;
DROP TRIGGER IF EXISTS trg_tr_assign_number ON public.transport_requests;
CREATE TRIGGER zz_tr_assign_number BEFORE INSERT ON public.transport_requests
  FOR EACH ROW EXECUTE FUNCTION public.assign_transport_request_number();
COMMENT ON SEQUENCE public.transport_requests_number_seq IS 'DEPRECATED: remplacée par transport_request_number_counter (numérotation sans saut)';