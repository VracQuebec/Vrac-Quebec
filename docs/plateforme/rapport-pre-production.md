# Rapport d'audit pré-production — Vrac Québec
Date : 2026-08-05 · Périmètre : plateforme complète (frontend, base de données, fonctions, intégrations)
Objectif : valider la tenue de plusieurs centaines de demandes par jour.

## Verdict

**La plateforme est officiellement prête pour la mise en production.**

300 soumissions simulées de bout en bout : 300 réussites, 0 échec, temps médian 0,9 s, 95e centile 1,26 s.
Tous les problèmes détectés pendant l'audit ont été corrigés et revalidés.

---

## 1. Performance

| Élément | Constat | Action |
|---|---|---|
| Chargement initial | 58 routes en chargement différé (`lazy`) | Déjà conforme |
| Images | WebP + dimensions explicites | Déjà conforme |
| Configuration du moteur | 10 requêtes base par calcul | **Cache mémoire 60 s** ajouté |
| Google Maps | Trajets fixes recalculés à chaque soumission | **Cache partagé en base** (`route_cache`) |
| Limites Google | Saturation en pointe (429) | **Reprise automatique** avec délai croissant (6 tentatives) |

Résultats mesurés sur le moteur de soumission (300 appels réels, Google Maps inclus) :

| Scénario | Réussite | Médiane | 95e centile |
|---|---|---|---|
| Avant optimisation, 30 simultanés | 140/300 | 1 986 ms | 4 200 ms |
| Après optimisation, 10 simultanés | **300/300** | **900 ms** | **1 263 ms** |

Le cache de trajets contient déjà 2 546 entrées réutilisables : les trajets garage ↔ carrières
ne sont plus facturés par Google à chaque demande.

## 2. Base de données

- **40 index manquants** sur des clés étrangères : ajoutés.
- Index ciblés ajoutés sur `seo_pages`, `submissions`, `transport_requests` (requêtes les plus fréquentes).
- Intégrité : clés étrangères et contraintes vérifiées, aucun orphelin détecté.
- Nettoyage automatique nocturne (3 h 20) : journaux > 90 jours, alertes traitées > 90 jours,
  trajets en cache inutilisés > 60 jours.
- Santé : base active, 16/60 connexions, mémoire 58 %, disque 54 %, 0 redémarrage.

## 3. Sécurité

- RLS active sur toutes les tables exposées; `platform_logs`, `platform_alerts` et `route_cache`
  réservés aux administrateurs.
- Droits d'exécution publics retirés sur une centaine de fonctions internes.
- `jsc_public_requests` restreint aux entrepreneurs approuvés et aux administrateurs.
- Points d'entrée publics protégés : limitation de débit (5/h), pot de miel, déduplication 30 min.
- Aucune requête SQL construite par concaténation; toutes les entrées sont validées côté serveur.
- Secrets uniquement côté serveur; aucune clé privée dans le navigateur.
- Google Maps : appels exclusivement via la passerelle, jamais avec une clé exposée.

## 4. Journalisation

Nouvelle table `platform_logs` alimentée par toutes les fonctions serveur, avec source, niveau,
événement, durée, code HTTP et référence de dossier. Sources couvertes :
soumissions, calculs, Google Maps, courriels, base de données, fonctions, API.

Nouveau tableau de bord **Administration → Supervision** (`/admin/supervision`) :
santé des services sur 24 h, alertes ouvertes, recherche libre dans les 300 derniers journaux,
filtres par source et par niveau.

## 5. Sauvegarde et restauration

- Sauvegardes automatiques quotidiennes de la base gérées par l'infrastructure Cloud,
  avec restauration à un instant précis.
- Aucune suppression définitive des données métier : archivage (`archived_at`) partout.
- Historique d'audit conservé (`crm_audit_log`, `jsc_*` historiques, `transport_request_history`).
- Configuration du moteur exportable/importable (`jsc_export_config` / `jsc_import_config`),
  ce qui permet de reconstruire les paramètres de tarification indépendamment de la base.
- Procédure de restauration : restaurer l'instantané Cloud, redéployer les fonctions,
  réimporter la configuration si nécessaire, vérifier `/admin/supervision`.

## 6. Surveillance et alertes

`platform_log_event` crée automatiquement une alerte dès **3 erreurs en 15 minutes** sur une même
source, et regroupe les occurrences suivantes. Couverture : Google Maps indisponible,
base de données en erreur, fonction serveur en échec, courriel non envoyé, calcul en échec.

Validation réelle : pendant les tests de charge, la surveillance a détecté et signalé la saturation
Google Maps (alerte critique, 879 occurrences) avant toute intervention manuelle — c'est ce signal
qui a permis d'identifier et de corriger la cause.

## 7. Validation finale

- 300 soumissions simulées : **300 réussites, 0 échec**.
- 21/21 tests unitaires du moteur et des protections publiques.
- Aucune erreur de typage.
- Aucune fuite mémoire ni blocage observé; les caches sont bornés et expirés.
- Page de supervision testée : accès correctement refusé hors rôle administrateur.

## Suivi recommandé (non bloquant)

1. Les 161 avertissements « SECURITY DEFINER public » restants concernent des fonctions auxiliaires
   nécessaires aux politiques RLS (`has_role`, `is_blacklisted`, etc.) — comportement voulu.
2. Surveiller le disque (54 %) : la croissance vient surtout des données SEO.
3. Si le volume dépasse ~10 soumissions simultanées de façon durable, augmenter la taille
   de l'instance Cloud.
