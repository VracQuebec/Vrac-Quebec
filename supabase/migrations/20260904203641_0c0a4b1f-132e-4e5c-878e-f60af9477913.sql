CREATE OR REPLACE FUNCTION public.fleet_notify_repair()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_name text; open_left int;
BEGIN
  SELECT name INTO v_name FROM public.trucks WHERE id = NEW.vehicle_id;

  IF NEW.status = 'terminee' THEN
    PERFORM public.crm_resolve('fleet_repairs', NEW.id);
    IF NEW.inspection_id IS NOT NULL THEN
      SELECT count(*) INTO open_left FROM public.fleet_repairs
       WHERE inspection_id = NEW.inspection_id AND status <> 'terminee';
      IF open_left = 0 THEN
        PERFORM public.crm_resolve('fleet_inspections', NEW.inspection_id);
      END IF;
    END IF;
  ELSIF NEW.priority = 'urgente' THEN
    PERFORM public.crm_notify('fleet:repair:' || NEW.id || ':urgente', 'alerte', 'fleet_repair_urgent', 'urgente',
      'Réparation urgente — ' || coalesce(v_name, 'véhicule'), NEW.problem,
      'fleet_repairs', NEW.id, '/admin/flotte/vehicule/' || NEW.vehicle_id || '?tab=reparations',
      NULL, NULL, NEW.scheduled_date::timestamptz, jsonb_build_object('vehicle_id', NEW.vehicle_id));
  ELSIF NEW.status = 'a_planifier' THEN
    PERFORM public.crm_notify('fleet:repair:' || NEW.id || ':a_planifier', 'alerte', 'fleet_repair_plan', 'importante',
      'Réparation à planifier — ' || coalesce(v_name, 'véhicule'), NEW.problem,
      'fleet_repairs', NEW.id, '/admin/flotte/vehicule/' || NEW.vehicle_id || '?tab=reparations',
      NULL, NULL, NEW.scheduled_date::timestamptz, jsonb_build_object('vehicle_id', NEW.vehicle_id));
  END IF;

  RETURN NEW;
END; $function$;