
CREATE SEQUENCE IF NOT EXISTS public.cpn_book_seq START 1;
CREATE SEQUENCE IF NOT EXISTS public.cpn_coupon_seq START 1;

CREATE TABLE public.cpn_books (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  book_number text NOT NULL UNIQUE,
  recipient_type text NOT NULL CHECK (recipient_type IN ('client','entrepreneur')),
  submission_id uuid REFERENCES public.submissions(id) ON DELETE SET NULL,
  entrepreneur_id uuid REFERENCES public.entrepreneurs(id) ON DELETE SET NULL,
  recipient_name text,
  recipient_company text,
  address text,
  city text,
  postal_code text,
  first_coupon bigint NOT NULL,
  last_coupon bigint NOT NULL,
  coupon_count integer NOT NULL DEFAULT 50,
  copies integer NOT NULL DEFAULT 3,
  status text NOT NULL DEFAULT 'a_preparer'
    CHECK (status IN ('a_completer','a_preparer','pret','expedie','livre','perdu','annule')),
  reason text NOT NULL DEFAULT 'inscription' CHECK (reason IN ('inscription','renouvellement','remplacement','manuel')),
  replaces_id uuid REFERENCES public.cpn_books(id),
  carrier text,
  tracking text,
  shipped_at timestamptz,
  delivered_at timestamptz,
  note text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX cpn_books_one_signup_sub ON public.cpn_books(submission_id) WHERE reason='inscription' AND submission_id IS NOT NULL;
CREATE UNIQUE INDEX cpn_books_one_signup_ent ON public.cpn_books(entrepreneur_id) WHERE reason='inscription' AND entrepreneur_id IS NOT NULL;

CREATE TABLE public.cpn_book_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  book_id uuid NOT NULL REFERENCES public.cpn_books(id) ON DELETE CASCADE,
  action text NOT NULL,
  from_status text,
  to_status text,
  note text,
  actor uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.cpn_books TO authenticated;
GRANT SELECT ON public.cpn_book_events TO authenticated;
GRANT ALL ON public.cpn_books TO service_role;
GRANT ALL ON public.cpn_book_events TO service_role;
ALTER TABLE public.cpn_books ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cpn_book_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cpn admin read" ON public.cpn_books FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY "cpn owner read" ON public.cpn_books FOR SELECT TO authenticated
  USING (entrepreneur_id IN (SELECT e.id FROM public.entrepreneurs e WHERE e.user_id = auth.uid()));
CREATE POLICY "cpn ev admin read" ON public.cpn_book_events FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin'));

-- Création interne d'un carnet (statut « à compléter » si l'adresse postale manque).
CREATE OR REPLACE FUNCTION public.cpn_new_book(_type text, _sub uuid, _ent uuid, _name text, _company text,
  _address text, _city text, _postal text, _reason text, _replaces uuid, _actor uuid, _count integer DEFAULT 50)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE _id uuid; _first bigint; _st text;
BEGIN
  IF _count < 10 OR _count > 200 THEN RAISE EXCEPTION 'Nombre de coupons invalide'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('cpn_coupon_seq'));
  _first := nextval('cpn_coupon_seq');
  PERFORM setval('cpn_coupon_seq', _first + _count - 1);
  _st := CASE WHEN coalesce(trim(_address),'')='' OR coalesce(trim(_postal),'')='' THEN 'a_completer' ELSE 'a_preparer' END;
  INSERT INTO cpn_books(book_number, recipient_type, submission_id, entrepreneur_id, recipient_name, recipient_company,
    address, city, postal_code, first_coupon, last_coupon, coupon_count, status, reason, replaces_id, created_by)
  VALUES ('CN-'||lpad(nextval('cpn_book_seq')::text,6,'0'), _type, _sub, _ent, nullif(trim(_name),''), nullif(trim(_company),''),
    nullif(trim(_address),''), nullif(trim(_city),''), nullif(upper(trim(_postal)),''), _first, _first+_count-1, _count, _st, _reason, _replaces, _actor)
  RETURNING id INTO _id;
  INSERT INTO cpn_book_events(book_id, action, to_status, note, actor) VALUES (_id, 'creation', _st, _reason, _actor);
  RETURN _id;
END $$;
REVOKE ALL ON FUNCTION public.cpn_new_book FROM PUBLIC, anon, authenticated;

-- Préparation automatique à l'inscription d'une dompe (demande de remblai).
CREATE OR REPLACE FUNCTION public.cpn_on_submission() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NEW.request_type = 'remblai' THEN
    BEGIN
      PERFORM cpn_new_book('client', NEW.id, NULL, NEW.name, NEW.company, NEW.address, NEW.city, NEW.postal_code, 'inscription', NULL, NULL);
    EXCEPTION WHEN unique_violation THEN NULL;
    END;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER cpn_on_submission AFTER INSERT ON public.submissions FOR EACH ROW EXECUTE FUNCTION public.cpn_on_submission();

CREATE OR REPLACE FUNCTION public.cpn_on_entrepreneur() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  BEGIN
    PERFORM cpn_new_book('entrepreneur', NULL, NEW.id, coalesce(NEW.contact_name, NEW.name), NEW.company,
      coalesce(NEW.billing_address, NEW.address), NEW.city, NULL, 'inscription', NULL, NULL);
  EXCEPTION WHEN unique_violation THEN NULL;
  END;
  RETURN NEW;
END $$;
CREATE TRIGGER cpn_on_entrepreneur AFTER INSERT ON public.entrepreneurs FOR EACH ROW EXECUTE FUNCTION public.cpn_on_entrepreneur();

