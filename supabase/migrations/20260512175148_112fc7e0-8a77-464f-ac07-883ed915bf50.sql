-- Remove manual approval requirement for entrepreneurs
ALTER TABLE public.user_roles ALTER COLUMN approved SET DEFAULT true;
UPDATE public.user_roles SET approved = true WHERE approved = false;

-- Make is_approved_entrepreneur simply check role presence (kept for compatibility with RPCs and policies)
CREATE OR REPLACE FUNCTION public.is_approved_entrepreneur(_uid uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _uid AND role = 'entrepreneur'
  )
$$;