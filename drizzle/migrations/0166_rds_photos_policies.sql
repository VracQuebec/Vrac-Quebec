CREATE OR REPLACE FUNCTION public.rds_photo_ok(_name text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT CASE WHEN split_part(_name,'/',1) ~ '^[0-9a-f-]{36}$' THEN public.fleet_can_access(split_part(_name,'/',1)::uuid) ELSE false END
$$;
CREATE POLICY "rds photos read" ON storage.objects FOR SELECT TO authenticated USING (bucket_id='rds-photos' AND public.rds_photo_ok(name));
CREATE POLICY "rds photos write" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id='rds-photos' AND public.rds_photo_ok(name));