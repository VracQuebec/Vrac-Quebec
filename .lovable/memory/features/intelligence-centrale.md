---
name: Intelligence Centrale (Sprint Production 6)
description: Moteurs d'apprentissage, scores dynamiques, prédictions, anomalies, auto-optimisation, mémoire IA et Centre IA /admin/ia
type: feature
---
Tables : jsc_intel_learning (apprentissage par domaine : materials, suppliers, carriers, clients, seasonality, pricing, delays), jsc_intel_scores (scores 0-100 + note A-E par client/fournisseur/transporteur/camion/chauffeur/matériau/projet), jsc_intel_predictions (régression linéaire + échéancier de factures, indice de confiance), jsc_intel_anomalies, jsc_intel_optimizations (propositions validées avant application), jsc_intel_memory (décisions, résultats, leçons), jsc_intel_reports (rapports quotidiens/commerciaux).

RPC : jsc_intel_learn, jsc_intel_score_all, jsc_intel_predict, jsc_intel_detect_anomalies, jsc_intel_optimize, jsc_intel_apply_optimization, jsc_intel_dashboard. Admin seulement (jsc_can_manage) + service_role. Cron `vqos-intelligence-nightly` à 6 h 10 UTC.

Edge function `vqos-intelligence` : actions `run` (moteurs), `commercial` (suggestions IA JSON), `daily_report` (rapport direction + envoi courriel via gabarit `direction-daily-report`).

UI : `/admin/ia` (AdminIaCenter) — onglets Vue d'ensemble, Apprentissage, Scores, Prédictions, Anomalies, Optimisations, IA commerciale, Rapport direction, Mémoire.

Règle : aucune donnée simulée ni codée en dur; toute recommandation est traçable (preuves, échantillons, confiance) et toute optimisation doit être validée avant application.