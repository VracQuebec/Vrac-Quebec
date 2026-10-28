CREATE TABLE public.fb_publication_files (
 id uuid PRIMARY KEY,
 publication_id uuid NOT NULL REFERENCES public.fb_publications(id),
 bucket text NOT NULL DEFAULT 'crm-docs' CHECK (bucket = 'crm-docs'),
 path text NOT NULL UNIQUE,
 name text NOT NULL CHECK (length(name) BETWEEN 1 AND 255),
 mime text NOT NULL,
 size bigint NOT NULL CHECK (size >= 0),
 created_by uuid NOT NULL DEFAULT auth.uid(),
 created_at timestamptz NOT NULL DEFAULT now(),
 CHECK (path = 'facebook/' || publication_id::text || '/' || id::text)
);
GRANT SELECT, INSERT ON public.fb_publication_files TO authenticated;
GRANT ALL ON public.fb_publication_files TO service_role;
ALTER TABLE public.fb_publication_files ENABLE ROW LEVEL SECURITY;
CREATE POLICY fb_publication_files_read ON public.fb_publication_files FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY fb_publication_files_insert ON public.fb_publication_files FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(),'admin') AND created_by=auth.uid());
CREATE INDEX fb_publication_files_publication_idx ON public.fb_publication_files(publication_id);
CREATE OR REPLACE FUNCTION public.fb_assignment_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Accès refusé' USING ERRCODE='42501'; END IF;
 IF TG_OP='UPDATE' THEN RAISE EXCEPTION 'Une attribution existante ne peut pas être remplacée' USING ERRCODE='42501'; END IF;
 IF TG_OP='INSERT' THEN
  IF NEW.assigned_to IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'Identité refusée' USING ERRCODE='42501'; END IF;
  RETURN NEW;
 END IF;
 IF OLD.assigned_to IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'Seul le responsable peut libérer son attribution' USING ERRCODE='42501'; END IF;
 RETURN OLD;
END $$;
CREATE TRIGGER fb_assignment_guard BEFORE INSERT OR UPDATE OR DELETE ON public.fb_assignments FOR EACH ROW EXECUTE FUNCTION public.fb_assignment_guard();
CREATE OR REPLACE FUNCTION public.fb_claim_group(p_group uuid,p_campaign uuid,p_cycle integer) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_owner uuid; v_inserted boolean;
BEGIN
 IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Accès refusé' USING ERRCODE='42501'; END IF;
 IF p_cycle IS NULL OR p_cycle < 1 THEN RAISE EXCEPTION 'Cycle invalide' USING ERRCODE='22023'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_group::text || ':' || p_campaign::text || ':' || p_cycle::text,0));
 INSERT INTO public.fb_assignments(group_id,campaign_id,cycle,assigned_to) VALUES(p_group,p_campaign,p_cycle,auth.uid()) ON CONFLICT DO NOTHING RETURNING true INTO v_inserted;
 SELECT assigned_to INTO v_owner FROM public.fb_assignments WHERE group_id=p_group AND campaign_id=p_campaign AND cycle=p_cycle;
 IF v_inserted THEN INSERT INTO public.fb_group_events(group_id,actor,action,detail) VALUES(p_group,auth.uid(),'attribution',jsonb_build_object('campagne',p_campaign,'cycle',p_cycle)); END IF;
 RETURN jsonb_build_object('ok',v_owner=auth.uid(),'heldBy',v_owner);
END $$;
CREATE OR REPLACE FUNCTION public.fb_release_group(p_group uuid,p_campaign uuid,p_cycle integer) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_count integer;
BEGIN
 IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Accès refusé' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_group::text || ':' || p_campaign::text || ':' || p_cycle::text,0));
 DELETE FROM public.fb_assignments WHERE group_id=p_group AND campaign_id=p_campaign AND cycle=p_cycle AND assigned_to=auth.uid();
 GET DIAGNOSTICS v_count=ROW_COUNT;
 IF v_count>0 THEN INSERT INTO public.fb_group_events(group_id,actor,action,detail) VALUES(p_group,auth.uid(),'attribution_retiree',jsonb_build_object('campagne',p_campaign,'cycle',p_cycle)); END IF;
END $$;
REVOKE ALL ON FUNCTION public.fb_claim_group(uuid,uuid,integer), public.fb_release_group(uuid,uuid,integer), public.fb_assignment_guard() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.fb_claim_group(uuid,uuid,integer), public.fb_release_group(uuid,uuid,integer) TO authenticated;
CREATE OR REPLACE FUNCTION public.fb_file_event() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 INSERT INTO public.fb_group_events(group_id,publication_id,actor,action,detail) SELECT group_id,NEW.publication_id,auth.uid(),'piece_jointe_ajoutee',jsonb_build_object('fichier',NEW.id) FROM public.fb_publications WHERE id=NEW.publication_id;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.fb_file_event() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER fb_file_event AFTER INSERT ON public.fb_publication_files FOR EACH ROW EXECUTE FUNCTION public.fb_file_event();