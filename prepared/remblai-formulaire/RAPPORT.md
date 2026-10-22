# Cohérence du formulaire personnel — préparation uniquement

## Différences identifiées
La référence publique `/remblai` utilise `ParcoursForm variant="reception"`, sept étapes : adresse, quantité, projet, matériaux, accès, photos, coordonnées. Son titre de page est « Besoin de remplir un terrain ? ».
Le portail éditait auparavant `ReceptionConditionsForm` : capacité totale/restante, minimums, mélanges, véhicules, horaires, modes de réception et consentement. Il n'affichait pas l'adresse, le code postal, le projet, les matériaux originaux, le nom/téléphone/courriel ou les précisions. Les choix de matériaux et les règles n'étaient pas ceux du public.

## Correction
- Le portail réutilise le **même ParcoursForm** et le même titre, les sept étapes, choix de matériaux, catégories de photos, conditions d'affichage et validations obligatoires. Le bouton final devient « Enregistrer ma demande » ; le courriel est visible mais protégé, car il définit le propriétaire du lien.
- Édition sans stockage de données personnelles dans le brouillon local public. Annulation disponible ; les valeurs viennent de la projection `publicForm`, jamais du brouillon du site public.
- Les conditions opérationnelles existantes restent séparées, conservées et non réinitialisées par l'édition originale.
- Sans projection serveur disponible, le portail signale explicitement que seuls les anciens champs de conditions peuvent être enregistrés ; aucune valeur réelle fictivement préremplie.
- Le serveur préparé valide une liste stricte de champs ; identifiant, propriétaire, entreprise, statut, priorité et coordonnées ne sont pas éditables. Le SQL conserve autorisation lien/dossier, identité récente, version, confirmation et idempotence.
- Une adresse modifiée invalide les anciennes coordonnées géographiques plutôt que de les conserver faussement. Le géocodage ultérieur reste à valider avant activation.
- Photos initiales conservées seulement si déjà liées au dossier exact ; nouvelles photos privées validées par contenu, JPEG/PNG/WebP, 4 Mo. Pas d'élargissement de lecture publique.

## Données réellement stockées / limites
Adresse/code postal, quantité/unité, projet (`property_type`), matériaux/précision, accès, critères, photos/catégorie, nom/téléphone/courriel sont stockés par `submit-parcours` dans `submissions`. Les précisions libres sont le suffixe « Notes du demandeur : » de `description`; son texte multiligne est conservé, tout comme le préfixe historique. Les notes internes ne sont jamais exposées.
Date, délai et camion ne sont **pas des étapes du parcours réception** ; les valeurs historiques éventuelles restent intactes, aucun champ inventé.
L'assistant expérimental matériaux est désactivé par défaut. Description/refus/caractérisation détaillés ne sont pas stockés dans des champs structurés : seulement dans le résumé des précisions si ce drapeau était activé. Ils ne sont pas reconstruits ni prétendus éditables séparément ; le résumé complet reste dans les précisions. Des notes historiques sans marqueur fiable restent conservées en description, mais non interprétées automatiquement.
Le courriel propriétaire ne peut pas être changé dans ce parcours. Une récupération d'identité distincte est nécessaire.

## Tests et preuves
- Tests automatisés ciblés : **51 réussis, zéro échec, 24 ignorés**, dont 20 tests du nouveau fichier (11 tests de contrat et 9 tests PostgreSQL). Contrat strict, validation, projection des données réellement insérées, modification/relecture PostgreSQL jetable, identité récente, refus autre demande, autre courriel, révocation, mauvais secret, champs facultatifs et concurrence.
- Les tests PostgreSQL utilisent uniquement un cluster `/tmp/remblai-form-*` sur loopback 55438, détruit après exécution. Aucune connexion hébergée.
- Parcours navigateur fictif avec vérification par code TEST → modification de l'adresse, quantité/unité, matériau conditionnel, accès, nom et notes → confirmation → rechargement → relecture. Vérifié à 420×757, 768×1024 et 1280×1800, sans débordement ni erreur JavaScript. Captures `/tmp/browser/remblai-form/`.
- Tests non exécutés : Cloud isolé complet, vrais appareils, courrier réel, géocodage après édition, stockage hébergé des nouvelles photos. Les suites SQL existantes nécessitant un autre cluster sont ignorées et ne sont pas comptées comme réussies.

## Fichiers
Interface : `src/components/parcours/ParcoursForm.tsx`, `src/pages/RemblaiFollowup.tsx`.
Contrats/adaptateurs : `src/lib/remblai/{public-form,service,preview,cloud-client,isolated-client}.ts`.
Préparation : `prepared/exec01b/endpoint.ts`, `prepared/remblai-formulaire/{photos.ts,formulaire-NON-APPLIQUE.sql,AGENTS.md,RAPPORT.md}`.
Tests : `src/test/remblai-original-form.test.ts` ; documentation : `AGENTS.md`, `roadmap.md`.

## Activation future / arrêt obligatoire
Une migration **de fonctions uniquement** est préparée : `exec01_projection(uuid,boolean)` et `exec01_dispatch(jsonb)`. Aucun ajout de table/colonne/index, aucune permission/RLS, aucun backfill ni réparation historique. Le fichier est un prototype LOCAL, pas une migration prête à appliquer en production : il refuse une forme inattendue et une seconde application, mais les empreintes exactes doivent encore être épinglées sur une référence autorisée.
L'inverse local réexécute uniquement les deux définitions originales capturées en mémoire et vérifie l'égalité intégrale ; aucun inverse de production n'est exécuté ou déclaré prêt.
Ordre après autorisations distinctes : lecture technique des définitions et empreintes exactes → assemblage Deno du serveur préparé (imports actuellement Node/local) → validation Cloud réellement isolée avec Storage → paquet SQL et inverse exact épinglés → autorisation migration/déploiement/publication → essai réel séparément autorisé.
Ne pas publier seul le formulaire en prétendant que le serveur actuel sait enregistrer `publicForm`. Toute référence divergente, donnée manquante, mutation hors dossier ou faux succès impose l'arrêt.

**Aucune production, publication, migration hébergée, permission, demande réelle, courriel réel ou contenu SEO modifié.**