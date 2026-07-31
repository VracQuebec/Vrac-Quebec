# Vrac Québec OS — Audit général avant Version 1.0 Production

Date : 31 juillet 2026. Méthode : lecture complète du code (front + edge functions),
inspection du schéma PostgreSQL en production, linter Supabase, `pg_stat_statements`,
comptages réels de données.

**Note globale : 62 / 100 — NON prêt pour la production.**
Fondations excellentes, chaîne d'exploitation incomplète. 3 bloqueurs critiques,
6 majeurs. Délai réaliste avant V1.0 : 2 à 3 sprints.

---

## 1. Synthèse par domaine

| Domaine | Note | Verdict |
|---|---|---|
| Architecture des moteurs (Decision / Calculation) | 90 | Excellent, séparation stricte, aucun doublon |
| Modèle de données | 78 | Bien normalisé, mais contraintes/triggers absents |
| Flux métier de bout en bout | 35 | **Rompu** : aucune conversion automatisée |
| Intégrité / audit / archivage | 30 | **Déclaré en doc, non installé en base** |
| Sécurité (RLS, permissions) | 80 | Aucune erreur bloquante, 177 avertissements |
| Performances | 70 | OK aujourd'hui, index FK manquants, cron trop coûteux |
| UX / navigation | 60 | Trop de portes d'entrée admin concurrentes |
| Mobile / responsive | 65 | 6 écrans à tableaux non scrollables |
| SEO | 85 | Le module le plus mature de la plateforme |
| API / intégrations futures | 55 | Pas de contrat versionné ni de documentation |
| Capacité IA | 70 | Socle présent, données métier absentes |
| Qualité du code / tests | 45 | 232 `any`, 0 test métier, monolithes de 1500-2500 lignes |

---

## 2. Forces réelles

1. **Moteurs séparés et propres.** `supabase/functions/_shared/vqos/` : `decision-engine.ts`
   décide, `calculation-engine.ts` calcule et ne décide rien, `index.ts` orchestre
   (`runQuote`), sortie scindée `public` / `technical` — la confidentialité stratégique
   demandée est réellement implémentée au niveau du type de retour.
2. **Aucune duplication du moteur de calcul.** `src/lib/jsc/engine.ts` est un simple
   relais vers l'edge function ; aucune règle de prix côté client. Point souvent raté
   dans ce type de plateforme.
3. **Zéro valeur codée en dur dans le moteur** : 22 paramètres pilotés depuis
   `jsc_settings`.
4. **Admin piloté par métadonnées** : `src/lib/jsc/config.ts` + `ResourceManager.tsx`
   donnent un CRUD complet pour toutes les ressources sans code par écran.
5. **Module SEO industriel** mature : 1 535 pages, QA automatisée, sitemap dynamique,
   GSC/GA4, cache IA — largement au-delà du niveau attendu.
6. **RLS active partout** : le linter ne remonte **aucune erreur**, uniquement des
   avertissements.

---

## 3. Risques critiques (bloquants V1.0)

### C1 — Aucun trigger n'est installé sur les tables `jsc_*`
Vérification en production :
`information_schema.triggers where event_object_table like 'jsc_%'` → **0 ligne**.

Conséquences directes, toutes silencieuses :
- `jsc_assign_number` ne s'exécute jamais → `request_number`, `quote_number`,
  `order_number`, `invoice_number` resteront **NULL**. Des factures sans numéro sont
  un problème légal, pas seulement technique.
- `jsc_audit_trigger` ne s'exécute jamais → le journal d'audit ne capture **aucune**
  écriture sur le flux commercial. Les 111 lignes de `jsc_audit_log` proviennent
  d'appels applicatifs, pas des triggers.
- `updated_at` n'est jamais rafraîchi → toute logique incrémentale et tout diagnostic
  chronologique sont faussés.
- `jsc_track_status` ne s'exécute jamais → `jsc_status_history` reste vide.

**Gravité : critique. Priorité 1. Effort : faible (1 migration).**

### C2 — Le flux commercial n'a aucune transition automatisée
Traçage du code : les passages Estimation → Soumission, Soumission → Commande,
Commande → Livraison et Livraison → Facture sont de **simples changements de statut**
dans le Kanban (`JscPipeline.tsx`). Aucun code n'insère dans `jsc_quotes`,
`jsc_orders`, `jsc_deliveries` ni `jsc_invoices` à partir de l'étape précédente.

Concrètement : un administrateur doit ressaisir manuellement les montants d'une
estimation calculée dans la soumission, puis dans la commande, puis dans la facture.
Rien ne garantit la cohérence des montants entre les quatre documents, et le
`settings_snapshot` prévu pour l'auditabilité perd son sens.

**Gravité : critique. Priorité 1. Effort : élevé (le vrai chantier de la V1.0).**

### C3 — Le référentiel de production est vide
Comptages réels : `jsc_materials` 0, `jsc_suppliers` 0, `jsc_pickup_locations` 0,
`jsc_trucks` 0, `jsc_drivers` 0, `jsc_transport_rates` 0, `jsc_taxes` 0, `jsc_zones` 0,
`jsc_clients` 0, `jsc_requests` 0.

