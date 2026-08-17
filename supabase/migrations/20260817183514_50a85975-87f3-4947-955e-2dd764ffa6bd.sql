DELETE FROM public.jsc_estimates WHERE request_id IN (SELECT r.id FROM public.jsc_requests r JOIN public.jsc_clients c ON c.id = r.client_id WHERE c.email = 'qa-calc@vracqa.test');
DELETE FROM public.jsc_requests WHERE client_id IN (SELECT id FROM public.jsc_clients WHERE email = 'qa-calc@vracqa.test');
DELETE FROM public.jsc_clients WHERE email = 'qa-calc@vracqa.test';
DELETE FROM public.lead_notes WHERE submission_id IN (SELECT id FROM public.submissions WHERE email = 'qa-calc@vracqa.test');
DELETE FROM public.submissions WHERE email = 'qa-calc@vracqa.test';