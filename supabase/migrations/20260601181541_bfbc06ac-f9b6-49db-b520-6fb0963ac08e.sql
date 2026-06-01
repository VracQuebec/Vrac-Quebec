-- Tighten overly-permissive public INSERT policy on submissions.
-- The BEFORE INSERT trigger enforce_submission_insert_defaults already sanitizes
-- privileged fields for non-admin inserts; WITH CHECK validates the post-trigger row.
DROP POLICY IF EXISTS "Anyone can submit a request" ON public.submissions;

CREATE POLICY "Anyone can submit a request"
ON public.submissions
FOR INSERT
TO anon, authenticated
WITH CHECK (
  -- Admins may insert anything (trigger short-circuits for them)
  (auth.uid() IS NOT NULL AND public.has_role(auth.uid(), 'admin'::public.app_role))
  OR (
    -- Public submissions must match the sanitized shape enforced by the trigger
    creation_origin = 'public_form'
    AND status = 'nouveau'
    AND priority = 'normal'
    AND visible_to_entrepreneur = false
    AND assigned_entrepreneur IS NULL
    AND created_by IS NULL
    AND lead_source IS NULL
    AND lead_category IS NULL
    AND latitude IS NULL
    AND longitude IS NULL
  )
);