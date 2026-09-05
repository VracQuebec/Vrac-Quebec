-- ============================================================
-- ARCHITECTURE SUPER ADMIN / MULTI-ENTREPRISES — GESTION DE LA FLOTTE
-- ============================================================

-- 1. Journal : entreprise concernée + origine de l'action
ALTER TABLE public.crm_audit_log
  ADD COLUMN IF NOT EXISTS company_id uuid,
  ADD COLUMN IF NOT EXISTS origin text NOT NULL DEFAULT 'entreprise';

DO $$ BEGIN
  ALTER TABLE public.crm_audit_log
    ADD CONSTRAINT crm_audit_log_origin_check
    CHECK (origin IN ('entreprise', 'support_vrac_quebec'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_crm_audit_company ON public.crm_audit_log(company_id, created_at DESC);

-- 2. Rôles au niveau entreprise
CREATE OR REPLACE FUNCTION public.fleet_member_role(_company_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT m.role
  FROM public.jsc_company_members m
  WHERE m.company_id = _company_id
    AND m.user_id = auth.uid()
    AND m.is_active = true
    AND m.archived_at IS NULL
  LIMIT 1
$$;

-- Écriture « opérationnelle » : entretiens, réparations, inspections, travaux, compteurs
CREATE OR REPLACE FUNCTION public.fleet_can_manage(_company_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_role(auth.uid(), 'admin')
      OR public.fleet_member_role(_company_id) IN
         ('proprietaire', 'admin', 'gestionnaire', 'mecanicien')
$$;

-- Administration de l'entreprise : unités, dépenses, programmes, gabarits, pièces
CREATE OR REPLACE FUNCTION public.fleet_can_administer(_company_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_role(auth.uid(), 'admin')
      OR public.fleet_member_role(_company_id) IN
         ('proprietaire', 'admin', 'gestionnaire')
$$;

REVOKE EXECUTE ON FUNCTION public.fleet_member_role(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.fleet_can_manage(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.fleet_can_administer(uuid) FROM anon;

-- 3. Journal accessible aux membres de l'entreprise concernée
DROP POLICY IF EXISTS "crm_audit_log_company_read" ON public.crm_audit_log;
CREATE POLICY "crm_audit_log_company_read" ON public.crm_audit_log
  FOR SELECT TO authenticated
  USING (company_id IS NOT NULL AND public.fleet_can_access(company_id));

DROP POLICY IF EXISTS "crm_audit_log_company_insert" ON public.crm_audit_log;
CREATE POLICY "crm_audit_log_company_insert" ON public.crm_audit_log
  FOR INSERT TO authenticated
  WITH CHECK (company_id IS NOT NULL AND public.fleet_can_access(company_id));

-- 4. Les membres voient la fiche de leur entreprise
DROP POLICY IF EXISTS "jsc_companies_member_read" ON public.jsc_companies;
CREATE POLICY "jsc_companies_member_read" ON public.jsc_companies
  FOR SELECT TO authenticated
  USING (public.fleet_can_access(id));

-- 5. Unités (trucks) : accès par entreprise en plus de l'administration
DROP POLICY IF EXISTS "trucks_company_read" ON public.trucks;
CREATE POLICY "trucks_company_read" ON public.trucks
  FOR SELECT TO authenticated
  USING (public.fleet_can_access(company_id));

DROP POLICY IF EXISTS "trucks_company_write" ON public.trucks;
CREATE POLICY "trucks_company_write" ON public.trucks
  FOR INSERT TO authenticated
  WITH CHECK (public.fleet_can_administer(company_id));

DROP POLICY IF EXISTS "trucks_company_update" ON public.trucks;
CREATE POLICY "trucks_company_update" ON public.trucks
  FOR UPDATE TO authenticated
  USING (public.fleet_can_administer(company_id))
  WITH CHECK (public.fleet_can_administer(company_id));

DROP POLICY IF EXISTS "trucks_company_delete" ON public.trucks;
CREATE POLICY "trucks_company_delete" ON public.trucks
  FOR DELETE TO authenticated
  USING (public.fleet_can_administer(company_id));

-- 6. Tables opérationnelles : lecture pour tous les membres, écriture selon le rôle
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['fleet_maintenance','fleet_repairs','fleet_inspections','fleet_work_items','fleet_meter_readings','fleet_costs'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_company', t);
    EXECUTE format($p$DROP POLICY IF EXISTS "%s_read" ON public.%I$p$, t, t);
    EXECUTE format($p$CREATE POLICY "%s_read" ON public.%I FOR SELECT TO authenticated USING (public.fleet_can_access(company_id))$p$, t, t);
    EXECUTE format($p$DROP POLICY IF EXISTS "%s_write" ON public.%I$p$, t, t);
    EXECUTE format($p$CREATE POLICY "%s_write" ON public.%I FOR INSERT TO authenticated WITH CHECK (public.fleet_can_manage(company_id))$p$, t, t);
    EXECUTE format($p$DROP POLICY IF EXISTS "%s_update" ON public.%I$p$, t, t);
    EXECUTE format($p$CREATE POLICY "%s_update" ON public.%I FOR UPDATE TO authenticated USING (public.fleet_can_manage(company_id)) WITH CHECK (public.fleet_can_manage(company_id))$p$, t, t);
    EXECUTE format($p$DROP POLICY IF EXISTS "%s_delete" ON public.%I$p$, t, t);
    EXECUTE format($p$CREATE POLICY "%s_delete" ON public.%I FOR DELETE TO authenticated USING (public.fleet_can_manage(company_id))$p$, t, t);
  END LOOP;

  -- Tables administratives : écriture réservée aux rôles d'administration
  FOREACH t IN ARRAY ARRAY['fleet_parts','fleet_part_refs','fleet_expenses','fleet_service_programs','fleet_inspection_templates'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_company', t);
    EXECUTE format($p$DROP POLICY IF EXISTS "%s_read" ON public.%I$p$, t, t);
    EXECUTE format($p$CREATE POLICY "%s_read" ON public.%I FOR SELECT TO authenticated USING (public.fleet_can_access(company_id))$p$, t, t);
    EXECUTE format($p$DROP POLICY IF EXISTS "%s_write" ON public.%I$p$, t, t);
    EXECUTE format($p$CREATE POLICY "%s_write" ON public.%I FOR INSERT TO authenticated WITH CHECK (public.fleet_can_administer(company_id))$p$, t, t);
    EXECUTE format($p$DROP POLICY IF EXISTS "%s_update" ON public.%I$p$, t, t);
    EXECUTE format($p$CREATE POLICY "%s_update" ON public.%I FOR UPDATE TO authenticated USING (public.fleet_can_administer(company_id)) WITH CHECK (public.fleet_can_administer(company_id))$p$, t, t);
    EXECUTE format($p$DROP POLICY IF EXISTS "%s_delete" ON public.%I$p$, t, t);
    EXECUTE format($p$CREATE POLICY "%s_delete" ON public.%I FOR DELETE TO authenticated USING (public.fleet_can_administer(company_id))$p$, t, t);
  END LOOP;
END $$;

-- 7. Chauffeur : peut saisir une inspection et un relevé de compteur de son entreprise
DROP POLICY IF EXISTS "fleet_inspections_driver_insert" ON public.fleet_inspections;
CREATE POLICY "fleet_inspections_driver_insert" ON public.fleet_inspections
  FOR INSERT TO authenticated
  WITH CHECK (public.fleet_can_access(company_id));

DROP POLICY IF EXISTS "fleet_meter_readings_driver_insert" ON public.fleet_meter_readings;
CREATE POLICY "fleet_meter_readings_driver_insert" ON public.fleet_meter_readings
  FOR INSERT TO authenticated
  WITH CHECK (public.fleet_can_access(company_id));

-- 8. Comptabilité : peut saisir une dépense
DROP POLICY IF EXISTS "fleet_expenses_accounting_insert" ON public.fleet_expenses;
CREATE POLICY "fleet_expenses_accounting_insert" ON public.fleet_expenses
  FOR INSERT TO authenticated
  WITH CHECK (public.fleet_member_role(company_id) = 'comptabilite' OR public.fleet_can_administer(company_id));
