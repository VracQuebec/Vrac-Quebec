-- 1) jsc_public_requests: partners only see published, open, active, non-archived requests
DROP POLICY IF EXISTS "Partners read open network requests" ON public.jsc_public_requests;

CREATE POLICY "Partners read open network requests"
ON public.jsc_public_requests
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR auth.uid() = created_by
  OR (
    (has_role(auth.uid(), 'transporteur'::app_role) OR is_approved_entrepreneur(auth.uid()))
    AND is_active
    AND archived_at IS NULL
    AND status = 'open'
    AND visibility = 'network'
  )
);

-- 2) Function search_path hardening
ALTER FUNCTION public.seo_validate_page_fields(text, text, text, text, text, text, boolean)
  SET search_path = public, pg_temp;

-- 3) lead-photos: anonymous uploads confined to submissions/<uuid>/<file>
DROP POLICY IF EXISTS "Public can upload lead photos under submissions prefix" ON storage.objects;

CREATE POLICY "Public can upload lead photos under submissions prefix"
ON storage.objects
FOR INSERT
TO anon, authenticated
WITH CHECK (
  bucket_id = 'lead-photos'
  AND (storage.foldername(name))[1] = 'submissions'
  AND (storage.foldername(name))[2] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  AND array_length(storage.foldername(name), 1) = 2
  AND storage.filename(name) ~* '^[a-z0-9._-]{1,80}\.(jpg|jpeg|png|webp|heic|heif)$'
);