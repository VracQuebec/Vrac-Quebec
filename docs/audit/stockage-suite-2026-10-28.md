# Suite du bilan stockage — 28 octobre 2026 (lecture seule)

Aucune purge, aucune restauration, aucun déplacement de fichiers, aucun changement de capacité dans ce lot.

## 1. Source des 4,36 Go de journaux

**Mesure vérifiée (psql, lecture seule)** : `cron.job_run_details` = **4 356 Mo**, soit ~92 % de la base (4,72 Go). C'est l'historique d'exécution des tâches planifiées, pas des données métier.

**Tâches actives (via l'outil de planification)** et fréquences :

| Tâche | Fréquence | Exécutions/jour (estimé) |
| - | - | - |
| seo-pipeline-orchestrator-v2 | toutes les 30 s | ~2 880 |
| seo-pipeline-supervisor | chaque minute | ~1 440 |
| seo-optimize-supervisor | chaque minute | ~1 440 |
| crm-push-dispatch | chaque minute | ~1 440 |
| crm-notifications-sweep | */10 min | 144 |
| seo-notify-google-15min | */15 min | 96 |
| mkt-automations, seo-intelligence-hourly | horaire | 24 chacune |
| seo-gsc/pagespeed/ga4/gbp-sync, vqos-intelligence, platform-cleanup | quotidienne | 1 chacune |

**Total ≈ 8 700 exécutions/jour**, chacune écrivant une ligne d'historique. Les journaux d'appels HTTP des fonctions (24 h) ne montrent que 59 appels, tous en succès (200) : les superviseurs minute se terminent vite, mais leur historique s'accumule quand même.

**Non vérifiable avec les outils disponibles** : le volume et le taux d'échec par tâche (l'historique détaillé des tâches planifiées n'est pas lisible par les outils d'agent), et l'ancienneté du plus vieux enregistrement conservé.

**Constat clé** : la fonction existante `platform_cleanup()` (tâche `platform-cleanup-nightly`) purge `platform_logs`, `platform_alerts` et `route_cache`, mais **jamais l'historique des tâches planifiées** — d'où la croissance à 4,36 Go.

### Proposition de conservation (à approuver, non exécutée)

- **Journaux techniques** (`cron.job_run_details`) : conservation de **14 jours** via l'outil dédié de nettoyage de l'historique des tâches (par lots de 10 000 lignes, plus vieux d'abord). Effet estimé : ramener cette table de 4,36 Go à quelques dizaines de Mo. Aucune donnée métier touchée.
- **Historiques métier** (`jsc_audit_log`, `submission_audit_log`, `crm_notifications`, journaux de réquisitions/missions) : **aucune purge proposée** — ce sont des preuves d'activité.
- Réduction de fréquence à étudier séparément (décision requise) : les trois superviseurs à la minute et l'orchestrateur à 30 s pourraient passer à 5–15 minutes si la fraîcheur SEO le permet. Cela réduit la croissance future mais demande votre accord sur le compromis de réactivité.

## 2. Surveillance légère des volumes (préparée, non installée)

Fichier préparé : `prepared/stockage-2026-10-28/01_surveillance_volumes.sql` (non installé).

- Une petite table `platform_capacity_snapshots` (une ligne par jour : taille de la base, taille des 10 plus grosses tables, date).
- Une tâche planifiée **quotidienne** (SQL uniquement) qui insère une ligne (~1 Ko/jour, négligeable face aux 8 700 lignes/jour actuelles).
- Consultation manuelle des alertes de capacité via l'outil de santé de la base, sans écriture.

Coût : négligeable. Effet : visibilité sur la croissance sans agrandir le disque. Installation seulement sur votre autorisation.

## 3. Sauvegarde et restauration — couverture vérifiée

| Élément | Couvert ? | Moyen |
| - | - | - |
| Base (structure + données) | Oui, selon la documentation | Sauvegarde automatique quotidienne, ~14 jours de rétention, restauration en place via **More → Database → Manage → Backups** |
| Base — export complet | Oui | **More → Database → Manage → Settings → Export data** (≤15 Go, 1 export/24 h, lien par courriel) |
| Fichiers téléversés (storage) | **Non** | Ni les sauvegardes quotidiennes ni l'export ne les incluent; téléchargement manuel via **More → Storage** |
| Fonctions serveur, secrets, réglages de connexion | Non | Non inclus dans l'export; le code des fonctions est dans le dépôt du projet |
| Restauration à un instant précis | Non | Seules les sauvegardes quotidiennes sont des cibles de restauration |

**À vérifier dans l'interface (non lisible par mes outils)** : l'inventaire réel des sauvegardes et le dernier horodatage UTC dans **More → Database → Manage → Backups**. Je n'ai aucun outil qui liste les sauvegardes; je ne peux donc pas confirmer qu'elles existent ni leur fraîcheur.

**Rappel avant toute restauration** : les données écrites après la sauvegarde sont perdues, la structure revient à l'état de la sauvegarde (le code peut ne plus correspondre), et une restauration est définitive.

## 4. Hébergement — pour la politique de confidentialité

**Vérifié par les outils** :
- Fournisseur : Lovable Cloud (infrastructure gérée, au-dessus d'AWS).
- Région : **us-east-1 (États-Unis)** — indiqué par l'adresse du pooler de connexion (`aws-1-us-east-1`).
- Instance : Tiny, en service, non en pause.
- Une seule instance sert l'aperçu et le site publié.

**À confirmer (non vérifiable par mes outils)** :
- La région exacte du stockage des fichiers téléversés (possiblement différente de la base).
- La liste officielle des sous-traitants et leurs localisations (documentation Lovable / DPA).
- Les engagements de rétention des sauvegardes applicables à ce projet.
- L'emplacement d'hébergement du site publié (CDN) et des journaux d'accès.

Ces points devraient être confirmés avant de figer le texte de la politique de confidentialité, en particulier le transfert de données hors Canada (Québec, Loi 25).

## Prochaines actions proposées (aucune exécutée)

1. Approuver la purge de l'historique technique des tâches (14 jours de conservation) — outil dédié, par lots, sans toucher aux données métier.
2. Approuver l'installation de la surveillance quotidienne des volumes (fichier préparé).
3. Décider de la réduction de fréquence des superviseurs SEO (compromis fraîcheur/volume).
4. Vérifier dans l'interface l'inventaire des sauvegardes (More → Database → Manage → Backups).
