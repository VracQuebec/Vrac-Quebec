
CREATE OR REPLACE FUNCTION public.mkt_notify_request_trg()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.mkt_notify('admin','nouvelle_demande','Nouvelle demande '||coalesce(NEW.request_number,''),
    NEW.title, NULL, NULL, NEW.id, '/admin/marche/soumissions', 'info');
  IF NEW.client_user_id IS NOT NULL THEN
    PERFORM public.mkt_notify('client','demande_recue','Votre demande a été reçue',
      'Vrac Québec recherche les entreprises partenaires les mieux adaptées à votre projet.',
      NEW.client_user_id, NULL, NEW.id, '/mes-soumissions', 'info');
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS mkt_notify_request ON public.mkt_quote_requests;
CREATE TRIGGER mkt_notify_request AFTER INSERT ON public.mkt_quote_requests
FOR EACH ROW EXECUTE FUNCTION public.mkt_notify_request_trg();

CREATE OR REPLACE FUNCTION public.mkt_notify_invitation_trg()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE q record;
BEGIN
  SELECT * INTO q FROM public.mkt_quote_requests WHERE id = NEW.request_id;
  PERFORM public.mkt_notify('partenaire','nouvelle_opportunite','Nouvelle opportunité '||coalesce(q.request_number,''),
    coalesce(q.title,'')||coalesce(' — '||q.city,''), NULL, NEW.company_id, NEW.request_id, '/partenaire/soumissions', 'info');
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS mkt_notify_invitation ON public.mkt_invitations;
CREATE TRIGGER mkt_notify_invitation AFTER INSERT ON public.mkt_invitations
FOR EACH ROW EXECUTE FUNCTION public.mkt_notify_invitation_trg();

CREATE OR REPLACE FUNCTION public.mkt_notify_bid_trg()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE q record;
BEGIN
  IF NEW.status = 'envoyee' AND (TG_OP = 'INSERT' OR coalesce(OLD.status,'') <> 'envoyee') THEN
    SELECT * INTO q FROM public.mkt_quote_requests WHERE id = NEW.request_id;
    IF q.client_user_id IS NOT NULL THEN
      PERFORM public.mkt_notify('client','soumission_recue','Nouvelle soumission reçue',
        'Une entreprise a répondu à votre demande '||coalesce(q.request_number,'')||'.',
        q.client_user_id, NULL, NEW.request_id, '/mes-soumissions', 'info');
    END IF;
    PERFORM public.mkt_notify('admin','soumission_recue','Soumission reçue — '||coalesce(q.request_number,''),
      NULL, NULL, NULL, NEW.request_id, '/admin/marche/soumissions', 'info');
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS mkt_notify_bid ON public.mkt_bids;
CREATE TRIGGER mkt_notify_bid AFTER INSERT OR UPDATE OF status ON public.mkt_bids
FOR EACH ROW EXECUTE FUNCTION public.mkt_notify_bid_trg();

CREATE OR REPLACE FUNCTION public.mkt_notify_award_trg()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE q record;
BEGIN
  SELECT * INTO q FROM public.mkt_quote_requests WHERE id = NEW.request_id;
  PERFORM public.mkt_notify('partenaire','soumission_retenue','Votre soumission a été retenue',
    'Projet '||coalesce(q.request_number,'')||' — '||coalesce(q.title,''), NULL, NEW.company_id,
    NEW.request_id, '/partenaire/soumissions', 'succes');
  IF q.client_user_id IS NOT NULL THEN
    PERFORM public.mkt_notify('client','projet_attribue','Projet attribué',
      'Votre choix est confirmé pour '||coalesce(q.title,'votre demande')||'.',
      q.client_user_id, NULL, NEW.request_id, '/mes-soumissions', 'succes');
  END IF;
  PERFORM public.mkt_notify('admin','attribution','Attribution — '||coalesce(q.request_number,''),
    NULL, NULL, NULL, NEW.request_id, '/admin/marche/soumissions', 'info');
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS mkt_notify_award ON public.mkt_awards;
CREATE TRIGGER mkt_notify_award AFTER INSERT ON public.mkt_awards
FOR EACH ROW EXECUTE FUNCTION public.mkt_notify_award_trg();
