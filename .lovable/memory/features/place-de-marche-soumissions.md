---
name: Place de marché de demandes de soumissions
description: Fondations mkt_* — taxonomie de services, profils partenaires étendus, demandes VQ-AAAA-XXXXX, lots, invitations/matching, soumissions, attribution, commissions, documents et messagerie
type: feature
---
Préfixe des tables : `mkt_*`. Réutilise l'existant : `jsc_companies` (entreprises partenaires), `jsc_company_members` (employés + rôles), `jsc_clients`, `jsc_marketplace_profiles` (fiche publique du réseau), `has_role(auth.uid(),'admin')` pour l'admin Vrac Québec.

Taxonomie : `mkt_service_categories` hiérarchique (`level` = categorie/sous_categorie/service, `parent_id`, `keywords`, `tags`, `sort_order`, `is_active`) — lecture publique, écriture admin. 12 catégories et 156 services chargés (étape 2), gérables via `/admin/marche/categories`.

Profil partenaire : `mkt_partners` + `mkt_partner_business_roles`, `mkt_partner_services`, `mkt_partner_territories`, `mkt_partner_client_types`, `mkt_partner_equipment`, `mkt_partner_documents`, `mkt_partner_preferences`, `mkt_partner_availability`, `mkt_partner_scores`.
Écran (étape 3) : `/partenaire/profil` (`src/pages/PartenaireProfil.tsx`), onglets Identité / Services / Territoires / Équipements / Capacité / Documents / Préférences. Sélection de l'entreprise via `useFleetTenant` + `CompanySwitcher`/`SupportBanner` (mode support Super Admin).

Flux : `mkt_quote_requests` (numéro auto `VQ-AAAA-00001`) → `mkt_request_lots` → `mkt_invitations` → `mkt_bids` → `mkt_awards` → `mkt_commissions` (+ `mkt_pricing_rules`, snapshot, jamais rétroactif). Transverse : `mkt_documents`, `mkt_threads` / `mkt_thread_participants` / `mkt_messages`.

Sécurité : `mkt_is_admin()`, `mkt_is_member(company_id)`, `mkt_owns_request()`, `mkt_can_see_request()`, `mkt_in_thread()` (SECURITY DEFINER, EXECUTE révoqué pour anon).

Code : `src/lib/marketplace/types.ts` (listes de référence FR) et `src/lib/marketplace/api.ts` (client non typé en attendant la régénération des types).

Étapes 4–5 : parcours public `/obtenir-des-soumissions` (`src/pages/ObtenirSoumissions.tsx`) en 9 étapes (service, localisation, description, questions dynamiques, échéancier, photos, coordonnées, révision, confirmation). Questions par catégorie dans `src/lib/marketplace/forms.ts` (12 familles, option « Je ne sais pas », aucun champ obligatoire sauf téléphone ou courriel). Dépôt via l'edge function `mkt-request-submit` (verify_jwt false, service role, `public-guard`, propriétaire déduit du jeton, jamais du corps). Photos téléversées dans le bucket `lead-photos` sous `submissions/<uuid>/`. CTA « Obtenir des soumissions » sur `/place-de-marche`.

Étapes 9–10 : espace client `/mes-soumissions` (`src/pages/MesSoumissions.tsx`) — sections Mes demandes / En attente / Soumissions reçues / Projets attribués / Projets terminés / Documents / Messages, comparaison des soumissions, RPC `mkt_client_select_bid` (attribution `a_confirmer`). Messagerie interne `src/components/marketplace/Messagerie.tsx` (+ `ContactCard`) réutilisée côté client et partenaire. Confidentialité des coordonnées : `mkt_settings.contact_reveal_default` + `mkt_quote_requests.contact_visibility` / `contact_revealed_at`, fonctions `mkt_contact_rule`, `mkt_contact_visible`, `mkt_client_contact`, `mkt_partner_contact`, `mkt_reveal_contact`, `mkt_thread_mark_read`. Réglage global et dévoilement manuel dans `/admin/marche/matching`.

Étape 11 : centre administratif « Gestion des soumissions » `/admin/marche/soumissions` (`src/pages/AdminMarketplaceRequests.tsx`) — 9 indicateurs, 12 files de travail calculées par `queueOf()` (`src/lib/marketplace/api.ts`, constante `WORK_QUEUES`), fiche projet complète (client, coordonnées, lots, invitations, soumissions, documents, messagerie, attribution, revenus), notes internes `mkt_admin_notes` (admin seulement) et journal d'activité `mkt_activity_log` alimenté par le trigger `mkt_log_event` sur demandes/invitations/soumissions/attributions. RPC `mkt_admin_board()` et `mkt_admin_set_status()`.


Étape 12 : avis réels par courriel — trigger `mkt_notifications_email` + `mkt_notification_email_trg` (file `transactional_emails` via `enqueue_email`, expéditeur `avis@notify.vracquebec.ca`), destinataire résolu par `mkt_recipient_email`. Relances automatiques exécutées par `mkt_run_automations()` (cron horaire `mkt-automations`, 6 règles, garde-fous `delay_hours`/`max_runs` journalisés dans `mkt_automation_runs`) et manuellement par les admins via `mkt_run_automations_manual()`. Page `/notifications` (`src/pages/Notifications.tsx`) réutilise `NotificationsPanel` (bascule Mes projets / Mon entreprise).
