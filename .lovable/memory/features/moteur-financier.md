---
name: Module 4 — Moteur financier Transport JSC
description: Moteur financier paramétrable (temps facturable, matériau, transport, suppléments, marge, taxes) consommant le moteur de trajets
type: feature
---
Module 4 (`supabase/functions/_shared/vqos/financial/`) — version `financial-engine-1.0.0`.
Doc : `docs/plateforme/module-4-moteur-financier.md`. Endpoint admin : `quote-financial`.

- `settings.ts` : registre des paramètres financiers (`jsc_settings`), erreur explicite si un requis manque.
- `charges.ts` : registre déclaratif des suppléments/frais fixes (percent_of_transport|material|base, fixed_per_quote|trip|km|tonne).
- `index.ts` : `computeFinancials(trips, taxes, settings)` → temps facturable, matériau, transport, charges, marge, taxes, total, `explanation[]`.

Règles : aucune valeur en dur; transport = minutes facturables ÷ 60 × taux horaire du camion; plancher `min_billable_minutes`; marge sur (matériau + transport + charges); taxes selon `jsc_taxes` avec base ajustée si matériau ou transport non taxable.
Le moteur ne génère ni PDF ni courriel et n'écrit rien en base — il retourne l'objet complet pour le module suivant.
