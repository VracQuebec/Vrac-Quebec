# CRM-ENT-03 — Documents privés, tarifs, modèles métier et demandes du réseau

Tout se fait en prévisualisation. Aucune publication, aucun envoi réel, aucune facturation, aucun rattachement de client réel. CATALOGUE-03 (lots C à G) reste en pause dans la feuille de route.

## Ordre de livraison

### 0. Résidus de CRM-ENT-02B
- « Enregistrer la vue » masqué en lecture seule ; le serveur refuse aussi l'enregistrement.
- Test navigateur : créer, modifier, réutiliser une vue, puis vérifier qu'elle est toujours là après rechargement.
- Étape personnalisée : la créer, puis la supprimer alors qu'elle contient des dossiers, avec choix d'une étape de remplacement.
- Vérifier que les réglages de l'entreprise A ne changent rien chez B.

### 1. Documents et photos
- Ajout depuis un lead, un client, une soumission ou un chantier. Sélection multiple, appareil photo sur téléphone, titre, description, catégorie (avant travaux, après travaux, plan, devis, bon de livraison, billet de pesée, autre).
- Aperçu et téléchargement par lien temporaire, recherche par nom et par catégorie, archivage selon les droits.
- Barre de progression, message d'erreur clair et bouton « Réessayer ».
- Formats acceptés : JPG, PNG, WEBP, HEIC et PDF, 20 Mo au maximum. Cette limite est vérifiée par le serveur.
- Un fichier n'apparaît qu'une fois l'envoi confirmé.
- Un même fichier peut être relié à plusieurs dossiers sans être copié. « Retirer du dossier » est distinct de « Supprimer le fichier ».
- Quand un lead devient client ou qu'une soumission devient un chantier, les liens aux documents sont conservés.
- Les pièces destinées au client sont cochées une par une. Rien n'est ajouté automatiquement.

### 2. Confidentialité des fichiers
- Stockage privé dans `company/<id>/…`. Les règles d'accès passent par les fonctions de droits existantes.
- Un employé limité ou un chauffeur ne voit que les pièces des dossiers qui lui sont attribués, jamais les pièces commerciales par défaut.
- Super admin : consultation sans trace, modifications inscrites au journal confidentiel.

### 3. Catalogue privé de prestations et tarifs
- Pour chaque prestation : libellé, description, métiers, unité (heure, voyage, tonne, m³, m², mètre linéaire, unité, forfait), prix, inclusions et exclusions, validité, actif ou archivé, notes privées.
- Référence possible à un matériau du catalogue commun ou à un équipement, sans toucher aux prix des autres entreprises.
- Un prix absent s'affiche « À renseigner ». Un prix à zéro doit être voulu (case à cocher).
- Le coût interne et la marge sont réservés au propriétaire, au gestionnaire et aux rôles finances. Le serveur ne les transmet pas aux autres rôles et ils n'apparaissent jamais dans les PDF.
- Les exemples de démonstration portent la mention « fictif ».

### 4. Modèles de soumission par métier
- Six modèles de départ, modifiables et copiés dans chaque entreprise : transport, excavation, paysager, pavage, déneigement, personnalisé.
- Chaque modèle prévoit des sections, des lignes, des unités et des conditions. Les quantités et les prix restent vides.
- Depuis un dossier : choix du modèle, ajout des prestations privées, quantités, calcul avec les taxes existantes, soumission, PDF à l'identité de l'entreprise.
- Chaque ligne de version garde une copie figée du prix et du libellé.
- Sur un brouillon, le bouton « Actualiser les tarifs » montre les différences avant d'appliquer.
- Une soumission remise ou acceptée n'est jamais recalculée. Le mécanisme de révision est conservé.

### 5. Demandes du réseau
- Le bouton « Ajouter à mon CRM » n'apparaît que sur une demande que l'entreprise peut déjà voir (mêmes règles d'accès et d'abonnement qu'aujourd'hui).
- L'ajout crée une opportunité privée : référence à la demande source, provenance « Vrac Québec », responsable, étape et prochaine action.
- Un seul suivi par entreprise et par demande : un second clic ouvre le dossier existant.
- Aucun effet sur le statut public, la disponibilité ou l'attribution de la demande.
- Si la demande source change, un avis « Actualisation disponible » s'affiche, sans rien écraser.
- Si l'accès est retiré, les données de la source sont masquées. Les notes et pièces privées restent.

### 6. Aperçu du rattachement des clients réels (super admin, lecture seule)
- Nombre de clients calculé en direct, entreprise propriétaire actuelle (nom et identifiant), entreprise Transport JSC visée, correspondances et divergences, effets prévus.
- Aucune application dans ce lot.
- Test fictif : une correction faite dans Transport JSC apparaît dans la fiche CRM, tandis que la soumission figée reste inchangée.

### 7. Démonstrations
- Parcours A (transport), B (excavation, puis modification du tarif sans effet sur la soumission remise ou acceptée) et C (réseau, deux entreprises).
- Faits avec les sessions fictives existantes, y compris lecture seule et super admin. Un parcours sur téléphone (390 px), un sur ordinateur.
- Les anciens tests ne sont rejoués que pour les fonctions touchées.

## Détails techniques
- Migrations additives : `ent_crm_files`, `ent_crm_file_links` (objet, identifiant, pièce destinée au client), `ent_crm_services`, `ent_crm_templates`, `ent_crm_network_links` (unique par entreprise et demande, empreinte de la source), colonne `snapshot` sur les lignes et versions de soumission. Chaque table a `company_id` obligatoire, des GRANT, la sécurité par ligne et des politiques séparées pour lire, créer, modifier et supprimer via `entcrm_can_*`. Le garde `entcrm_same_company` s'applique aussi aux liens.
- Stockage : réutilisation d'un espace privé avec des règles par préfixe d'entreprise. La vérification du type et de la taille du fichier se fait côté serveur.
- Coûts internes : vue ou fonction RPC qui ne renvoie ces colonnes qu'aux rôles finances.
- Code : `src/lib/entcrm/{files,services,templates,network}.ts`, composants sous `src/components/entcrm/`, onglets ajoutés dans `EntrepreneurCrm.tsx`, bouton ajouté dans `EntrepreneurDemandeDetail.tsx`.
- Aucune modification du CRM admin, du moteur de dompes, des adresses, du SEO ni des indicateurs désactivés.
- Livraison en plusieurs messages successifs. Le bilan final distinguera ce qui est développé, ce qui est vérifié et ce qui reste à faire.
