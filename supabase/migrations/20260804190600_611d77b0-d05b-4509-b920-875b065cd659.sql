UPDATE public.jsc_pickup_locations
SET is_active = false, archived_at = now(), updated_at = now()
WHERE id IN ('2333cd5d-aecf-487e-bb0d-3f91bfb171b8','94468713-b80c-4586-93a5-8dfd222adfe1')
  AND archived_at IS NULL;

UPDATE public.jsc_pickup_locations
SET access_notes = 'Point de départ et de retour des camions.', updated_at = now()
WHERE id = '492b6726-623b-4283-b84b-019c3d00e82a';