-- Correctif additif FIN-09C2B1 : fin_ctax_alloc en arithmétique numeric exacte (aucun bigint, aucun float).
-- Même méthode à diviseur (quota inférieur puis plus fort quotient w/(a+1), égalité = plus petit indice).
-- Déjà appliqué directement le 2026-10-01 après redémarrage; cette migration l'enregistre (idempotente).
CREATE OR REPLACE FUNCTION public.fin_ctax_alloc(_s jsonb, _cum numeric)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path = public AS $$
DECLARE w numeric[]; a numeric[]; t numeric; c numeric; b int; i int;
BEGIN
  w := ARRAY[round((_s->>'base')::numeric * 100), round((_s->>'gst')::numeric * 100), round((_s->>'qst')::numeric * 100)]::numeric[];
  IF w[1] < 0 OR w[2] < 0 OR w[3] < 0 THEN RAISE EXCEPTION 'Instantané de retenue invalide (composant négatif)'; END IF;
  t := w[1] + w[2] + w[3]; c := round(coalesce(_cum, 0)::numeric * 100);
  IF c < 0 THEN RAISE EXCEPTION 'Cumul négatif refusé'; END IF;
  IF c >= t THEN RETURN jsonb_build_object('base', w[1] / 100, 'gst', w[2] / 100, 'qst', w[3] / 100); END IF;
  a := ARRAY[div(w[1] * c, t), div(w[2] * c, t), div(w[3] * c, t)]::numeric[];
  WHILE a[1] + a[2] + a[3] < c LOOP
    b := 0;
    FOR i IN 1..3 LOOP
      IF a[i] < w[i] AND (b = 0 OR w[i] * (a[b] + 1) > w[b] * (a[i] + 1)) THEN b := i; END IF;
    END LOOP;
    a[b] := a[b] + 1;
  END LOOP;
  RETURN jsonb_build_object('base', round(a[1] / 100, 2), 'gst', round(a[2] / 100, 2), 'qst', round(a[3] / 100, 2));
END $$;
REVOKE ALL ON FUNCTION public.fin_ctax_alloc(jsonb, numeric) FROM PUBLIC, anon, authenticated;