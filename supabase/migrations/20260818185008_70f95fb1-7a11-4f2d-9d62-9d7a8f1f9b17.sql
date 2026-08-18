-- 1) Supprimer le doublon de déclencheur qui consommait deux numéros par insertion.
DROP TRIGGER IF EXISTS submissions_assign_dompe_number ON public.submissions;
DROP TRIGGER IF EXISTS trg_assign_dompe_number ON public.submissions;

-- 2) Un seul déclencheur, exécuté en dernier (après enforce_submission_insert_defaults
--    qui remet dompe_number à '' pour les insertions publiques).
CREATE TRIGGER zzz_assign_dompe_number
BEFORE INSERT ON public.submissions
FOR EACH ROW EXECUTE FUNCTION public.assign_dompe_number();

-- 3) Empêcher tout doublon de numéro (aucun doublon existant).
CREATE UNIQUE INDEX IF NOT EXISTS submissions_dompe_number_unique
ON public.submissions (dompe_number)
WHERE dompe_number IS NOT NULL AND btrim(dompe_number) <> '';