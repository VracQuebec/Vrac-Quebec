CREATE OR REPLACE FUNCTION public.site_chat_agent_action(_session uuid, _action text, _text text DEFAULT NULL) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE nm text; s record;
BEGIN
  IF NOT public.site_chat_can_agent() THEN RAISE EXCEPTION 'Accès refusé' USING ERRCODE='42501'; END IF;
  SELECT * INTO s FROM site_chat_sessions WHERE id=_session FOR UPDATE; IF NOT FOUND THEN RAISE EXCEPTION 'Conversation introuvable'; END IF;
  SELECT nullif(split_part(coalesce(u.raw_user_meta_data->>'full_name',''),' ',1),'') INTO nm FROM auth.users u WHERE u.id=auth.uid();
  IF _action='prendre' THEN
    IF s.mode='humain' AND s.agent_id = auth.uid() THEN RETURN; END IF;
    UPDATE site_chat_sessions SET mode='humain', agent_id=auth.uid(), agent_name=coalesce(nm,'Équipe Vrac Québec'), wants_human=false, last_at=now() WHERE id=_session;
    INSERT INTO site_chat_messages(session_id,role,content,author) VALUES (_session,'systeme', coalesce(nm,'Un membre') || ' de l''équipe Vrac Québec a rejoint la conversation.', auth.uid());
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