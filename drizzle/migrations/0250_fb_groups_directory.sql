CREATE TABLE public.fb_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id text UNIQUE,
  name text NOT NULL,
  transcription_note text,
  captures text[] NOT NULL DEFAULT '{}',
  fb_url text,
  fb_identifier text,
  region text,
  cities text,
  category text,
  language text,
  ad_rules text NOT NULL DEFAULT 'a_verifier',
  allowed_days text,
  min_interval_days integer,
  member_account text,
  internal_notes text,
  status text NOT NULL DEFAULT 'a_verifier',
  name_incomplete boolean NOT NULL DEFAULT false,
  merged_into uuid REFERENCES public.fb_groups(id),
  archived_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fb_groups TO authenticated;
GRANT ALL ON public.fb_groups TO service_role;
ALTER TABLE public.fb_groups ENABLE ROW LEVEL SECURITY;
CREATE POLICY fb_groups_admin ON public.fb_groups FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.fb_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  content_text text,
  min_interval_days integer NOT NULL DEFAULT 14,
  cycle integer NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'active',
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fb_campaigns TO authenticated;
GRANT ALL ON public.fb_campaigns TO service_role;
ALTER TABLE public.fb_campaigns ENABLE ROW LEVEL SECURITY;
CREATE POLICY fb_campaigns_admin ON public.fb_campaigns FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.fb_campaign_groups (
  campaign_id uuid NOT NULL REFERENCES public.fb_campaigns(id) ON DELETE CASCADE,
  group_id uuid NOT NULL REFERENCES public.fb_groups(id) ON DELETE CASCADE,
  excluded boolean NOT NULL DEFAULT false,
  exclusion_reason text,
  added_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (campaign_id, group_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fb_campaign_groups TO authenticated;
GRANT ALL ON public.fb_campaign_groups TO service_role;
ALTER TABLE public.fb_campaign_groups ENABLE ROW LEVEL SECURITY;
CREATE POLICY fb_campaign_groups_admin ON public.fb_campaign_groups FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.fb_publications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES public.fb_groups(id),
  campaign_id uuid REFERENCES public.fb_campaigns(id),
  cycle integer NOT NULL DEFAULT 1,
  content_text text,
  responsible uuid,
  account_used text,
  planned_date date,
  submitted_at timestamptz,
  submitted_real_date date,
  published_at timestamptz,
  published_real_date date,
  post_url text,
  status text NOT NULL DEFAULT 'a_preparer',
  notes text,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fb_publications TO authenticated;
GRANT ALL ON public.fb_publications TO service_role;
ALTER TABLE public.fb_publications ENABLE ROW LEVEL SECURITY;
CREATE POLICY fb_publications_admin ON public.fb_publications FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.fb_assignments (
  group_id uuid NOT NULL REFERENCES public.fb_groups(id) ON DELETE CASCADE,
  campaign_id uuid NOT NULL REFERENCES public.fb_campaigns(id) ON DELETE CASCADE,
  cycle integer NOT NULL DEFAULT 1,
  assigned_to uuid NOT NULL,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (group_id, campaign_id, cycle)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fb_assignments TO authenticated;
GRANT ALL ON public.fb_assignments TO service_role;
ALTER TABLE public.fb_assignments ENABLE ROW LEVEL SECURITY;
CREATE POLICY fb_assignments_admin ON public.fb_assignments FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.fb_group_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid REFERENCES public.fb_groups(id) ON DELETE CASCADE,
  publication_id uuid REFERENCES public.fb_publications(id) ON DELETE SET NULL,
  actor uuid,
  action text NOT NULL,
  detail jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.fb_group_events TO authenticated;
GRANT ALL ON public.fb_group_events TO service_role;
ALTER TABLE public.fb_group_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY fb_group_events_admin_select ON public.fb_group_events FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY fb_group_events_admin_insert ON public.fb_group_events FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE INDEX fb_publications_group_idx ON public.fb_publications(group_id, status);
CREATE INDEX fb_publications_campaign_idx ON public.fb_publications(campaign_id, cycle, status);
CREATE INDEX fb_groups_status_idx ON public.fb_groups(status) WHERE archived_at IS NULL;