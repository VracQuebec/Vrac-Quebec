CREATE OR REPLACE FUNCTION public.jsc_orch_event_trigger()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_company uuid; v_type text; v_label text; v_sev text := 'info'; v_payload jsonb := '{}'::jsonb;
BEGIN
  v_company := CASE WHEN to_jsonb(NEW) ? 'company_id' THEN (to_jsonb(NEW)->>'company_id')::uuid ELSE NULL END;

  IF TG_TABLE_NAME = 'jsc_orders' THEN
    IF TG_OP = 'INSERT' THEN
      v_type := 'order_created'; v_label := coalesce(NEW.order_number, 'Nouvelle commande');
      v_payload := jsonb_build_object('total', NEW.total, 'status', NEW.status);
    ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
      v_type := 'order_status'; v_label := format('%s → %s', coalesce(NEW.order_number,'commande'), NEW.status);
      v_payload := jsonb_build_object('from', OLD.status, 'to', NEW.status, 'total', NEW.total);
    END IF;

  ELSIF TG_TABLE_NAME = 'jsc_deliveries' THEN
    IF TG_OP = 'INSERT' THEN
      v_type := 'delivery_created'; v_label := coalesce(NEW.delivery_number, 'Nouvelle livraison');
      v_payload := jsonb_build_object('city', NEW.city, 'scheduled_date', NEW.scheduled_date);
    ELSIF NEW.delivered_at IS NOT NULL AND OLD.delivered_at IS NULL THEN
      v_type := 'delivery_completed'; v_label := coalesce(NEW.delivery_number, 'Livraison complétée');
      v_payload := jsonb_build_object('city', NEW.city, 'delivered_at', NEW.delivered_at);
    ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
      v_type := 'delivery_status'; v_label := format('%s → %s', coalesce(NEW.delivery_number,'livraison'), NEW.status);
      v_payload := jsonb_build_object('from', OLD.status, 'to', NEW.status);
    END IF;

  ELSIF TG_TABLE_NAME = 'jsc_invoices' THEN
    IF TG_OP = 'INSERT' THEN
      v_type := 'invoice_created'; v_label := coalesce(NEW.invoice_number, 'Nouvelle facture');
      v_payload := jsonb_build_object('total', NEW.total, 'balance', NEW.balance);
    ELSIF coalesce(NEW.amount_paid,0) > coalesce(OLD.amount_paid,0) THEN
      v_type := 'payment_received'; v_label := format('Paiement sur %s', coalesce(NEW.invoice_number,'facture'));
      v_payload := jsonb_build_object('amount', coalesce(NEW.amount_paid,0) - coalesce(OLD.amount_paid,0), 'balance', NEW.balance);
    END IF;

  ELSIF TG_TABLE_NAME = 'jsc_incidents' THEN
    IF TG_OP = 'INSERT' THEN
      v_type := 'incident'; v_label := coalesce(NEW.incident_type, 'Incident');
      v_sev := CASE NEW.severity WHEN 'critique' THEN 'critical' WHEN 'haute' THEN 'warning' ELSE 'info' END;
      v_payload := jsonb_build_object('severity', NEW.severity, 'description', NEW.description);
    END IF;

  ELSIF TG_TABLE_NAME = 'jsc_clients' THEN
    IF TG_OP = 'INSERT' THEN
      v_type := 'client_created'; v_label := NEW.name;
      v_payload := jsonb_build_object('city', NEW.city, 'type', NEW.client_type);
    END IF;

  ELSIF TG_TABLE_NAME = 'jsc_materials' THEN
    IF TG_OP = 'UPDATE' AND NEW.selling_price IS DISTINCT FROM OLD.selling_price THEN
      v_type := 'price_change'; v_label := format('Prix de %s modifié', NEW.name);
      v_payload := jsonb_build_object('from', OLD.selling_price, 'to', NEW.selling_price);
    END IF;
  END IF;

  IF v_type IS NULL THEN RETURN NEW; END IF;

  INSERT INTO public.jsc_events (company_id, event_type, entity_type, entity_id, label, severity, payload, created_by)
  VALUES (v_company, v_type, TG_TABLE_NAME, NEW.id, v_label, v_sev, v_payload, auth.uid());
  RETURN NEW;
END $$;

CREATE TRIGGER trg_orch_events_orders AFTER INSERT OR UPDATE ON public.jsc_orders
  FOR EACH ROW EXECUTE FUNCTION public.jsc_orch_event_trigger();
CREATE TRIGGER trg_orch_events_deliveries AFTER INSERT OR UPDATE ON public.jsc_deliveries
  FOR EACH ROW EXECUTE FUNCTION public.jsc_orch_event_trigger();
CREATE TRIGGER trg_orch_events_invoices AFTER INSERT OR UPDATE ON public.jsc_invoices
  FOR EACH ROW EXECUTE FUNCTION public.jsc_orch_event_trigger();
CREATE TRIGGER trg_orch_events_incidents AFTER INSERT ON public.jsc_incidents
  FOR EACH ROW EXECUTE FUNCTION public.jsc_orch_event_trigger();
CREATE TRIGGER trg_orch_events_clients AFTER INSERT ON public.jsc_clients
  FOR EACH ROW EXECUTE FUNCTION public.jsc_orch_event_trigger();
CREATE TRIGGER trg_orch_events_materials AFTER UPDATE ON public.jsc_materials
  FOR EACH ROW EXECUTE FUNCTION public.jsc_orch_event_trigger();