
-- Add new columns to submissions
ALTER TABLE public.submissions
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'nouveau',
  ADD COLUMN IF NOT EXISTS request_type text NOT NULL DEFAULT 'livraison',
  ADD COLUMN IF NOT EXISTS deliver_or_remove text,
  ADD COLUMN IF NOT EXISTS contamination text,
  ADD COLUMN IF NOT EXISTS photos text[] DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS length_ft text,
  ADD COLUMN IF NOT EXISTS width_ft text,
  ADD COLUMN IF NOT EXISTS depth_in text,
  ADD COLUMN IF NOT EXISTS assigned_entrepreneur uuid;

-- Allow admins to UPDATE submissions
DROP POLICY IF EXISTS "Admins can update submissions" ON public.submissions;
CREATE POLICY "Admins can update submissions"
  ON public.submissions FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Lead notes table
CREATE TABLE IF NOT EXISTS public.lead_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id uuid NOT NULL REFERENCES public.submissions(id) ON DELETE CASCADE,
  author_id uuid NOT NULL,
  author_email text,
  note text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.lead_notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can read lead notes" ON public.lead_notes;
CREATE POLICY "Admins can read lead notes"
  ON public.lead_notes FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins can insert lead notes" ON public.lead_notes;
CREATE POLICY "Admins can insert lead notes"
  ON public.lead_notes FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin') AND author_id = auth.uid());

DROP POLICY IF EXISTS "Admins can delete lead notes" ON public.lead_notes;
CREATE POLICY "Admins can delete lead notes"
  ON public.lead_notes FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX IF NOT EXISTS idx_lead_notes_submission ON public.lead_notes(submission_id, created_at DESC);

-- Allow admins to manage user_roles
DROP POLICY IF EXISTS "Admins can insert roles" ON public.user_roles;
CREATE POLICY "Admins can insert roles"
  ON public.user_roles FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins can delete roles" ON public.user_roles;
CREATE POLICY "Admins can delete roles"
  ON public.user_roles FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Storage bucket for lead photos
INSERT INTO storage.buckets (id, name, public)
VALUES ('lead-photos', 'lead-photos', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Public can view lead photos" ON storage.objects;
CREATE POLICY "Public can view lead photos"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'lead-photos');

DROP POLICY IF EXISTS "Anyone can upload lead photos" ON storage.objects;
CREATE POLICY "Anyone can upload lead photos"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'lead-photos');

-- Anonymized leads function for entrepreneurs
CREATE OR REPLACE FUNCTION public.get_entrepreneur_leads()
RETURNS TABLE (
  id uuid,
  submission_number integer,
  materials text[],
  other_material text,
  request_type text,
  property_type text,
  quantity text,
  tonnage text,
  deliver_or_remove text,
  contamination text,
  status text,
  postal_prefix text,
  latitude double precision,
  longitude double precision,
  description text,
  created_at timestamptz,
  is_assigned boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    s.id,
    s.submission_number,
    s.materials,
    s.other_material,
    s.request_type,
    s.property_type,
    s.quantity,
    s.tonnage,
    s.deliver_or_remove,
    s.contamination,
    s.status,
    LEFT(COALESCE(s.postal_code, ''), 3) AS postal_prefix,
    ROUND(s.latitude::numeric, 2)::double precision AS latitude,
    ROUND(s.longitude::numeric, 2)::double precision AS longitude,
    s.description,
    s.created_at,
    (s.assigned_entrepreneur IS NOT NULL) AS is_assigned
  FROM public.submissions s
  WHERE
    public.has_role(auth.uid(), 'entrepreneur'::public.app_role)
    AND s.status NOT IN ('perdu', 'gagné', 'archivé')
$$;

REVOKE ALL ON FUNCTION public.get_entrepreneur_leads() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_entrepreneur_leads() TO authenticated;

-- Helper for admins: list all auth users with their roles (for entrepreneur management)
CREATE OR REPLACE FUNCTION public.list_users_with_roles()
RETURNS TABLE (user_id uuid, email text, roles app_role[])
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT u.id, u.email::text, COALESCE(array_agg(ur.role) FILTER (WHERE ur.role IS NOT NULL), '{}')
  FROM auth.users u
  LEFT JOIN public.user_roles ur ON ur.user_id = u.id
  WHERE public.has_role(auth.uid(), 'admin'::public.app_role)
  GROUP BY u.id, u.email
  ORDER BY u.email
$$;

REVOKE ALL ON FUNCTION public.list_users_with_roles() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_users_with_roles() TO authenticated;
