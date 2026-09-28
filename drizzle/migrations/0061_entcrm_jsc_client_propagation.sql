CREATE OR REPLACE FUNCTION public.entcrm_jsc_client_propagate()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF (NEW.name, NEW.phone, NEW.email, NEW.billing_address, NEW.city, NEW.client_type)
     IS DISTINCT FROM (OLD.name, OLD.phone, OLD.email, OLD.billing_address, OLD.city, OLD.client_type) THEN
    -- Le garde entcrm_jsc_link_guard recopie l'identité depuis jsc_clients (source d'autorité).
    UPDATE public.ent_crm_clients SET updated_at = now()
     WHERE jsc_client_id = NEW.id AND company_id = NEW.company_id;
  END IF;
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS entcrm_jsc_client_propagate ON public.jsc_clients;
CREATE TRIGGER entcrm_jsc_client_propagate AFTER UPDATE ON public.jsc_clients
FOR EACH ROW EXECUTE FUNCTION public.entcrm_jsc_client_propagate();