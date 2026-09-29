CREATE OR REPLACE FUNCTION public.request_followup_add_note(_entity_type text, _entity_id uuid, _note text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid;
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Accès refusé'; END IF;
  IF coalesce(btrim(_note),'') = '' THEN RAISE EXCEPTION 'Note vide'; END IF;
  INSERT INTO public.request_followups(entity_type, entity_id, received_at)
  VALUES (_entity_type, _entity_id, now()) ON CONFLICT (entity_type, entity_id) DO NOTHING;
  SELECT id INTO v_id FROM public.request_followups WHERE entity_type=_entity_type AND entity_id=_entity_id;
  INSERT INTO public.request_followup_events(followup_id, entity_type, entity_id, action, detail, actor_id, actor_email)
  VALUES (v_id, _entity_type, _entity_id, 'note', jsonb_build_object('note', left(btrim(_note), 4000)), auth.uid(), public.current_user_email());
END $$;
GRANT EXECUTE ON FUNCTION public.request_followup_add_note(text, uuid, text) TO authenticated;