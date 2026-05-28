
-- 1. has_role: require approved = true
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role AND approved = true
  )
$$;

-- 2. is_approved_entrepreneur: also require approved
CREATE OR REPLACE FUNCTION public.is_approved_entrepreneur(_uid uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _uid AND role = 'entrepreneur' AND approved = true
  )
$$;

-- 3. Lock down submissions INSERT: reset internal/workflow fields for non-admin inserts
CREATE OR REPLACE FUNCTION public.enforce_submission_insert_defaults()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Admins can set anything
  IF auth.uid() IS NOT NULL AND public.has_role(auth.uid(), 'admin'::app_role) THEN
    RETURN NEW;
  END IF;

  -- Force safe defaults on internal workflow fields for public submissions
  NEW.status := 'nouveau';
  NEW.priority := 'normal';
  NEW.internal_notes := '';
  NEW.dompe_number := '';
  NEW.visible_to_entrepreneur := false;
  NEW.show_on_admin_map := true;
  NEW.assigned_entrepreneur := NULL;
  NEW.geocoding_status := 'pending';
  NEW.geocoding_provider := 'nominatim';
  NEW.formatted_address := NULL;
  NEW.place_id := NULL;
  NEW.location_type := NULL;
  NEW.latitude := NULL;
  NEW.longitude := NULL;
  NEW.postal_latitude := NULL;
  NEW.postal_longitude := NULL;
  NEW.latitude_old := NULL;
  NEW.longitude_old := NULL;
  NEW.postal_latitude_old := NULL;
  NEW.postal_longitude_old := NULL;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS submissions_enforce_insert_defaults ON public.submissions;
CREATE TRIGGER submissions_enforce_insert_defaults
BEFORE INSERT ON public.submissions
FOR EACH ROW
EXECUTE FUNCTION public.enforce_submission_insert_defaults();

-- 4. Fix mutable search_path on pgmq wrapper / dlq functions
CREATE OR REPLACE FUNCTION public.enqueue_email(queue_name text, payload jsonb)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pgmq'
AS $$
BEGIN
  RETURN pgmq.send(queue_name, payload);
EXCEPTION WHEN undefined_table THEN
  PERFORM pgmq.create(queue_name);
  RETURN pgmq.send(queue_name, payload);
END;
$$;

CREATE OR REPLACE FUNCTION public.read_email_batch(queue_name text, batch_size integer, vt integer)
RETURNS TABLE(msg_id bigint, read_ct integer, message jsonb)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pgmq'
AS $$
BEGIN
  RETURN QUERY SELECT r.msg_id, r.read_ct, r.message FROM pgmq.read(queue_name, vt, batch_size) r;
EXCEPTION WHEN undefined_table THEN
  PERFORM pgmq.create(queue_name);
  RETURN;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_email(queue_name text, message_id bigint)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pgmq'
AS $$
BEGIN
  RETURN pgmq.delete(queue_name, message_id);
EXCEPTION WHEN undefined_table THEN
  RETURN FALSE;
END;
$$;

CREATE OR REPLACE FUNCTION public.move_to_dlq(source_queue text, dlq_name text, message_id bigint, payload jsonb)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pgmq'
AS $$
DECLARE new_id BIGINT;
BEGIN
  SELECT pgmq.send(dlq_name, payload) INTO new_id;
  PERFORM pgmq.delete(source_queue, message_id);
  RETURN new_id;
EXCEPTION WHEN undefined_table THEN
  BEGIN
    PERFORM pgmq.create(dlq_name);
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
  SELECT pgmq.send(dlq_name, payload) INTO new_id;
  BEGIN
    PERFORM pgmq.delete(source_queue, message_id);
  EXCEPTION WHEN undefined_table THEN
    NULL;
  END;
  RETURN new_id;
END;
$$;

-- 5. Revoke EXECUTE on internal / service-only functions from anon/authenticated
-- (these are trigger functions or service-role-only helpers; should not be callable via Data API)
REVOKE EXECUTE ON FUNCTION public.enqueue_email(text, jsonb) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.read_email_batch(text, integer, integer) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.delete_email(text, bigint) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.move_to_dlq(text, text, bigint, jsonb) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.assign_dompe_number() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sync_visible_to_entrepreneur() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.log_submission_changes() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.log_custom_value_changes() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.touch_lead_statuses_updated_at() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.touch_custom_fields_updated_at() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.current_user_email() FROM anon;
REVOKE EXECUTE ON FUNCTION public.enforce_submission_insert_defaults() FROM anon, authenticated;

-- 6. Storage: tighten lead-photos bucket
UPDATE storage.buckets
SET file_size_limit = 10485760, -- 10 MB
    allowed_mime_types = ARRAY['image/jpeg','image/png','image/webp','image/heic','image/heif']
WHERE id = 'lead-photos';

-- Drop the old wide-open upload policy
DROP POLICY IF EXISTS "Anyone can upload lead photos" ON storage.objects;

-- Re-create with stricter constraints: only into the lead-photos bucket AND under a 'submissions/' path
CREATE POLICY "Public can upload lead photos under submissions prefix"
ON storage.objects
FOR INSERT
TO anon, authenticated
WITH CHECK (
  bucket_id = 'lead-photos'
  AND (storage.foldername(name))[1] = 'submissions'
);

-- Admin management of lead photos (DELETE / UPDATE)
CREATE POLICY "Admins can update lead photos"
ON storage.objects
FOR UPDATE
TO authenticated
USING (bucket_id = 'lead-photos' AND public.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (bucket_id = 'lead-photos' AND public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete lead photos"
ON storage.objects
FOR DELETE
TO authenticated
USING (bucket_id = 'lead-photos' AND public.has_role(auth.uid(), 'admin'::app_role));

-- 7. Allow entrepreneurs to read their own trips
CREATE POLICY "Entrepreneurs can read their own trips"
ON public.lead_trips
FOR SELECT
TO authenticated
USING (
  entrepreneur_id IN (
    SELECT id FROM public.entrepreneurs WHERE user_id = auth.uid()
  )
);