-- Actions de l'équipe (admin seulement), journalisées.
CREATE OR REPLACE FUNCTION public.cpn_book_action(_id uuid, _action text, _note text DEFAULT NULL,
  _carrier text DEFAULT NULL, _tracking text DEFAULT NULL, _address text DEFAULT NULL, _city text DEFAULT NULL, _postal text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE b cpn_books; _to text; _new uuid;
BEGIN
  IF NOT has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Accès refusé' USING ERRCODE='42501'; END IF;
  SELECT * INTO b FROM cpn_books WHERE id=_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Carnet introuvable'; END IF;
  IF _action = 'adresse' THEN
    IF b.status NOT IN ('a_completer','a_preparer','pret') THEN RAISE EXCEPTION 'Carnet déjà expédié'; END IF;
    IF coalesce(trim(_address),'')='' OR coalesce(trim(_postal),'')='' THEN RAISE EXCEPTION 'Adresse et code postal requis'; END IF;
    UPDATE cpn_books SET address=trim(_address), city=nullif(trim(_city),''), postal_code=upper(trim(_postal)),
      status=CASE WHEN status='a_completer' THEN 'a_preparer' ELSE status END, updated_at=now() WHERE id=_id
      RETURNING status INTO _to;
  ELSIF _action = 'pret' THEN
    IF b.status <> 'a_preparer' THEN RAISE EXCEPTION 'Transition refusée'; END IF; _to := 'pret';
  ELSIF _action = 'expedie' THEN
    IF b.status NOT IN ('a_preparer','pret') THEN RAISE EXCEPTION 'Transition refusée'; END IF; _to := 'expedie';
  ELSIF _action = 'livre' THEN
    IF b.status <> 'expedie' THEN RAISE EXCEPTION 'Transition refusée'; END IF; _to := 'livre';
  ELSIF _action = 'perdu' THEN
    IF b.status NOT IN ('expedie','livre') THEN RAISE EXCEPTION 'Transition refusée'; END IF;
    IF coalesce(length(trim(_note)),0) < 3 THEN RAISE EXCEPTION 'Motif requis'; END IF; _to := 'perdu';
  ELSIF _action = 'annule' THEN
    IF b.status IN ('expedie','livre','perdu','annule') THEN RAISE EXCEPTION 'Transition refusée'; END IF;
    IF coalesce(length(trim(_note)),0) < 3 THEN RAISE EXCEPTION 'Motif requis'; END IF; _to := 'annule';
  ELSIF _action IN ('renouveler','remplacer') THEN
    IF _action='remplacer' AND b.status <> 'perdu' THEN RAISE EXCEPTION 'Seul un carnet perdu se remplace'; END IF;
    IF _action='renouveler' AND b.status <> 'livre' THEN RAISE EXCEPTION 'Seul un carnet livré se renouvelle'; END IF;
    _new := cpn_new_book(b.recipient_type, b.submission_id, b.entrepreneur_id, b.recipient_name, b.recipient_company,
      b.address, b.city, b.postal_code, CASE WHEN _action='remplacer' THEN 'remplacement' ELSE 'renouvellement' END, b.id, auth.uid(), b.coupon_count);
    INSERT INTO cpn_book_events(book_id, action, note, actor) VALUES (_id, _action, _note, auth.uid());
    RETURN jsonb_build_object('new_id', _new);
  ELSE RAISE EXCEPTION 'Action inconnue'; END IF;

  IF _action <> 'adresse' THEN
    UPDATE cpn_books SET status=_to, updated_at=now(),
      carrier = CASE WHEN _action='expedie' THEN nullif(trim(_carrier),'') ELSE carrier END,
      tracking = CASE WHEN _action='expedie' THEN nullif(trim(_tracking),'') ELSE tracking END,
      shipped_at = CASE WHEN _action='expedie' THEN now() ELSE shipped_at END,
      delivered_at = CASE WHEN _action='livre' THEN now() ELSE delivered_at END,
      note = coalesce(nullif(trim(_note),''), note)
    WHERE id=_id;
  END IF;
  INSERT INTO cpn_book_events(book_id, action, from_status, to_status, note, actor) VALUES (_id, _action, b.status, _to, nullif(trim(_note),''), auth.uid());
  RETURN jsonb_build_object('status', _to);
END $$;
REVOKE ALL ON FUNCTION public.cpn_book_action FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cpn_book_action TO authenticated;

-- Carnet manuel (dompes ou entrepreneurs existants, avant l'activation).
CREATE OR REPLACE FUNCTION public.cpn_book_create(_type text, _sub uuid, _ent uuid, _count integer DEFAULT 50)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE s submissions; e entrepreneurs;
BEGIN
  IF NOT has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Accès refusé' USING ERRCODE='42501'; END IF;
  IF _type='client' THEN
    SELECT * INTO s FROM submissions WHERE id=_sub; IF NOT FOUND THEN RAISE EXCEPTION 'Dompe introuvable'; END IF;
    RETURN cpn_new_book('client', s.id, NULL, s.name, s.company, s.address, s.city, s.postal_code, 'manuel', NULL, auth.uid(), _count);
  ELSIF _type='entrepreneur' THEN
    SELECT * INTO e FROM entrepreneurs WHERE id=_ent; IF NOT FOUND THEN RAISE EXCEPTION 'Entrepreneur introuvable'; END IF;
    RETURN cpn_new_book('entrepreneur', NULL, e.id, coalesce(e.contact_name,e.name), e.company, coalesce(e.billing_address,e.address), e.city, NULL, 'manuel', NULL, auth.uid(), _count);
  END IF;
  RAISE EXCEPTION 'Type invalide';
END $$;
REVOKE ALL ON FUNCTION public.cpn_book_create FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cpn_book_create TO authenticated;
