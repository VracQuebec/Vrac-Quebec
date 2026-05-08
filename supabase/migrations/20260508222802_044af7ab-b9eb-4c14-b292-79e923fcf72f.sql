-- 1) Add approval column on user_roles
ALTER TABLE public.user_roles
  ADD COLUMN IF NOT EXISTS approved boolean NOT NULL DEFAULT false;

-- Backfill: existing admins and entrepreneurs are considered approved
UPDATE public.user_roles SET approved = true WHERE role IN ('admin', 'entrepreneur');

-- 2) Helper function: approved entrepreneur check
CREATE OR REPLACE FUNCTION public.is_approved_entrepreneur(_uid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _uid AND role = 'entrepreneur' AND approved = true
  )
$$;

-- 3) Replace get_entrepreneur_leads: anonymized coords (~1 km), restricted fields, approval gate
DROP FUNCTION IF EXISTS public.get_entrepreneur_leads();

CREATE OR REPLACE FUNCTION public.get_entrepreneur_leads()
RETURNS TABLE(
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
  priority text,
  postal_prefix text,
  latitude double precision,
  longitude double precision,
  machinery_available boolean,
  machinery_description text,
  accessibility text[],
  created_at timestamp with time zone,
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
    s.priority,
    LEFT(COALESCE(s.postal_code, ''), 3) AS postal_prefix,
    -- Deterministic per-submission offset within roughly 1 km
    CASE WHEN s.latitude IS NULL THEN NULL
      ELSE ROUND((s.latitude
        + ((mod(abs(hashtext(s.id::text || 'lat')), 2001) - 1000) / 1000.0) * 0.009
      )::numeric, 4)::double precision
    END AS latitude,
    CASE WHEN s.longitude IS NULL THEN NULL
      ELSE ROUND((s.longitude
        + ((mod(abs(hashtext(s.id::text || 'lng')), 2001) - 1000) / 1000.0) * 0.013
      )::numeric, 4)::double precision
    END AS longitude,
    s.machinery_available,
    s.machinery_description,
    s.accessibility,
    s.created_at,
    (s.assigned_entrepreneur IS NOT NULL) AS is_assigned
  FROM public.submissions s
  WHERE
    public.is_approved_entrepreneur(auth.uid())
    AND s.status NOT IN ('perdu', 'gagné', 'archivé')
    AND COALESCE(s.visible_to_entrepreneur, false) = true
$$;

-- 4) Allow approved entrepreneurs to read lead statuses (for badge colors)
DROP POLICY IF EXISTS "Entrepreneurs can read lead_statuses" ON public.lead_statuses;
CREATE POLICY "Entrepreneurs can read lead_statuses"
  ON public.lead_statuses FOR SELECT
  TO authenticated
  USING (public.is_approved_entrepreneur(auth.uid()));

-- 5) Update list_users_with_roles to include approval flag (admins-only function)
DROP FUNCTION IF EXISTS public.list_users_with_roles();

CREATE OR REPLACE FUNCTION public.list_users_with_roles()
RETURNS TABLE(user_id uuid, email text, roles app_role[], approved boolean, created_at timestamp with time zone)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    u.id,
    u.email::text,
    COALESCE(array_agg(ur.role) FILTER (WHERE ur.role IS NOT NULL), '{}') AS roles,
    bool_or(COALESCE(ur.approved, false)) AS approved,
    u.created_at
  FROM auth.users u
  LEFT JOIN public.user_roles ur ON ur.user_id = u.id
  WHERE public.has_role(auth.uid(), 'admin'::public.app_role)
  GROUP BY u.id, u.email, u.created_at
  ORDER BY u.created_at DESC
$$;