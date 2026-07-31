---
name: Plateforme autonome (Autopilot)
description: Sprint Production 4 — agent IA central, centre de décision, surveillance temps réel, documents, mode pilote automatique
type: feature
---
Tables : jsc_decisions (file accepter/modifier/refuser/exécuter), jsc_monitor_alerts (anomalies détectées, auto-résolution), jsc_documents (contrats/factures/photos par dossier), jsc_autopilot_settings (activation + garde-fous montant/confiance), jsc_autopilot_log (journal). RPC jsc_dashboard_360.

Edge functions : vqos-agent (agent IA central → décisions), vqos-monitor (détection déterministe : retards, livraisons sans chauffeur, factures échues, marges < 5 %, demandes sans suite 48 h, camions inactifs 14 j), vqos-autopilot (exécution : send_quote, convert_quote_to_order, generate_deliveries, assign_driver, create_invoice, notify).

Règle : aucune exécution automatique hors des réglages admin (enabled + bascule par action + max_auto_amount + min_confidence). Interface : onglets Décisions / Surveillance / Pilote automatique / Documents dans /admin/direction.
