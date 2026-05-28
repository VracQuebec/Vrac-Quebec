
-- Backup colonnes existantes (non destructif)
ALTER TABLE public.submissions
  ADD COLUMN IF NOT EXISTS latitude_old double precision,
  ADD COLUMN IF NOT EXISTS longitude_old double precision,
  ADD COLUMN IF NOT EXISTS postal_latitude_old double precision,
  ADD COLUMN IF NOT EXISTS postal_longitude_old double precision,
  ADD COLUMN IF NOT EXISTS formatted_address text,
  ADD COLUMN IF NOT EXISTS place_id text,
  ADD COLUMN IF NOT EXISTS location_type text,
  ADD COLUMN IF NOT EXISTS geocoding_provider text DEFAULT 'nominatim';

-- Copier les anciennes coords vers _old (une seule fois, là où _old est NULL)
UPDATE public.submissions
SET
  latitude_old = latitude,
  longitude_old = longitude,
  postal_latitude_old = postal_latitude,
  postal_longitude_old = postal_longitude
WHERE latitude_old IS NULL AND longitude_old IS NULL
  AND (latitude IS NOT NULL OR longitude IS NOT NULL OR postal_latitude IS NOT NULL OR postal_longitude IS NOT NULL);

-- Marquer toutes les lignes existantes comme à re-géocoder via Google
UPDATE public.submissions
SET geocoding_status = 'pending'
WHERE geocoding_provider IS DISTINCT FROM 'google';