Le Decision Engine ne peut retourner **aucun plan** : l'assistant `/soumission` échoue
ou renvoie un résultat vide pour tout visiteur. La plateforme est aujourd'hui
non fonctionnelle sur son parcours principal, indépendamment de la qualité du code.
`jsc_taxes` vide signifie en plus TPS/TVQ non appliquées si des données arrivaient.

**Gravité : critique. Priorité 1. Effort : moyen (saisie/import du référentiel réel).**

---

## 4. Risques majeurs

### M1 — Deux CRM parallèles et actifs
Ancien flux `submissions` (318 lignes) / `transport_requests` — encore utilisé par
`submit-transport-request`, `AdminTransportRequests.tsx`, `AdminOperations.tsx`,
`AdminBusinessIntelligence.tsx`, les 4 pages Entrepreneur, `CrmDetail.tsx` — coexiste
avec le nouveau flux `jsc_*` sans pont, sans migration, sans marquage « deprecated ».
Deux back-offices, deux BI, deux parcours de suivi client. Risque de double comptage
des KPI et de clients invisibles selon le formulaire utilisé.
**Décision produit requise avant tout développement supplémentaire :** migrer le legacy
vers `jsc_*`, ou documenter une segmentation volontaire (remblai vs vrac) et cloisonner
les tableaux de bord.

### M2 — Le module Estimation n'a aucune interface
`jsc_estimates` est écrit par `quote-assistant` mais n'est déclaré nulle part dans
`src/lib/jsc/config.ts` (aucune occurrence de « estimate »). Impossible pour un
administrateur de consulter, comparer ou retenir une estimation, alors que c'est le
document qui porte la trace complète de la décision moteur.

### M3 — Aucun test sur le code financier
`src/test/` contient uniquement `example.test.ts`. `calculation-engine.ts` (taxes,
marges, arrondis, coûts) n'a aucun test. Une régression sur les taxes ne serait
détectée qu'à la facturation client.

### M4 — Index manquants sur les clés étrangères
Plus de 80 colonnes FK sans index, dont l'intégralité du flux : `jsc_orders`
(11 FK non indexées), `jsc_deliveries` (7), `jsc_estimates` (7), `jsc_invoices`,
`jsc_quotes`, `jsc_incidents`. Sans effet aujourd'hui (tables vides) mais garantit
une dégradation rapide dès quelques milliers de commandes, et rend les
jointures BI coûteuses.

### M5 — Incohérences de paramétrage
`numbering_delivery_prefix` et `numbering_project_prefix` ont `value_type = "number"`
alors que leur valeur est `"LIV-"` / `"PRJ-"` (les 5 autres préfixes sont bien `text`).
Par ailleurs `margin_percent`, `default_margin_percent`, `fuel_surcharge_percent`,
`min_order_amount` et `buffer_time_minutes` sont tous à 0 : le moteur vend
actuellement à prix coûtant.

### M6 — Coût du cron SEO
`pg_stat_statements` : le bloc cron `seo-notify-google` totalise 97 s cumulées pour
282 exécutions (moyenne 345 ms, pic 1,09 s) et le sondage de la file d'e-mails a été
appelé **920 686 fois**. Fonctionnel, mais c'est une charge permanente inutile sur une
base qui devra bientôt servir l'exploitation temps réel.

---

## 5. Points mineurs

- **Monolithes** : `AdminSeoManager.tsx` 2 537 lignes, `Admin.tsx` 1 528,
  `TransportRequest.tsx` 1 218, `EntrepreneursAdmin.tsx` 934, `config.ts` 781.
- **232 `any`** dans 43 fichiers, dont le contournement systématique
  `supabase.from(table as never) as any` (`operations.ts:132`) qui supprime toute
  vérification des noms de colonnes à la compilation.
- **Pas de couche d'accès aux données commune** : 233 appels `supabase.from(` dispersés
  pour seulement 62 blocs `catch`.
- **Tableaux non responsives** (pas de `overflow-x-auto`) : `AdminBlog.tsx`,
  `AdminBlogMesh.tsx`, `TerritorialCoverage.tsx`, `PublicationDashboard.tsx`,
  `ExcelImportModal.tsx`, `GoogleSheetImportModal.tsx`.
- **Sécurité** : 177 avertissements linter (aucune erreur) — surtout des fonctions
  `SECURITY DEFINER` exécutables par `anon`/`authenticated`, plus un bucket public
  listable. À réduire par `REVOKE EXECUTE` ciblés.
- **8 edge functions sans `verify_jwt`** — justifié pour les webhooks et l'OAuth, mais
  `quote-assistant` (écriture CRM publique) mérite une limitation de débit.
- **API** : aucun préfixe de version, aucun contrat documenté, réponses non
  standardisées entre les 53 fonctions. À traiter avant toute intégration tierce.
