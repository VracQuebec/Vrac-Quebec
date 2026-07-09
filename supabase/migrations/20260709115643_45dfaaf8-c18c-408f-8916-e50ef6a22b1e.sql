-- Blacklist feature: allows admins to block entrepreneurs, dompes, or clients
-- with reasons and full audit history.

CREATE TABLE IF NOT EXISTS public.blacklist_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type TEXT NOT NULL CHECK (entity_type IN ('entrepreneur', 'dompe', 'client')),
  entity_id UUID NOT NULL,
  -- Denormalized display info to keep list usable even if source row changes
  entity_label TEXT,
  reasons TEXT[] NOT NULL DEFAULT '{}',
  note TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  blocked_by UUID REFERENCES auth.users(id),
  blocked_by_email TEXT,
  blocked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  unblocked_by UUID REFERENCES auth.users(id),
  unblocked_by_email TEXT,
  unblocked_at TIMESTAMPTZ,
  unblock_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_blacklist_entity ON public.blacklist_entries(entity_type, entity_id) WHERE active = true;
CREATE UNIQUE INDEX IF NOT EXISTS uq_blacklist_active ON public.blacklist_entries(entity_type, entity_id) WHERE active = true;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.blacklist_entries TO authenticated;
GRANT ALL ON public.blacklist_entries TO service_role;

ALTER TABLE public.blacklist_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view blacklist"
  ON public.blacklist_entries FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can insert blacklist"
  ON public.blacklist_entries FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update blacklist"
  ON public.blacklist_entries FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete blacklist"
  ON public.blacklist_entries FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER touch_blacklist_updated_at
  BEFORE UPDATE ON public.blacklist_entries
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- History log: every block/unblock action, immutable
CREATE TABLE IF NOT EXISTS public.blacklist_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id UUID REFERENCES public.blacklist_entries(id) ON DELETE SET NULL,
  entity_type TEXT NOT NULL,
  entity_id UUID NOT NULL,
  entity_label TEXT,
  action TEXT NOT NULL CHECK (action IN ('block', 'unblock', 'update')),
  reasons TEXT[] DEFAULT '{}',
  note TEXT,
  actor_id UUID REFERENCES auth.users(id),
  actor_email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_blacklist_history_entity ON public.blacklist_history(entity_type, entity_id, created_at DESC);

GRANT SELECT, INSERT ON public.blacklist_history TO authenticated;
GRANT ALL ON public.blacklist_history TO service_role;

ALTER TABLE public.blacklist_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view blacklist history"
  ON public.blacklist_history FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can insert blacklist history"
  ON public.blacklist_history FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- Helper: check if an entity is currently blacklisted
CREATE OR REPLACE FUNCTION public.is_blacklisted(_entity_type TEXT, _entity_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.blacklist_entries
    WHERE entity_type = _entity_type
      AND entity_id = _entity_id
      AND active = true
  )
$$;

-- Update is_approved_entrepreneur to also exclude blacklisted entrepreneurs
CREATE OR REPLACE FUNCTION public.is_approved_entrepreneur(_uid uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    LEFT JOIN public.entrepreneur_profiles ep ON ep.user_id = ur.user_id
    WHERE ur.user_id = _uid
      AND ur.role = 'entrepreneur'
      AND ur.approved = true
      AND NOT EXISTS (
        SELECT 1 FROM public.blacklist_entries be
        WHERE be.active = true
          AND (
            (be.entity_type = 'entrepreneur' AND be.entity_id = ur.user_id)
            OR (ep.id IS NOT NULL AND be.entity_type = 'entrepreneur' AND be.entity_id = ep.id)
          )
      )
  )
$$;
