
-- Enforce defaults on public transport_requests inserts (mirror submissions pattern)
CREATE OR REPLACE FUNCTION public.enforce_transport_request_insert_defaults()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND public.has_role(auth.uid(), 'admin'::app_role) THEN
    RETURN NEW;
  END IF;

  -- Internal/dispatch-only fields must never be set by public callers
  NEW.status := 'nouvelle';
  NEW.assigned_dispatcher := NULL;
  NEW.driver_id := NULL;
  NEW.truck_id := NULL;
  NEW.internal_notes := NULL;
  NEW.request_number := NULL;
  NEW.source := COALESCE(NULLIF(NEW.source, ''), 'wizard_public');

  -- Only associate authenticated user's own id
  IF auth.uid() IS NULL THEN
    NEW.user_id := NULL;
  ELSE
    NEW.user_id := auth.uid();
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_transport_request_insert_defaults ON public.transport_requests;
CREATE TRIGGER trg_enforce_transport_request_insert_defaults
BEFORE INSERT ON public.transport_requests
FOR EACH ROW EXECUTE FUNCTION public.enforce_transport_request_insert_defaults();

-- Tighten the INSERT policy: require default/blank internal fields
DROP POLICY IF EXISTS "Anyone can create transport request" ON public.transport_requests;
CREATE POLICY "Anyone can create transport request"
ON public.transport_requests
FOR INSERT
WITH CHECK (
  status = 'nouvelle'
  AND assigned_dispatcher IS NULL
  AND driver_id IS NULL
  AND truck_id IS NULL
  AND (internal_notes IS NULL OR internal_notes = '')
  AND (request_number IS NULL OR request_number = '')
  AND (
    (auth.uid() IS NULL AND user_id IS NULL)
    OR (auth.uid() IS NOT NULL AND user_id = auth.uid())
  )
);
