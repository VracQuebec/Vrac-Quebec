# Phase 3B — correction ciblée du parcours

## Objectif
Aligner l’affichage entrepreneur sur les statuts et relations déjà enregistrés, sans migration, écriture métier, changement de sécurité ni publication.

## Modifications prévues
- Ajuster le calcul d’affichage des chantiers afin que `archivé` et `perdu` soient fermés, que les statuts acceptés/payés soient actifs et que les autres valeurs restent lisibles sans modifier `status`.
- Afficher « Sens à confirmer » lorsque le sens est absent ou contradictoire, tout en conservant matériau, quantité et renseignements connus.
- Aligner l’étape visible sur le parcours demandé : Besoin identifié, Recherche, Solution trouvée, Transport à organiser, Confirmé, En cours, Terminé.
- Fonder cette étape uniquement sur `status`, `selected_site_id`, `site_validated_at`, le transport explicitement lié par `origin_submission_id` et, si elle est lisible sans changement de sécurité, la relation voyage existante par `submission_id`.
- Réutiliser le fournisseur commun entrepreneur; supprimer seulement les lectures clairement dupliquées dans ce flux.
- Conserver la présentation actuelle et rendre les libellés courts sans ajouter de grande carte.

## Validation
- Ajouter ou compléter les tests A à J exigés, y compris les variantes de statut, site, transport et absence de relations.
- Vérifier qu’aucune requête d’écriture n’est déclenchée et qu’aucune migration, table, règle d’accès, authentification ou route n’est modifiée.
- Contrôler les écrans réels en 1440 px, iPhone 393×852 et largeur 320 px, sans débordement horizontal.
- Produire le rapport final en 13 points et laisser la version uniquement en TEST.

## Limite d’arrêt
Si la lecture fiable d’un voyage exige une migration ou un changement de sécurité, ne pas l’ajouter et documenter précisément ce blocage.
