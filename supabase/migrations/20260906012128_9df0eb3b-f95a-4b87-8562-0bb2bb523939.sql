-- Le client retient une soumission : crée l'attribution à confirmer et met à jour les statuts.
CREATE OR REPLACE FUNCTION public.mkt_client_select_bid(_bid_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  b public.mkt_bids%ROWTYPE;
  award_id uuid;
BEGIN
  SELECT * INTO b FROM public.mkt_bids WHERE id = _bid_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Soumission introuvable';
  END IF;
  IF NOT (public.mkt_owns_request(b.request_id) OR public.mkt_is_admin()) THEN
    RAISE EXCEPTION 'Accès refusé';
  END IF;
  IF b.status NOT IN ('envoyee','vue','preselectionnee','retenue') THEN
    RAISE EXCEPTION 'Cette soumission ne peut pas être retenue';
  END IF;

  UPDATE public.mkt_bids SET status = 'retenue', updated_at = now() WHERE id = b.id;
  UPDATE public.mkt_bids SET status = 'non_retenue', updated_at = now()
   WHERE request_id = b.request_id
     AND id <> b.id
     AND coalesce(lot_id::text,'') = coalesce(b.lot_id::text,'')
     AND status IN ('envoyee','vue','preselectionnee');

  SELECT id INTO award_id FROM public.mkt_awards
   WHERE request_id = b.request_id AND coalesce(lot_id::text,'') = coalesce(b.lot_id::text,'')
   LIMIT 1;

  IF award_id IS NULL THEN
    INSERT INTO public.mkt_awards (request_id, lot_id, bid_id, company_id, amount, status, awarded_at, client_confirmed_at, created_by)
    VALUES (b.request_id, b.lot_id, b.id, b.company_id, b.amount, 'a_confirmer', now(), now(), auth.uid())
    RETURNING id INTO award_id;
  ELSE
    UPDATE public.mkt_awards
       SET bid_id = b.id, company_id = b.company_id, amount = b.amount,
           status = 'a_confirmer', awarded_at = now(), client_confirmed_at = now(), updated_at = now()
     WHERE id = award_id;
  END IF;

  UPDATE public.mkt_quote_requests
     SET status = 'attribution_a_confirmer', updated_at = now()
   WHERE id = b.request_id AND status NOT IN ('attribuee','en_cours','terminee','annulee');

  IF b.lot_id IS NOT NULL THEN
    UPDATE public.mkt_request_lots SET status = 'attribue', updated_at = now() WHERE id = b.lot_id;
  END IF;

  RETURN award_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.mkt_client_select_bid(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.mkt_client_select_bid(uuid) TO authenticated;