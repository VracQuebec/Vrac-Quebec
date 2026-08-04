ALTER TABLE public.jsc_materials
  ADD COLUMN IF NOT EXISTS pickup_location_id uuid REFERENCES public.jsc_pickup_locations(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_jsc_materials_pickup_location ON public.jsc_materials(pickup_location_id);