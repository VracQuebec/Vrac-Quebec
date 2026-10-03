CREATE TABLE public.site_chat_agents (user_id uuid PRIMARY KEY, added_by uuid, created_at timestamptz NOT NULL DEFAULT now());
GRANT SELECT, INSERT, DELETE ON public.site_chat_agents TO authenticated; GRANT ALL ON public.site_chat_agents TO service_role;
ALTER TABLE public.site_chat_agents ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.site_chat_can_agent() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT public.has_role(auth.uid(),'admin') OR EXISTS (SELECT 1 FROM site_chat_agents WHERE user_id = auth.uid())
$$;
CREATE POLICY r ON public.site_chat_agents FOR SELECT TO authenticated USING (public.site_chat_can_agent());
CREATE POLICY w ON public.site_chat_agents FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY d ON public.site_chat_agents FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin'));

CREATE TABLE public.site_chat_sessions (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), token uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  user_id uuid, audience text NOT NULL DEFAULT 'inconnu' CHECK (audience IN ('client','entrepreneur','inconnu')),
  mode text NOT NULL DEFAULT 'ia' CHECK (mode IN ('ia','humain','ferme')), agent_id uuid, agent_name text, wants_human boolean NOT NULL DEFAULT false,
  page text, contact text, msg_count int NOT NULL DEFAULT 0, created_at timestamptz NOT NULL DEFAULT now(), last_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX site_chat_sessions_last ON public.site_chat_sessions(last_at DESC);
GRANT SELECT, UPDATE ON public.site_chat_sessions TO authenticated; GRANT ALL ON public.site_chat_sessions TO service_role;
ALTER TABLE public.site_chat_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY r ON public.site_chat_sessions FOR SELECT TO authenticated USING (public.site_chat_can_agent());

CREATE TABLE public.site_chat_messages (id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, session_id uuid NOT NULL REFERENCES public.site_chat_sessions(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('visiteur','ia','agent','systeme')), content text NOT NULL CHECK (length(content) BETWEEN 1 AND 4000),
  links jsonb, author uuid, created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX site_chat_messages_s ON public.site_chat_messages(session_id, id);
GRANT SELECT ON public.site_chat_messages TO authenticated; GRANT ALL ON public.site_chat_messages TO service_role;
ALTER TABLE public.site_chat_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY r ON public.site_chat_messages FOR SELECT TO authenticated USING (public.site_chat_can_agent());

-- Visiteur : lecture par jeton secret seulement
CREATE OR REPLACE FUNCTION public.site_chat_poll(_token uuid, _after bigint DEFAULT 0) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT jsonb_build_object('mode', s.mode, 'agent', s.agent_name, 'messages', coalesce((SELECT jsonb_agg(jsonb_build_object('id',m.id,'role',m.role,'content',m.content,'links',m.links) ORDER BY m.id)
     FROM site_chat_messages m WHERE m.session_id=s.id AND m.id > coalesce(_after,0)), '[]'::jsonb))
  FROM site_chat_sessions s WHERE s.token=_token
$$;
GRANT EXECUTE ON FUNCTION public.site_chat_poll(uuid, bigint) TO anon, authenticated;

-- Agent : prise de contrôle, message, remise à l'IA, fermeture
CREATE OR REPLACE FUNCTION public.site_chat_agent_action(_session uuid, _action text, _text text DEFAULT NULL) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE nm text; s record;
BEGIN
  IF NOT public.site_chat_can_agent() THEN RAISE EXCEPTION 'Accès refusé' USING ERRCODE='42501'; END IF;
  SELECT * INTO s FROM site_chat_sessions WHERE id=_session FOR UPDATE; IF NOT FOUND THEN RAISE EXCEPTION 'Conversation introuvable'; END IF;
  SELECT coalesce(nullif(split_part(coalesce(u.raw_user_meta_data->>'full_name',''),' ',1),''),'Équipe Vrac Québec') INTO nm FROM auth.users u WHERE u.id=auth.uid();
  IF _action='prendre' THEN
    IF s.mode='humain' AND s.agent_id = auth.uid() THEN RETURN; END IF;
    UPDATE site_chat_sessions SET mode='humain', agent_id=auth.uid(), agent_name=nm, wants_human=false, last_at=now() WHERE id=_session;
    INSERT INTO site_chat_messages(session_id,role,content,author) VALUES (_session,'systeme', nm || ' de l''équipe Vrac Québec a rejoint la conversation.', auth.uid());
  ELSIF _action='message' THEN
    IF s.mode<>'humain' OR s.agent_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'Prenez d''abord le contrôle de la conversation'; END IF;
    IF coalesce(length(trim(_text)),0) NOT BETWEEN 1 AND 4000 THEN RAISE EXCEPTION 'Message vide ou trop long'; END IF;
    INSERT INTO site_chat_messages(session_id,role,content,author) VALUES (_session,'agent',trim(_text),auth.uid());
    UPDATE site_chat_sessions SET last_at=now(), msg_count=msg_count+1 WHERE id=_session;
  ELSIF _action='rendre' THEN
    UPDATE site_chat_sessions SET mode='ia', agent_id=NULL, agent_name=NULL, last_at=now() WHERE id=_session;
    INSERT INTO site_chat_messages(session_id,role,content,author) VALUES (_session,'systeme','L''assistant reprend la conversation.', auth.uid());
  ELSIF _action='fermer' THEN
    UPDATE site_chat_sessions SET mode='ferme', last_at=now() WHERE id=_session;
    INSERT INTO site_chat_messages(session_id,role,content,author) VALUES (_session,'systeme','Conversation terminée. Merci!', auth.uid());
  ELSE RAISE EXCEPTION 'Action inconnue'; END IF;
END $$;
REVOKE EXECUTE ON FUNCTION public.site_chat_agent_action(uuid,text,text) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.site_chat_agent_action(uuid,text,text) TO authenticated;

ALTER PUBLICATION supabase_realtime ADD TABLE public.site_chat_sessions, public.site_chat_messages;