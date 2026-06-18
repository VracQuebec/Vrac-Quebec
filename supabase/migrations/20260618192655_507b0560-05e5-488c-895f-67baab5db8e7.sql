DROP POLICY IF EXISTS "Public can upload lead photos under submissions prefix" ON storage.objects;
CREATE POLICY "Public can upload lead photos under submissions prefix"
ON storage.objects
FOR INSERT
TO anon, authenticated
WITH CHECK (
  bucket_id = 'lead-photos'
  AND (storage.foldername(name))[1] = 'submissions'
);