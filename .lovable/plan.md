## Objectif

Transformer la fiche lead de l'admin en un vrai CRM dynamique où l'admin peut tout modifier directement, ajouter ses propres champs et voir l'historique de chaque changement.

## Ce qui sera livré (en 3 étapes)

### Étape 1 — Édition inline complète de tous les champs existants

Chaque champ d'une fiche lead devient cliquable et modifiable directement, avec sauvegarde automatique en quelques secondes. Plus besoin d'ouvrir un formulaire.

Champs rendus éditables :
- Nom, courriel, téléphone, adresse, code postal
- Matériaux, autre matériau, type de demande, type de propriété
- Quantité, tonnage, longueur/largeur/profondeur
- Contamination, accessibilité, machinerie + description
- Budget max + unité
- Statut, priorité, date limite, délai de livraison
- Description, notes internes
- Camion / entrepreneur assigné
- Visibilité aux entrepreneurs

Champs gardés en lecture seule (à ta demande) : numéro de soumission, numéro de Dompe, date de création, latitude/longitude.

Comportement :
- Cliquer sur un champ → il devient éditable
- Sortir du champ ou appuyer Entrée → sauvegarde automatique
- Petit indicateur visuel "Enregistré" / "Erreur"
- Listes déroulantes pour les champs à choix (statut, priorité, type, etc.)

### Étape 2 — Champs personnalisés

Une nouvelle section "Champs personnalisés" sur chaque fiche, plus une page de configuration pour l'admin.

L'admin pourra :
- Créer un nouveau champ (nom, type : texte / nombre / date / oui-non / liste de choix)
- Modifier ou supprimer un champ existant
- Voir et modifier les valeurs de ces champs sur chaque fiche, comme les champs natifs

Exemples d'usage : "Tags", "Source du lead", "Camion assigné", "Numéro de facture", "Nombre de chargements", etc.

### Étape 3 — Historique des modifications

Un onglet "Historique" sur chaque fiche qui montre :
- Quel admin a fait le changement
- Quand (date + heure)
- Quel champ a été modifié
- Ancienne valeur → nouvelle valeur

Toutes les modifications faites via l'édition inline (étape 1 + 2) sont enregistrées automatiquement.

## Détails techniques

### Base de données

Nouvelles tables :
- `custom_fields` : définition des champs personnalisés (clé, label, type, options, ordre)
- `submission_custom_values` : valeur de chaque champ perso pour chaque lead
- `submission_audit_log` : journal des changements (submission_id, field, old_value, new_value, user_id, user_email, changed_at)

Trigger Postgres sur `submissions` qui écrit dans `submission_audit_log` à chaque UPDATE, en récupérant `auth.uid()` et l'email courant. Trigger équivalent sur `submission_custom_values`.

RLS : seuls les admins lisent/écrivent ces tables.

### Frontend

- Nouveau composant `<InlineField>` réutilisable (texte, nombre, textarea, select, date, multi-select, switch). Debounce ~600 ms avant l'appel `update`.
- Refonte du panneau dépliable de `Admin.tsx` pour utiliser `<InlineField>` partout au lieu des affichages en lecture seule actuels.
- Nouvel onglet "Historique" et "Champs personnalisés" dans le panneau.
- Nouvelle page admin `/admin/champs` pour gérer les définitions de champs personnalisés.

### Hors scope

- Pas de modification du questionnaire public (côté client)
- Pas de changement aux courriels automatiques
- Pas de changement à la carte ni au géocodage

## Ordre de livraison

Je propose de livrer **étape 1 d'abord** dans cette session (c'est ce qui débloque le plus vite ton flow de travail), puis on fait étape 2 et étape 3 dans des messages suivants. Ça évite un seul commit gigantesque difficile à tester.

Confirme et je commence par l'étape 1.