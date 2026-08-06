CREATE OR REPLACE FUNCTION public.jsc_deliveries_driver_update_scope()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.jsc_can_manage(auth.uid()) THEN
    RETURN NEW;
  END IF;

  IF OLD.driver_id IS NOT NULL AND OLD.driver_id IN (SELECT public.jsc_my_driver_ids()) THEN
    IF NEW.status IS DISTINCT FROM OLD.status
       AND NEW.status NOT IN ('en_route','chargement','transport','livraison','termine') THEN
      RAISE EXCEPTION 'Statut non autorisé pour un chauffeur';
    END IF;

    NEW.id := OLD.id;
    NEW.company_id := OLD.company_id;
    NEW.delivery_number := OLD.delivery_number;
    NEW.order_id := OLD.order_id;
    NEW.project_id := OLD.project_id;
    NEW.client_id := OLD.client_id;
    NEW.material_id := OLD.material_id;
    NEW.supplier_id := OLD.supplier_id;
    NEW.pickup_location_id := OLD.pickup_location_id;
    NEW.carrier_id := OLD.carrier_id;
    NEW.truck_id := OLD.truck_id;
    NEW.driver_id := OLD.driver_id;
    NEW.quantity := OLD.quantity;
    NEW.quantity_unit := OLD.quantity_unit;
    NEW.trip_index := OLD.trip_index;
    NEW.delivery_address := OLD.delivery_address;
    NEW.city := OLD.city;
    NEW.postal_code := OLD.postal_code;
    NEW.latitude := OLD.latitude;
    NEW.longitude := OLD.longitude;
    NEW.scheduled_date := OLD.scheduled_date;
    NEW.scheduled_time := OLD.scheduled_time;
    NEW.duration_minutes := OLD.duration_minutes;
    NEW.priority := OLD.priority;
    NEW.group_key := OLD.group_key;
    NEW.distance_km := OLD.distance_km;
    NEW.estimated_cost := OLD.estimated_cost;
    NEW.notes := OLD.notes;
    NEW.internal_notes := OLD.internal_notes;
    NEW.cancelled_at := OLD.cancelled_at;
    NEW.created_by := OLD.created_by;
    NEW.archived_at := OLD.archived_at;
    NEW.archived_by := OLD.archived_by;
    NEW.created_at := OLD.created_at;
    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_jsc_deliveries_driver_update_scope ON public.jsc_deliveries;
CREATE TRIGGER trg_jsc_deliveries_driver_update_scope
BEFORE UPDATE ON public.jsc_deliveries
FOR EACH ROW EXECUTE FUNCTION public.jsc_deliveries_driver_update_scope();

CREATE OR REPLACE FUNCTION public.jsc_quotes_client_update_scope()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.jsc_can_manage(auth.uid()) THEN
    RETURN NEW;
  END IF;

  IF OLD.client_id IS NOT NULL AND OLD.client_id IN (SELECT public.jsc_my_client_ids()) THEN
    IF NEW.status IS DISTINCT FROM OLD.status
       AND NEW.status NOT IN ('acceptee','refusee') THEN
      RAISE EXCEPTION 'Statut non autorisé pour un client';
    END IF;

    NEW.id := OLD.id;
    NEW.company_id := OLD.company_id;
    NEW.quote_number := OLD.quote_number;
    NEW.request_id := OLD.request_id;
    NEW.estimate_id := OLD.estimate_id;
    NEW.client_id := OLD.client_id;
    NEW.valid_until := OLD.valid_until;
    NEW.public_payload := OLD.public_payload;
    NEW.subtotal := OLD.subtotal;
    NEW.tax_total := OLD.tax_total;
    NEW.total := OLD.total;
    NEW.currency := OLD.currency;
    NEW.sent_at := OLD.sent_at;
    NEW.created_by := OLD.created_by;
    NEW.archived_at := OLD.archived_at;
    NEW.archived_by := OLD.archived_by;
    NEW.created_at := OLD.created_at;
    NEW.internal_notes := OLD.internal_notes;
    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_jsc_quotes_client_update_scope ON public.jsc_quotes;
CREATE TRIGGER trg_jsc_quotes_client_update_scope
BEFORE UPDATE ON public.jsc_quotes
FOR EACH ROW EXECUTE FUNCTION public.jsc_quotes_client_update_scope();