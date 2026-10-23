# Demande de remblai à plusieurs emplacements — préparation (rien d'appliqué)

## Schéma actuel (lu en production, lecture seule, 2026-10-23)
- Une demande = une ligne `submissions` = une dompe.
- `submission_number` (entier interne) ≠ `dompe_number` (texte « Dompe N », séquence `dompe_number_seq`, trigger `zzz_assign_dompe_number`, index unique; 722 numéros, 722 distincts) ≠ `id` (UUID).
- `transport_requests.request_number` (DT-xxxx) est un autre compteur, sans lien.
- `submission_sites` / `get_submission_sites` = relation demande ↔ dompe approuvée (pas des emplacements de livraison).
- Aucun regroupement de demandes n'existe.

## Proposition (`0240_..._NON_APPLIQUEE.sql`)
- Nouvelle table `submission_request_groups` (demande principale, numéro `DR-xxxx` sur compteur distinct, clé anti-doublon unique).
- `submissions.request_group_id`, `location_index`, `location_label` (nullable) : chaque emplacement reste une ligne existante, avec son propre numéro de dompe, ses coordonnées, son statut → carte, CRM et statuts inchangés et indépendants.
- RPC `create_multi_location_request` : création atomique, limite 5, refus d'un emplacement non géolocalisé, rejeu idempotent.
- Anciennes demandes : `request_group_id` NULL, aucune conversion.

## Préparé dans l'aperçu
- `src/lib/parcours/multi-sites.ts` : règles (limite 5, géolocalisation indépendante obligatoire, positions identiques refusées, retrait, contact une seule fois), coupe-circuit `MULTI_SITES_SERVER_READY = false`.
- `src/test/multi-sites.test.ts` : 7 tests réussis.

## Reste à faire (non fait)
- Section « Où souhaitez-vous recevoir du remblai ? » dans le formulaire, carte, CRM, suivi client, courriel.
- Adaptation de `submit-parcours` (copie préparée), colonnes exactes de l'insertion, droits portail par groupe.
- Tests isolés 1–14 sur base jetable; aucun n'a été joué sur le serveur.

## Mise à jour 2026-10-23 14:20 UTC
- Formulaire (aperçu) : section « Où souhaitez-vous recevoir du remblai ? » dans l'étape adresse de /remblai (`ExtraLocations.tsx`), emplacements B–E, retrait, erreurs par emplacement, doublon de position refusé; envoi bloqué si adresses supplémentaires tant que `MULTI_SITES_SERVER_READY = false`. Une seule adresse : parcours inchangé.
- SQL préparé : validation complète avant toute insertion (aucun numéro de dompe consommé sur refus). Un échec en cours d'insertion annule tout mais laisse un trou dans `dompe_number_seq` (comportement existant des séquences).
- CRM/carte : aucune modification d'affichage; chaque emplacement = fiche `submissions` existante. Indicateur discret « Demande DR-xxxx · n emplacements » à ajouter après migration.