- **IA** : socle solide (cache, journal des appels, brief BI), mais les agents
  répartiteur / commercial / téléphonique n'ont aujourd'hui aucune donnée métier
  à exploiter (cf. C3).

---

## 6. Scénarios métier à valider (tests d'acceptation V1.0)

Aucun de ces scénarios n'est aujourd'hui exécutable de bout en bout.

| # | Scénario | État actuel |
|---|---|---|
| 1 | Première demande d'un nouveau client → facture payée | Bloqué (C2, C3) |
| 2 | Plusieurs livraisons sur un même projet | `jsc_projects` existe, pas d'agrégation |
| 3 | Plusieurs fournisseurs possibles → sélection du moins cher | Logique présente dans le Decision Engine, **non testée** |
| 4 | Plusieurs transporteurs disponibles → mise en concurrence | Idem, non testée |
| 5 | Modification des tarifs après une soumission | `settings_snapshot` prévu mais jamais figé faute de conversion |
| 6 | Annulation d'une commande | Statut disponible, aucun effet en cascade |
| 7 | Livraison en retard | Détecté par le BI, aucune alerte opérationnelle |
| 8 | Incident sur chantier | `jsc_incidents` opérationnel |
| 9 | Multi-entreprises | 1 seule entreprise en base, cloisonnement jamais éprouvé |

---

## 7. Checklist de mise en production

### Priorité 1 — Bloquants (avant toute utilisation réelle)
- [ ] Installer les triggers manquants sur toutes les tables `jsc_*` :
      `jsc_assign_number`, `jsc_audit_trigger`, `touch_updated_at`, `jsc_track_status`.
- [ ] Vérifier après installation qu'une insertion de test produit bien
      `DEM-2026-00001`, une ligne d'audit et un `updated_at`.
- [ ] Charger le référentiel réel : matériaux, densités, fournisseurs, lieux de
      chargement, camions, chauffeurs, zones, tarifs de transport, **TPS 5 % / TVQ 9,975 %**.
- [ ] Définir des marges non nulles (`margin_percent`, `default_margin_percent`).
- [ ] Implémenter les conversions serveur : estimation retenue → soumission →
      commande → livraisons → facture + lignes de facture, dans une transaction unique,
      avec figement du `settings_snapshot`.
- [ ] Corriger `value_type` des préfixes `LIV-` et `PRJ-` (`number` → `text`).
- [ ] Trancher le sort du legacy `submissions` / `transport_requests` (migration ou
      cloisonnement documenté).

### Priorité 2 — Majeurs (avant ouverture aux clients)
- [ ] Déclarer le module Estimations dans `config.ts` (consultation + sélection).
- [ ] Tests unitaires du Calculation Engine : taxes, marges, arrondis, minimums,
      conversion volume ↔ tonnage.
- [ ] Créer les index sur les 80+ colonnes FK, en priorité `jsc_orders`,
      `jsc_deliveries`, `jsc_estimates`, `jsc_invoices`.
- [ ] Contrainte applicative : une seule estimation `is_selected` par demande.
- [ ] Jouer les 9 scénarios métier ci-dessus sur des données réelles.
- [ ] Valider le cloisonnement multi-entreprises avec une 2e entreprise de test.
- [ ] Limiter le débit de `quote-assistant` (fonction publique en écriture).
- [ ] Vérifier la sauvegarde/restauration de la base et documenter la procédure.

### Priorité 3 — Qualité et durabilité
- [ ] `REVOKE EXECUTE` sur les fonctions `SECURITY DEFINER` internes ; fermer le
      listage du bucket public.
- [ ] Ajouter `overflow-x-auto` aux 6 écrans identifiés (ou au composant `ui/table`).
- [ ] Découper `AdminSeoManager.tsx`, `Admin.tsx`, `TransportRequest.tsx`.
- [ ] Introduire une couche d'accès aux données typée pour remplacer
      `supabase.from(table as never) as any`.
- [ ] Espacer les crons SEO et le sondage de la file d'e-mails.
- [ ] Documenter le contrat des edge functions publiques (versionnage `/v1`).
- [ ] Unifier la navigation admin : une seule porte d'entrée plutôt que
      Admin / AdminJsc / AdminOperations / Centre des Opérations en parallèle.

---

## 8. Conclusion

Vrac Québec OS possède le socle d'un vrai logiciel professionnel : les moteurs sont
mieux conçus que dans la majorité des ERP de ce segment, et la discipline
« zéro valeur codée en dur / confidentialité stratégique » est réellement respectée
dans le code.

Ce qui manque n'est pas de la conception, c'est du **raccordement** : les triggers ne
sont pas posés, les documents commerciaux ne se convertissent pas les uns dans les
autres, et le référentiel est vide. Tant que ces trois points ne sont pas traités, la
plateforme est une maquette très aboutie plutôt qu'un outil exploitable.

Les corriger — sans écrire un seul module nouveau — ferait passer la note de
**62/100 à environ 85/100** et rendrait la V1.0 défendable en production.
