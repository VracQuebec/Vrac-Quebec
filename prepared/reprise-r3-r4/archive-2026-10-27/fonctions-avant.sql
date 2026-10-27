CREATE OR REPLACE FUNCTION public.jsc_my_driver_ids()
 RETURNS SETOF uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT id FROM public.jsc_drivers WHERE user_id = auth.uid() AND archived_at IS NULL;
$function$
;
CREATE OR REPLACE FUNCTION public.jsc_driver_portal(_from date DEFAULT NULL::date, _to date DEFAULT NULL::date)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH ids AS (SELECT id FROM public.jsc_drivers WHERE user_id = auth.uid() AND archived_at IS NULL)
  SELECT jsonb_build_object(
    'driver', (SELECT to_jsonb(d) - 'internal_notes' - 'hourly_cost' FROM public.jsc_drivers d WHERE d.user_id = auth.uid() LIMIT 1),
    'truck', (SELECT to_jsonb(t) FROM public.jsc_trucks t
              WHERE t.id = (SELECT default_truck_id FROM public.jsc_drivers WHERE user_id = auth.uid() LIMIT 1)),
    'deliveries', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', d.id, 'delivery_number', d.delivery_number, 'status', d.status,
        'scheduled_date', d.scheduled_date, 'scheduled_time', d.scheduled_time,
        'delivery_address', d.delivery_address, 'city', d.city, 'postal_code', d.postal_code,
        'latitude', d.latitude, 'longitude', d.longitude,
        'quantity', d.quantity, 'quantity_unit', d.quantity_unit, 'distance_km', d.distance_km,
        'notes', d.notes, 'driver_notes', d.driver_notes,
        'signature_name', d.signature_name, 'proof_photos', d.proof_photos,
        'material', (SELECT m.name FROM public.jsc_materials m WHERE m.id = d.material_id),
        'pickup', (SELECT p.name FROM public.jsc_pickup_locations p WHERE p.id = d.pickup_location_id),
        'client', (SELECT c.name FROM public.jsc_clients c WHERE c.id = d.client_id)
      ) ORDER BY d.scheduled_date, d.scheduled_time)
      FROM public.jsc_deliveries d
      WHERE d.driver_id IN (SELECT id FROM ids) AND d.archived_at IS NULL
        AND (_from IS NULL OR d.scheduled_date >= _from)
        AND (_to IS NULL OR d.scheduled_date <= _to)), '[]'::jsonb),
    'generated_at', now()
  );
$function$
;
