-- NAV-01B : brouillons synchronisés au compte. Un brouillon n'est jamais une opération métier.
CREATE TABLE public.user_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  company_id uuid,
  draft_key text NOT NULL,
  module text NOT NULL,
  form text NOT NULL,
  record_id text,
  instance text NOT NULL DEFAULT 'main',
  label text,
  route text,
  step integer,
  schema_version integer NOT NULL DEFAULT 1,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  rev integer NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','finalized','discarded')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, draft_key)
);
CREATE INDEX user_drafts_user_status_idx ON public.user_drafts (user_id, status, updated_at DESC);

GRANT SELECT ON public.user_drafts TO authenticated;
GRANT ALL ON public.user_drafts TO service_role;
ALTER TABLE public.user_drafts ENABLE ROW LEVEL SECURITY;

-- Lecture : ses propres brouillons seulement, et seulement si l'accès à l'entreprise est toujours valide.
CREATE POLICY "user_drafts_read_own" ON public.user_drafts FOR SELECT TO authenticated
  USING (user_id = auth.uid() AND (company_id IS NULL OR public.entcrm_can_read(company_id)));

-- Écritures uniquement par RPC (utilisateur déduit du jeton, contrôle de version, pas de résurrection).
CREATE OR REPLACE FUNCTION public.draft_save(
  _key text, _base_rev integer, _module text, _form text, _company uuid, _record text, _instance text,
  _label text, _route text, _step integer, _data jsonb, _schema integer DEFAULT 1
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid := auth.uid(); _row public.user_drafts;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Session requise' USING ERRCODE = '42501'; END IF;
  IF _company IS NOT NULL AND NOT public.entcrm_can_read(_company) THEN
    RAISE EXCEPTION 'Accès à l''entreprise refusé' USING ERRCODE = '42501'; END IF;
  IF pg_column_size(_data) > 400000 THEN RAISE EXCEPTION 'Brouillon trop volumineux' USING ERRCODE = '22023'; END IF;
  SELECT * INTO _row FROM public.user_drafts WHERE user_id = _uid AND draft_key = _key FOR UPDATE;
  IF NOT FOUND THEN
    INSERT INTO public.user_drafts (user_id, company_id, draft_key, module, form, record_id, instance, label, route, step, data, schema_version)
    VALUES (_uid, _company, _key, _module, _form, _record, coalesce(_instance,'main'), _label, _route, _step, coalesce(_data,'{}'::jsonb), coalesce(_schema,1))
    RETURNING * INTO _row;
    RETURN jsonb_build_object('rev', _row.rev, 'updated_at', _row.updated_at, 'id', _row.id);
  END IF;
  -- Écriture tardive après finalisation/abandon : refusée, rien n'est recréé.
  IF _row.status <> 'active' THEN
    RAISE EXCEPTION 'Brouillon % : écriture refusée', _row.status USING ERRCODE = 'P0410'; END IF;
  -- Conflit : une autre copie (onglet, appareil) a écrit depuis la version de base.
  IF _base_rev IS DISTINCT FROM _row.rev THEN
    RAISE EXCEPTION 'Conflit de version (serveur %)', _row.rev USING ERRCODE = 'P0409'; END IF;
  UPDATE public.user_drafts SET data = coalesce(_data,'{}'::jsonb), label = _label, route = _route, step = _step,
    schema_version = coalesce(_schema,1), rev = rev + 1, updated_at = now()
  WHERE id = _row.id RETURNING * INTO _row;
  RETURN jsonb_build_object('rev', _row.rev, 'updated_at', _row.updated_at, 'id', _row.id);
END $$;

CREATE OR REPLACE FUNCTION public.draft_close(_key text, _status text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Session requise' USING ERRCODE = '42501'; END IF;
  IF _status NOT IN ('finalized','discarded') THEN RAISE EXCEPTION 'Statut invalide' USING ERRCODE = '22023'; END IF;
  -- Données effacées à la clôture : seule la trace (clé, statut) reste pour bloquer une résurrection.
  UPDATE public.user_drafts SET status = _status, data = '{}'::jsonb, rev = rev + 1, updated_at = now()
  WHERE user_id = auth.uid() AND draft_key = _key AND status = 'active';
END $$;

-- Une nouvelle création réutilisant une clé close repart d'un brouillon vierge (nouvelle instance explicite).
CREATE OR REPLACE FUNCTION public.draft_reopen(_key text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Session requise' USING ERRCODE = '42501'; END IF;
  DELETE FROM public.user_drafts WHERE user_id = auth.uid() AND draft_key = _key AND status <> 'active';
END $$;

REVOKE ALL ON FUNCTION public.draft_save(text,integer,text,text,uuid,text,text,text,text,integer,jsonb,integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.draft_close(text,text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.draft_reopen(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.draft_save(text,integer,text,text,uuid,text,text,text,text,integer,jsonb,integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.draft_close(text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.draft_reopen(text) TO authenticated;