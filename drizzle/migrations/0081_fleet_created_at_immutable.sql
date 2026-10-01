CREATE OR REPLACE FUNCTION public.fleet_keep_created_at() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.created_at := OLD.created_at; RETURN NEW; END $$;
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['trucks','fleet_work_items','fleet_maintenance','fleet_repairs','fleet_inspections','fleet_expenses','fleet_parts','fleet_costs','fleet_meter_readings','fleet_part_refs','fleet_service_programs','fleet_inspection_templates'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_keep_created_at ON public.%I', t);
    EXECUTE format('CREATE TRIGGER trg_keep_created_at BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.fleet_keep_created_at()', t);
  END LOOP; END $$;