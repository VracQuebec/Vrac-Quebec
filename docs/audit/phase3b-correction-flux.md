# Phase 3B — correction ciblée du flux chantiers / demandes

## 1. Corrections effectuées
- Les valeurs réelles de `submissions.status` sont normalisées uniquement pour l'affichage.
- `archivé`, `perdu`, `terminée`, `refusée` et `annulée` ferment visuellement le dossier au lieu de le laisser « En traitement ».
- Le parcours visible comporte les sept étapes demandées, sans créer de statut enregistré.
- Les liens site, transport et voyage ne sont présentés que lorsqu'une relation explicite existe.

## 2. Champs réellement utilisés pour calculer l'étape
- Demande : `status`, `selected_site_id`, `site_validated_at`.
- Transport : relation explicite `origin_submission_id`, puis `status` et `lifecycle_status`.
- Voyage : relation explicite `cpn_trips.submission_id`, limitée aux demandes déjà autorisées. Un voyage non annulé est affiché comme relation, mais son existence seule ne signifie pas « En cours » puisqu'il n'a aucun état courant.

## 3. Correspondance statuts → affichage
- `nouveau` / `nouvelle` → **Besoin identifié**.
- `en analyse`, `message texte envoyé`, `soumission envoyée`, `en attente propriétaire` → **Recherche**.
- Site choisi ou validé, sans preuve plus avancée → **Solution trouvée**.
- Transport explicitement lié, sans preuve plus avancée → **Transport à organiser**.
- `soumission acceptée`, `acceptée`, `paiement effectué`, `en attente de livraison`, `planifiée`, ou transport confirmé/planifié → **Confirmé**.
- `en cours`, ou transport explicitement en cours → **En cours**.
- `archivé`, `perdu`, `terminée`, `refusée`, `annulée`, ou transport terminé → **Terminé**; le motif réel reste affiché.
- Une valeur inconnue reste lisible et revient prudemment à **Besoin identifié**.

## 4. Gestion de « Sens à confirmer »
- Le sens vient uniquement de `parcours_direction` et `deliver_or_remove`; le type technique `remblai`, le matériau et la quantité ne servent pas à l'inférer.
- Si le sens est absent ou contradictoire, **Sens à confirmer** est affiché et le matériau, la quantité et les autres renseignements connus restent visibles.
- **Informations à compléter** est réservé au cas où matériau et quantité sont réellement absents.

## 5. Lectures dupliquées
- Les écrans actifs des demandes, chantiers et activités utilisent déjà le fournisseur entrepreneur commun : aucun grand remaniement n'a été fait.
- La lecture des voyages a été ajoutée à ce fournisseur et filtrée aux identifiants des demandes déjà retournées.
- Les anciens chargeurs autonomes non montés et le compteur de voyages distinct ont été laissés intacts.

## 6. Tests exécutés et résultats
- Cas A–J couverts par tests unitaires : direction connue; direction vide avec matériau/quantité; archivée; perdue; soumission acceptée; site sélectionné; transport lié; sans transport; sans site; sans voyage.
- Tests supplémentaires : les sept étapes, valeurs inconnues, voyage annulé, association transport uniquement par `origin_submission_id`.
- Suite complète avant le dernier resserrement : **1 833 réussis, 13 ignorés**, aucune régression.
- Vérification réelle : **393×852, 320×667 et 1440×1000**, liste et détail sans débordement horizontal; matériau, quantité, « Sens à confirmer » et parcours confirmé visibles avec les données disponibles.
- Les requêtes POST observées sont des appels de lecture existants; aucune action d'écriture métier n'a été déclenchée.

## 7–12. Garanties de périmètre
7. Données modifiées : **NON**  
8. Tables créées : **NON**  
9. Migrations : **NON**  
10. RLS/permissions : **NON**  
11. Authentification : **NON**  
12. Publication : **NON**

## 13. Problèmes restant à traiter
- `cpn_trips` ne porte pas d'état « en cours » : la relation est affichable, mais ne peut pas prouver l'étape **En cours**. Aucun statut n'a été inventé.
- La comparaison d'isolation entre deux entreprises réelles reste non exécutable sans deux jeux de données autorisés; les règles d'accès n'ont pas été modifiées.
- Aucun appareil iPhone physique n'a été utilisé; les dimensions demandées ont été vérifiées dans un navigateur réel simulant ces formats.