ALTER TABLE public.fleet_maintenance
  ADD COLUMN IF NOT EXISTS next_due_hours numeric,
  ADD COLUMN IF NOT EXISTS alert_days_before integer NOT NULL DEFAULT 14,
  ADD COLUMN IF NOT EXISTS alert_km_margin numeric NOT NULL DEFAULT 2000,
  ADD COLUMN IF NOT EXISTS alert_hours_margin numeric NOT NULL DEFAULT 100,
  ADD COLUMN IF NOT EXISTS completed_engine_hours numeric;

ALTER TABLE public.fleet_repairs
  ADD COLUMN IF NOT EXISTS completed_engine_hours numeric;

ALTER TABLE public.crm_audit_log DROP CONSTRAINT IF EXISTS crm_audit_log_owner_type_check;
ALTER TABLE public.crm_audit_log ADD CONSTRAINT crm_audit_log_owner_type_check
  CHECK (owner_type = ANY (ARRAY['client','carrier','dump','entrepreneur',
    'fleet_vehicle','fleet_maintenance','fleet_repair','fleet_inspection']));

CREATE OR REPLACE FUNCTION public.fleet_scan_due()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE r record; n int := 0; due boolean; late boolean;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  FOR r IN
    SELECT m.id, m.vehicle_id, m.next_type, m.maintenance_type,
           m.next_due_date, m.next_due_km, m.next_due_hours,
           m.alert_days_before, m.alert_km_margin, m.alert_hours_margin,
           t.name AS vehicle_name, t.odometer_km, t.engine_hours
    FROM public.fleet_maintenance m
    JOIN public.trucks t ON t.id = m.vehicle_id
  LOOP
    late := r.next_due_date IS NOT NULL AND r.next_due_date < current_date;
    due := (r.next_due_date IS NOT NULL AND r.next_due_date <= current_date + coalesce(r.alert_days_before, 14))
        OR (r.next_due_km IS NOT NULL AND r.odometer_km IS NOT NULL
            AND r.odometer_km >= r.next_due_km - coalesce(r.alert_km_margin, 2000))
        OR (r.next_due_hours IS NOT NULL AND r.engine_hours IS NOT NULL
            AND r.engine_hours >= r.next_due_hours - coalesce(r.alert_hours_margin, 100));

    IF late THEN
      PERFORM public.crm_notify('fleet:maint:' || r.id || ':retard', 'alerte', 'fleet_maintenance_late', 'urgente',
        'Entretien en retard — ' || r.vehicle_name, coalesce(r.next_type, r.maintenance_type, 'Entretien préventif'),
        'fleet_maintenance', r.id, '/admin/flotte/vehicule/' || r.vehicle_id || '?tab=entretien',
        NULL, NULL, r.next_due_date::timestamptz, jsonb_build_object('vehicle_id', r.vehicle_id));
      n := n + 1;
    ELSIF due THEN
      PERFORM public.crm_notify('fleet:maint:' || r.id || ':bientot', 'alerte', 'fleet_maintenance_due', 'importante',
        'Entretien bientôt dû — ' || r.vehicle_name, coalesce(r.next_type, r.maintenance_type, 'Entretien préventif'),
        'fleet_maintenance', r.id, '/admin/flotte/vehicule/' || r.vehicle_id || '?tab=entretien',
        NULL, NULL, r.next_due_date::timestamptz, jsonb_build_object('vehicle_id', r.vehicle_id));
      n := n + 1;
    ELSE
      PERFORM public.crm_resolve('fleet_maintenance', r.id);
    END IF;
  END LOOP;

  RETURN jsonb_build_object('checked', true, 'notified', n);
END; $function$;