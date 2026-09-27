# CRM-ENT-01 — CRM privé par entreprise + assistance super admin

Note : CATALOGUE-03 (lots C à G) est mis en pause et reste noté dans la feuille de route. Il reprendra après ce lot, sauf avis contraire.

## Constat de départ (audit rapide)
- Des entreprises existent déjà (`jsc_companies`) avec leurs membres et leurs rôles (`jsc_company_members` : proprietaire, gestionnaire, mecanicien, chauffeur, comptabilite). La flotte les utilise déjà, avec des règles d'accès côté base (`fleet_can_*`), le sélecteur d'entreprise et le bandeau « Mode support ».
- Le CRM admin (`AdminCrm`, `CrmDetail`, `TodayPanel`, relances, `crm_activities`, `crm_documents`, `crm_audit_log`) est rattaché au propriétaire, pas à une entreprise. On le réutilise comme modèle d'interface, sans modifier ses données.
- `jsc_clients` et `jsc_quotes` ont déjà un `company_id` et peuvent servir de base.

## Ordre de livraison (tout se fait dans la prévisualisation, rien n'est publié)
1. **Fondations et permissions**
   - Fonctions de base `crm_can_read / crm_can_write / crm_can_finance / crm_can_admin(company_id)`, calquées sur `fleet_can_*`. Le super admin a toujours accès, quel que soit le forfait.
   - Ajout du rôle « lecture seule » et d'une grille de droits par rôle : consulter, créer, modifier, archiver, exporter, soumission, accès financier, gestion des membres.
   - Nouvelles tables avec `company_id` obligatoire et des règles séparées pour lire, créer, modifier et supprimer : `ent_crm_leads` (opportunités), `ent_crm_contacts`, `ent_crm_addresses`, `ent_crm_projects` (chantiers), `ent_crm_tasks`, `ent_crm_quotes` + `ent_crm_quote_lines` + `ent_crm_quote_versions`, `ent_crm_activities`, `ent_crm_pipeline_stages`, `ent_crm_saved_views`, `ent_crm_services` (prestations/tarifs privés), `ent_crm_network_links` (demandes Vrac Québec suivies). Les clients réutilisent `jsc_clients`.
   - Un déclencheur empêche de rattacher un lien parent/enfant à une autre entreprise.
   - Historique : chaque modification est inscrite dans `crm_audit_log` avec `company_id` et l'origine (`entreprise` ou `support_vrac_quebec`), avec les valeurs avant et après.
   - Fichiers : dossier privé `company/<id>/…` avec des règles de stockage vérifiées par `crm_can_read`.
   - Les anciens dossiers ne sont jamais rattachés automatiquement à une entreprise.
2. **Dossiers et pipeline** : création rapide, fiche client (plusieurs contacts, adresses et chantiers), conversion lead → client qui garde l'historique, détection des doublons dans la même entreprise, fusion explicite, vue liste et Kanban, étapes personnalisables, motif de perte, vues enregistrées, filtres et tris côté serveur avec pagination, critères conservés dans l'adresse de la page.
3. **Tâches et soumissions** : tâches avec responsable, échéance et dossier lié ; résultat conservé dans l'historique ; calendrier. Soumissions avec lignes, unités, transport, machinerie et main-d'œuvre, inclusions et exclusions, taxes selon les règles existantes (`platform/tax.ts`), versions, PDF téléchargeable sans envoi. Acceptation documentée (source et auteur), puis création d'un chantier sans doublon.
4. **Métiers et intégrations** : l'entreprise choisit ses activités, et des champs adaptés s'ajoutent au formulaire selon le métier (transport en vrac, excavation, paysager, pavage, déneigement, autre), dans un seul CRM. Réutilisation du catalogue de matériaux et de la flotte. « Ajouter une demande réseau à mon suivi » : une seule fois par entreprise, les notes restent privées et la demande partagée n'est pas modifiée. Import CSV (aperçu, correspondance des colonnes, doublons, compte rendu) et export filtré qui respecte les droits financiers. Accès selon l'abonnement, sans prix ni facturation réelle.
5. **Assistance et vérifications** : bouton « Ouvrir le CRM de cette entreprise » dans la fiche entrepreneur de l'administration, bandeau « Assistance Vrac Québec — [Entreprise] », retour à l'administration, ouverture journalisée par une fonction serveur. Le changement d'entreprise vide les caches et les brouillons (clés propres à chaque entreprise).

## Navigation entrepreneur (/entrepreneur/crm/…)
Aujourd'hui · Leads et opportunités · Clients et contacts · Soumissions · Chantiers · Tâches et calendrier · Documents · Rapports · Équipe et paramètres. Le tableau de bord sépare les montants estimés, acceptés, facturés et encaissés.

## Vérifications prévues
Deux entreprises fictives (transport en vrac et paysager), de vraies sessions ordinaires (propriétaire, membre des deux entreprises, employé limité, membre révoqué) et le super admin. Scénarios : parcours complet du lead au chantier, rechargement de page, accès refusé par l'interface, l'adresse, un appel direct ou un fichier, import/export, demande réseau commune, mobile et ordinateur. Données fictives supprimées à la fin, aucun courriel ni paiement.

## Détails techniques
- Aucune modification des tables du CRM admin existant, ni du moteur dompes, des adresses, du SEO ou de l'historique.
- Code : `src/lib/entcrm/` (tenant, api, permissions, métiers), `src/pages/entcrm/*`, réutilisation de `FleetTenantBar`.
- Livraison en plusieurs messages successifs, sans m'arrêter pour demander de continuer. Le bilan final distinguera ce qui est développé, vérifié et restant.
