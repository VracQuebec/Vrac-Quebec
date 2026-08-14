DELETE FROM public.submission_custom_values WHERE submission_id IN (SELECT id FROM public.submissions WHERE email LIKE '%@vracqa.test');
DELETE FROM public.submission_audit_log WHERE submission_id IN (SELECT id FROM public.submissions WHERE email LIKE '%@vracqa.test');
DELETE FROM public.lead_notes WHERE submission_id IN (SELECT id FROM public.submissions WHERE email LIKE '%@vracqa.test');
DELETE FROM public.submissions WHERE email LIKE '%@vracqa.test';