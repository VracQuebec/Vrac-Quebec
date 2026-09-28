-- Une seule notification entrepreneur par changement de statut : on conserve
-- mkt_notifications (utilisé par l'espace entrepreneur). L'ancien avis
-- jsc_notifications n'est plus affiché nulle part ; ses 9 lignes historiques sont conservées.
DROP TRIGGER IF EXISTS trg_notify_entrepreneur_status ON public.transport_requests;
COMMENT ON FUNCTION public.notify_entrepreneur_status() IS 'DEPRECATED: remplacé par entr_notify_transport_request (mkt_notifications).';