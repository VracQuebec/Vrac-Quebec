CREATE OR REPLACE FUNCTION public.set_my_network_visibility(_visible boolean)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_old boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  SELECT id, is_network_visible INTO v_id, v_old
  FROM public.entrepreneurs
  WHERE user_id = auth.uid()
  LIMIT 1;

  IF v_id IS NULL THEN
    RAISE EXCEPTION 'profile_not_found';
  END IF;

  IF v_old IS DISTINCT FROM _visible THEN
    UPDATE public.entrepreneurs
    SET is_network_visible = _visible
    WHERE id = v_id AND user_id = auth.uid();

    INSERT INTO public.crm_audit_log (owner_type, owner_id, action, field, old_value, new_value, actor_id)
    VALUES ('entrepreneur', v_id, 'update', 'is_network_visible',
            to_jsonb(v_old), to_jsonb(_visible), auth.uid());
  END IF;

  RETURN _visible;
END;
$$;

REVOKE ALL ON FUNCTION public.set_my_network_visibility(boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_my_network_visibility(boolean) TO authenticated;