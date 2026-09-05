---
name: Place de marché de demandes de soumissions
description: Fondations mkt_* — taxonomie de services, profils partenaires étendus, demandes VQ-AAAA-XXXXX, lots, invitations/matching, soumissions, attribution, commissions, documents et messagerie
type: feature
---
Préfixe des tables : `mkt_*`. Réutilise l'existant : `jsc_companies` (entreprises partenaires), `jsc_company_members` (employés + rôles), `jsc_clients`, `jsc_marketplace_profiles` (fiche publique du réseau), `has_role(auth.uid(),'admin')` pour l'admin Vrac Québec.

Taxonomie : `mkt_service_categories` hiérarchique (`level` = categorie/sous_categorie/service, `parent_id`, `keywords`, `tags`, `sort_order`, `is_active`) — lecture publique, écriture admin.

Profil partenaire : `mkt_partners` (identité, NEQ, capacité, montants min/max, distance max, disponibilité, is_public/is_verified/onboarding_status) + `mkt_partner_business_roles` (entrepreneur, transporteur, fournisseur, carriere, sabliere, site_disposition, sous_traitant, donneur_ouvrage), `mkt_partner_services`, `mkt_partner_territories` (ville/region/rayon/province), `mkt_partner_client_types`, `mkt_partner_equipment`, `mkt_partner_documents` (conformité + validation admin), `mkt_partner_preferences`, `mkt_partner_availability`, `mkt_partner_scores` (score interne + score public optionnel).

Flux : `mkt_quote_requests` (numéro auto `VQ-AAAA-00001` via `mkt_next_request_number()`, `client_type` du particulier à l'organisme public, `answers` jsonb pour les formulaires dynamiques, `distribution_mode` auto/manuel/semi_auto, `contact_visibility`) → `mkt_request_lots` → `mkt_invitations` (score + motifs de matching) → `mkt_bids` (postes multiples dans `lines`, brouillon puis envoyée horodatée) → `mkt_awards` → `mkt_commissions` (+ `mkt_pricing_rules`, snapshot de la règle, jamais rétroactif). Transverse : `mkt_documents`, `mkt_threads` / `mkt_thread_participants` / `mkt_messages`.

Sécurité : `mkt_is_admin()`, `mkt_is_member(company_id)`, `mkt_owns_request()`, `mkt_can_see_request()`, `mkt_in_thread()` (SECURITY DEFINER, EXECUTE révoqué pour anon). Client = ses demandes; partenaire = ses invitations/soumissions/profil; admin = tout; public = taxonomie + partenaires `is_public`.

Code : `src/lib/marketplace/types.ts` (listes de référence FR) et `src/lib/marketplace/api.ts` (client non typé en attendant la régénération des types).
