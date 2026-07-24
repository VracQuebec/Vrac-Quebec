
-- 1. Ajouter les colonnes 360° manquantes (idempotent)
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS assignee_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS status_label text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS is_favorite boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS archived_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_activity_at timestamptz,
  ADD COLUMN IF NOT EXISTS merged_into_id uuid REFERENCES public.clients(id) ON DELETE SET NULL;

ALTER TABLE public.carriers
  ADD COLUMN IF NOT EXISTS tags text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS assignee_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS status_label text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS is_favorite boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS archived_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_activity_at timestamptz,
  ADD COLUMN IF NOT EXISTS merged_into_id uuid REFERENCES public.carriers(id) ON DELETE SET NULL;

ALTER TABLE public.dumps
  ADD COLUMN IF NOT EXISTS tags text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS assignee_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS status_label text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS is_favorite boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS archived_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_activity_at timestamptz,
  ADD COLUMN IF NOT EXISTS merged_into_id uuid REFERENCES public.dumps(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS clients_favorite_idx ON public.clients (is_favorite) WHERE is_favorite;
CREATE INDEX IF NOT EXISTS carriers_favorite_idx ON public.carriers (is_favorite) WHERE is_favorite;
CREATE INDEX IF NOT EXISTS dumps_favorite_idx ON public.dumps (is_favorite) WHERE is_favorite;
CREATE INDEX IF NOT EXISTS clients_archived_idx ON public.clients (archived_at);
CREATE INDEX IF NOT EXISTS carriers_archived_idx ON public.carriers (archived_at);
CREATE INDEX IF NOT EXISTS dumps_archived_idx ON public.dumps (archived_at);
CREATE INDEX IF NOT EXISTS clients_last_activity_idx ON public.clients (last_activity_at DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS carriers_last_activity_idx ON public.carriers (last_activity_at DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS dumps_last_activity_idx ON public.dumps (last_activity_at DESC NULLS LAST);

-- 2. Journal d'audit unifié
CREATE TABLE IF NOT EXISTS public.crm_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_type text NOT NULL CHECK (owner_type IN ('client','carrier','dump','entrepreneur')),
  owner_id uuid NOT NULL,
  action text NOT NULL CHECK (action IN ('create','update','delete','archive','restore','merge','favorite','unfavorite','assign')),
  field text,
  old_value jsonb,
  new_value jsonb,
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_email text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.crm_audit_log TO authenticated;
GRANT ALL ON public.crm_audit_log TO service_role;
ALTER TABLE public.crm_audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read crm_audit_log" ON public.crm_audit_log
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins insert crm_audit_log" ON public.crm_audit_log
  FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE INDEX IF NOT EXISTS crm_audit_owner_idx ON public.crm_audit_log (owner_type, owner_id, created_at DESC);

-- 3. Trigger générique d'audit
CREATE OR REPLACE FUNCTION public.crm_audit_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _owner_type text := TG_ARGV[0];
  _actor uuid := auth.uid();
  _email text;
  _new jsonb;
  _old jsonb;
  _action text;
BEGIN
  BEGIN _email := public.current_user_email(); EXCEPTION WHEN OTHERS THEN _email := NULL; END;

  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.crm_audit_log(owner_type, owner_id, action, new_value, actor_id, actor_email)
    VALUES (_owner_type, NEW.id, 'create', to_jsonb(NEW), _actor, _email);
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO public.crm_audit_log(owner_type, owner_id, action, old_value, actor_id, actor_email)
    VALUES (_owner_type, OLD.id, 'delete', to_jsonb(OLD), _actor, _email);
    RETURN OLD;
  ELSE
    _new := to_jsonb(NEW);
    _old := to_jsonb(OLD);
    IF _new = _old THEN RETURN NEW; END IF;
    _action := 'update';
    IF NEW.archived_at IS DISTINCT FROM OLD.archived_at THEN
      _action := CASE WHEN NEW.archived_at IS NULL THEN 'restore' ELSE 'archive' END;
    ELSIF NEW.is_favorite IS DISTINCT FROM OLD.is_favorite THEN
      _action := CASE WHEN NEW.is_favorite THEN 'favorite' ELSE 'unfavorite' END;
    ELSIF NEW.merged_into_id IS DISTINCT FROM OLD.merged_into_id AND NEW.merged_into_id IS NOT NULL THEN
      _action := 'merge';
    ELSIF NEW.assignee_id IS DISTINCT FROM OLD.assignee_id THEN
      _action := 'assign';
    END IF;
    INSERT INTO public.crm_audit_log(owner_type, owner_id, action, old_value, new_value, actor_id, actor_email)
    VALUES (_owner_type, NEW.id, _action, _old, _new, _actor, _email);
    RETURN NEW;
  END IF;
END;
$$;

DROP TRIGGER IF EXISTS clients_audit ON public.clients;
CREATE TRIGGER clients_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.clients
  FOR EACH ROW EXECUTE FUNCTION public.crm_audit_trigger('client');

DROP TRIGGER IF EXISTS carriers_audit ON public.carriers;
CREATE TRIGGER carriers_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.carriers
  FOR EACH ROW EXECUTE FUNCTION public.crm_audit_trigger('carrier');

DROP TRIGGER IF EXISTS dumps_audit ON public.dumps;
CREATE TRIGGER dumps_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.dumps
  FOR EACH ROW EXECUTE FUNCTION public.crm_audit_trigger('dump');

-- 4. Bump last_activity_at via crm_activities
CREATE OR REPLACE FUNCTION public.crm_activities_bump_owner_last_activity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.owner_type = 'client' THEN
    UPDATE public.clients SET last_activity_at = NEW.created_at WHERE id = NEW.owner_id;
  ELSIF NEW.owner_type = 'carrier' THEN
    UPDATE public.carriers SET last_activity_at = NEW.created_at WHERE id = NEW.owner_id;
  ELSIF NEW.owner_type = 'dump' THEN
    UPDATE public.dumps SET last_activity_at = NEW.created_at WHERE id = NEW.owner_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS crm_activities_bump_last_activity ON public.crm_activities;
CREATE TRIGGER crm_activities_bump_last_activity
  AFTER INSERT ON public.crm_activities
  FOR EACH ROW EXECUTE FUNCTION public.crm_activities_bump_owner_last_activity();

-- 5. RPC: fusion de doublons
CREATE OR REPLACE FUNCTION public.crm_merge_entities(_owner_type text, _source_id uuid, _target_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Réservé aux administrateurs';
  END IF;
  IF _source_id = _target_id THEN RAISE EXCEPTION 'source = target'; END IF;

  -- Rebasculer activités & documents vers la cible
  UPDATE public.crm_activities SET owner_id = _target_id
    WHERE owner_type = _owner_type AND owner_id = _source_id;
  UPDATE public.crm_documents SET owner_id = _target_id
    WHERE owner_type = _owner_type AND owner_id = _source_id;

  IF _owner_type = 'client' THEN
    UPDATE public.submissions SET client_id = _target_id WHERE client_id = _source_id;
    UPDATE public.transport_requests SET client_id = _target_id WHERE client_id = _source_id;
    UPDATE public.payments SET client_id = _target_id WHERE client_id = _source_id;
    UPDATE public.clients SET merged_into_id = _target_id, is_active = false, archived_at = COALESCE(archived_at, now())
      WHERE id = _source_id;
  ELSIF _owner_type = 'carrier' THEN
    UPDATE public.drivers SET carrier_id = _target_id WHERE carrier_id = _source_id;
    UPDATE public.trucks SET carrier_id = _target_id WHERE carrier_id = _source_id;
    UPDATE public.carriers SET merged_into_id = _target_id, is_active = false, archived_at = COALESCE(archived_at, now())
      WHERE id = _source_id;
  ELSIF _owner_type = 'dump' THEN
    UPDATE public.dumps SET merged_into_id = _target_id, is_active = false, archived_at = COALESCE(archived_at, now())
      WHERE id = _source_id;
  ELSE
    RAISE EXCEPTION 'owner_type non supporté: %', _owner_type;
  END IF;
END;
$$;
