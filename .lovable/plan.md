# Intégration Google Business Profile — Plan Phase 1

**Périmètre confirmé** : une seule fiche, sync quotidien 05h45, publications + Q&R en écriture, avis livrés en Phase 2 quand Google approuve l'accès `mybusiness.v4`.

## Prérequis à faire de ton côté (bloquants)

1. **Google Cloud Console** — activer 4 APIs dans le projet GCP (idéalement le même que GSC/GA4) :
   - My Business Business Information API
   - My Business Account Management API
   - Business Profile Performance API
   - My Business Q&A API

2. **OAuth Client ID** type "Web application" avec redirect URI exact :
   `https://kenduhxscnynugpvktin.supabase.co/functions/v1/gbp-oauth-callback`
   Scopes autorisés : `https://www.googleapis.com/auth/business.manage`

3. **Deux secrets** que je te demanderai via `add_secret` :
   - `GBP_GOOGLE_CLIENT_ID`
   - `GBP_GOOGLE_CLIENT_SECRET`

4. **Demander l'accès Reviews API** dès maintenant via [le formulaire Google](https://support.google.com/business/contact/api_default) — délai 2-6 semaines. Livraison Phase 2 quand ça arrive.

## Architecture

```text
Admin (bouton "Connecter Google Business")
   → gbp-oauth-start        (redirige vers consent Google, state signé)
   → Google consent
   → gbp-oauth-callback     (échange code → refresh_token, stocké chiffré)
   → gbp-select-location    (liste comptes + établissements, admin choisit)
   ↓
   gbp_config (1 ligne : refresh_token, account_name, location_name)
   ↓
   pg_cron 05h45 → gbp-sync-daily
      • Performance API  → gbp_daily_metrics
      • Q&A API          → gbp_questions
      • Business Info    → gbp_location (photos count, note moy., etc.)
   ↓
   Dashboard "Google Business" dans SEO Manager
```

## Tables (migration unique, RLS admin-only)

| Table | Rôle |
|---|---|
| `gbp_config` | Une seule ligne (refresh_token chiffré via pgsodium, account_name, location_name, dernière synchro) |
| `gbp_daily_metrics` | Un enregistrement par jour × métrique : CALL_CLICKS, WEBSITE_CLICKS, BUSINESS_DIRECTION_REQUESTS, BUSINESS_IMPRESSIONS_DESKTOP_MAPS, BUSINESS_IMPRESSIONS_DESKTOP_SEARCH, BUSINESS_IMPRESSIONS_MOBILE_MAPS, BUSINESS_IMPRESSIONS_MOBILE_SEARCH, BUSINESS_CONVERSATIONS, BUSINESS_BOOKINGS |
| `gbp_location` | Snapshot fiche : nom, adresse, catégories, note moyenne, nombre d'avis, nombre de photos, URL |
| `gbp_posts` | Publications créées (statut : draft/published/failed, réponse API, date programmée) |
| `gbp_questions` | Questions publiques + réponses avec états read/answered |

Placeholder `gbp_reviews` documenté mais pas créé (Phase 2).

## Edge functions

| Fonction | JWT | Rôle |
|---|---|---|
| `gbp-oauth-start` | ✅ admin only | Génère URL consent Google avec state signé |
| `gbp-oauth-callback` | ❌ (Google appelle) | Échange code, vérifie state, stocke refresh_token |
| `gbp-list-locations` | ✅ admin | Liste comptes + établissements du compte connecté |
| `gbp-set-location` | ✅ admin | Sauvegarde le location_name choisi + snapshot initial |
| `gbp-sync-daily` | ❌ (pg_cron) | Refresh access_token → Performance/Q&A/Info APIs → upsert |
| `gbp-post-create` | ✅ admin | POST vers `mybusiness.googleapis.com/v4/{location}/localPosts` |
| `gbp-qa-answer` | ✅ admin | Répond à une question |
| `gbp-disconnect` | ✅ admin | Révoque refresh_token + purge `gbp_config` |

Toutes reprennent le pattern existant : refresh access_token à chaque appel via `client_credentials` OAuth flow, backoff sur 429/5xx, logs d'erreur structurés.

## Interface — nouvel onglet "Google Business" dans SEO Manager

- **Bandeau connexion** : "Non connecté / Connecté à [Nom fiche]" + bouton Connecter/Déconnecter.
- **KPIs 28 j** (cartes) : Vues totales, Recherches directes, Recherches découverte, Appels, Itinéraires, Clics site.
- **Graphique 90 j** : évolution vues + actions (recharts).
- **Répartition sources** : donut Maps vs Search × Desktop vs Mobile.
- **Correlation SEO** : tableau agrégeant impressions GSC + vues GBP pour les 56 territoires (jointure statistique globale — une seule fiche donc pas de mapping 1-1).
- **Section Publications** : liste + éditeur (titre, corps, CTA, image) + bouton "Publier maintenant" ou "Programmer".
- **Section Q&R** : liste des questions non répondues + formulaire de réponse inline.
- **Snapshot fiche** : note moyenne, nombre d'avis, nombre de photos (lien "Gérer sur Google" en attendant Phase 2).

## Alertes nouveaux avis

Reportée à Phase 2 avec l'accès Reviews API. Placeholder dans `admin_notifications` prêt à recevoir les événements dès que l'API répond.

## Ordre d'exécution

1. Migration DB (tables + RLS + trigger updated_at + cron 05h45).
2. Je te demande `GBP_GOOGLE_CLIENT_ID` / `GBP_GOOGLE_CLIENT_SECRET` via `add_secret`.
3. Déploiement des 8 edge functions + `verify_jwt` correct dans `supabase/config.toml`.
4. Composant `GbpDashboard.tsx` + wiring dans `AdminSeoManager.tsx` (nouvel onglet "Google Business").
5. Test end-to-end : connexion OAuth → sélection fiche → sync manuelle → création d'un post test → réponse Q&R test.
6. Activation du cron 05h45.

## Ce qui n'est PAS livré Phase 1

- Lecture des avis Google + réponses aux avis (API dépréciée, en attente d'approbation).
- Alertes nouveaux avis (dépend du point ci-dessus).
- Upload de photos (l'API existe mais lourde à intégrer proprement — à confirmer si besoin).

Confirme le plan et je démarre par la migration DB.
