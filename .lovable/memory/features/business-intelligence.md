---
name: Centre d'Intelligence d'Affaires (Sprint 6)
description: Module BI de Vrac Québec OS — /admin/intelligence, RPC jsc_bi_*, objectifs, alertes, résumés IA
type: feature
---
Cockpit décisionnel sur `/admin/intelligence` (admin uniquement).

- Calculs 100 % serveur, aucune donnée codée en dur : `jsc_bi_order_facts` (faits de commande : revenu, coût matériau = prix d'achat × quantité, coût transport = livraisons ou estimation, marges), puis `jsc_bi_overview`, `jsc_bi_analytics`, `jsc_bi_forecast`, `jsc_bi_alerts`, `jsc_bi_goal_progress`.
- Tables : `jsc_bi_goals` (objectifs, admin) et `jsc_bi_layouts` (tableaux personnalisés par utilisateur).
- Edge function `vqos-bi-brief` : résumés IA quotidien/hebdo/mensuel (openai/gpt-5.6-sol, reasoning_effort none).
- Exports : CSV par tableau, Excel multi-feuilles (xlsx), impression/PDF via `window.print` (classes `print:hidden`).