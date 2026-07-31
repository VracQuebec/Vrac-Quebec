---
name: Écosystème Vrac Québec (Sprint 5)
description: Marketplace partenaires, disponibilités temps réel, demandes publiques et offres, contrats, place de marché et IA réseau
type: feature
---
Tables : jsc_marketplace_profiles (fiches publiques : fournisseur, transporteur, carrière, sablière, recyclage, site de dépôt, municipalité), jsc_marketplace_reviews (notes modérées, moyenne recalculée par trigger), jsc_availability (état/quantité/délai/temps d'attente/capacité), jsc_public_requests + jsc_public_offers (demandes ouvertes au réseau et réponses), jsc_contracts (contrats annuels, remises, prix négociés, crédit), jsc_listings (vente, achat, surplus, transport, recherche de camion).

Accès : public = fiches publiées, disponibilités liées, avis approuvés, annonces actives. Connecté = ses annonces/demandes/offres. Admin = tout (jsc_can_manage(auth.uid())).

UI : pages publiques /reseau, /reseau/:slug, /place-de-marche. Back office /admin/jsc → section « Écosystème » (ressources déclarées dans JSC_ECOSYSTEM_RESOURCES) + onglet « IA réseau ».
IA : edge function vqos-network (openai/gpt-5.6-sol) → constats stockés dans jsc_ai_insights avec kinds meilleur_prix, penurie, recommandation_fournisseur, equilibrage_transporteurs, delai, regroupement_livraisons.
