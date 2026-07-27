-- Remove entrepreneur self-read access to admin-only CRM columns
-- (internal_notes, partner_status, pricing). The app never reads this
-- table from the entrepreneur side; only admins manage it.
DROP POLICY IF EXISTS "Entrepreneurs read own profile" ON public.entrepreneur_profiles;