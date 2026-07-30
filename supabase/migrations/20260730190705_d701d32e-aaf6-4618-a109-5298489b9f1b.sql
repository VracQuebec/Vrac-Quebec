
-- 1) Membres d'entreprise (multi-entreprises)
CREATE TABLE public.jsc_company_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.jsc_companies(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  email text,
  full_name text,
  role text NOT NULL DEFAULT 'employee',
  is_active boolean NOT NULL DEFAULT true,
  archived_at timestamptz,
  archived_by uuid,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, user_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.jsc_company_members TO authenticated;
GRANT ALL ON public.jsc_company_members TO service_role;
ALTER TABLE public.jsc_company_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage company members"
ON public.jsc_company_members FOR ALL TO authenticated
USING (public.jsc_can_manage(auth.uid()))
WITH CHECK (public.jsc_can_manage(auth.uid()));

CREATE POLICY "Members read their own membership"
ON public.jsc_company_members FOR SELECT TO authenticated
USING (user_id = auth.uid());

-- 2) Permissions par rôle (matrice configurable)
CREATE TABLE public.jsc_role_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES public.jsc_companies(id) ON DELETE CASCADE,
  role text NOT NULL,
  module text NOT NULL,
  can_view boolean NOT NULL DEFAULT true,
  can_edit boolean NOT NULL DEFAULT false,
  can_delete boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  archived_at timestamptz,
  archived_by uuid,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.jsc_role_permissions TO authenticated;
GRANT ALL ON public.jsc_role_permissions TO service_role;
ALTER TABLE public.jsc_role_permissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage role permissions"
ON public.jsc_role_permissions FOR ALL TO authenticated
USING (public.jsc_can_manage(auth.uid()))
WITH CHECK (public.jsc_can_manage(auth.uid()));

CREATE POLICY "Authenticated read role permissions"
ON public.jsc_role_permissions FOR SELECT TO authenticated
USING (true);

CREATE TRIGGER jsc_company_members_touch
BEFORE UPDATE ON public.jsc_company_members
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TRIGGER jsc_role_permissions_touch
BEFORE UPDATE ON public.jsc_role_permissions
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TRIGGER jsc_company_members_audit
AFTER INSERT OR UPDATE OR DELETE ON public.jsc_company_members
FOR EACH ROW EXECUTE FUNCTION public.jsc_audit_trigger();

CREATE TRIGGER jsc_role_permissions_audit
AFTER INSERT OR UPDATE OR DELETE ON public.jsc_role_permissions
FOR EACH ROW EXECUTE FUNCTION public.jsc_audit_trigger();

-- 3) Rôle effectif d'un utilisateur dans une entreprise
CREATE OR REPLACE FUNCTION public.jsc_company_role(_user_id uuid, _company_id uuid)
RETURNS text
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN public.has_role(_user_id, 'admin') THEN 'super_admin'
    ELSE (
      SELECT role FROM public.jsc_company_members
      WHERE user_id = _user_id AND company_id = _company_id
        AND is_active = true AND archived_at IS NULL
      LIMIT 1
    )
  END
$$;

-- 4) Statistiques du tableau de bord
CREATE OR REPLACE FUNCTION public.jsc_dashboard_stats(_company_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cid uuid := COALESCE(_company_id, public.jsc_default_company_id());
  today date := (now() AT TIME ZONE 'America/Toronto')::date;
  result jsonb;
BEGIN
  IF NOT public.jsc_can_manage(auth.uid())
     AND public.jsc_company_role(auth.uid(), cid) IS NULL THEN
    RAISE EXCEPTION 'Accès refusé';
  END IF;

  SELECT jsonb_build_object(
    'company_id', cid,
    'requests_today', (SELECT count(*) FROM jsc_requests r WHERE r.company_id = cid AND r.archived_at IS NULL AND (r.created_at AT TIME ZONE 'America/Toronto')::date = today),
    'estimates_today', (SELECT count(*) FROM jsc_estimates e WHERE e.company_id = cid AND (e.created_at AT TIME ZONE 'America/Toronto')::date = today),
    'quotes_sent_today', (SELECT count(*) FROM jsc_quotes q WHERE q.company_id = cid AND q.archived_at IS NULL AND (q.sent_at AT TIME ZONE 'America/Toronto')::date = today),
    'orders_today', (SELECT count(*) FROM jsc_orders o WHERE o.company_id = cid AND o.archived_at IS NULL AND (o.created_at AT TIME ZONE 'America/Toronto')::date = today),
    'deliveries_today', (SELECT count(*) FROM jsc_orders o WHERE o.company_id = cid AND o.archived_at IS NULL AND o.scheduled_date = today),
    'new_clients_today', (SELECT count(*) FROM jsc_clients c WHERE c.company_id = cid AND c.archived_at IS NULL AND (c.created_at AT TIME ZONE 'America/Toronto')::date = today),
    'revenue_month', (SELECT COALESCE(sum(i.total),0) FROM jsc_invoices i WHERE i.company_id = cid AND i.archived_at IS NULL AND i.issued_at >= date_trunc('month', today)::date),
    'revenue_year', (SELECT COALESCE(sum(i.total),0) FROM jsc_invoices i WHERE i.company_id = cid AND i.archived_at IS NULL AND i.issued_at >= date_trunc('year', today)::date),
    'outstanding_balance', (SELECT COALESCE(sum(i.total - COALESCE(i.amount_paid,0)),0) FROM jsc_invoices i WHERE i.company_id = cid AND i.archived_at IS NULL AND i.status <> 'paid'),
    'requests_pending', (SELECT count(*) FROM jsc_requests r WHERE r.company_id = cid AND r.archived_at IS NULL AND COALESCE(r.status,'nouvelle') IN ('nouvelle','en_analyse','a_rappeler')),
    'quotes_pending', (SELECT count(*) FROM jsc_quotes q WHERE q.company_id = cid AND q.archived_at IS NULL AND COALESCE(q.status,'brouillon') IN ('brouillon','envoyee')),
    'orders_to_plan', (SELECT count(*) FROM jsc_orders o WHERE o.company_id = cid AND o.archived_at IS NULL AND (o.scheduled_date IS NULL OR COALESCE(o.status,'a_planifier') = 'a_planifier')),
    'clients_total', (SELECT count(*) FROM jsc_clients c WHERE c.company_id = cid AND c.archived_at IS NULL)
  ) INTO result;

  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.jsc_dashboard_stats(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.jsc_dashboard_stats(uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.jsc_company_role(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.jsc_company_role(uuid, uuid) TO authenticated, service_role;

-- 5) Matrice de permissions par défaut (modifiable en administration)
INSERT INTO public.jsc_role_permissions (company_id, role, module, can_view, can_edit, can_delete, sort_order)
SELECT NULL, r.role, m.module,
       true,
       r.role IN ('super_admin','admin') OR (r.role = 'dispatcher' AND m.module IN ('requests','orders','fleet')) OR (r.role = 'sales' AND m.module IN ('requests','quotes','clients')),
       r.role IN ('super_admin','admin'),
       r.ord * 100 + m.ord
FROM (VALUES ('super_admin',1),('admin',2),('dispatcher',3),('sales',4),('employee',5),('driver',6),('entrepreneur',7)) AS r(role, ord)
CROSS JOIN (VALUES ('dashboard',1),('catalog',2),('suppliers',3),('fleet',4),('rates',5),('clients',6),('requests',7),('quotes',8),('orders',9),('invoices',10),('settings',11),('audit',12)) AS m(module, ord);
