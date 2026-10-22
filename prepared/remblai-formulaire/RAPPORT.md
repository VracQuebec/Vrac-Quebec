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
- Dernière exécution, 22 octobre 2026 à 22:31 UTC : **66 réussis, zéro échec, 24 ignorés**, sur huit fichiers. Le fichier original-form compte 27 tests, dont 12 sur PostgreSQL jetable ; première modification par le véritable gestionnaire préparé → SQL → relecture, rejeu identique, deux dossiers/clients distincts, refus autre courriel, identité récente, révocation, mauvais secret, champs facultatifs et concurrence. Les 24 tests ignorés attendent leurs autres clusters opt-in, ils ne sont pas des réussites.
- Durant la préparation, six échecs ont révélé une concaténation involontaire des notes et une normalisation différente du résultat rejoué. Ces défauts ont été corrigés ; la suite finale ci-dessus ne présente aucun échec.
- Reproduction : `bash prepared/remblai-formulaire/test-local.sh`. Aucun paramètre de connexion hébergée lu. Le script démarre un cluster vide et le détruit à la fin.
- Les tests PostgreSQL utilisent uniquement un cluster `/tmp/remblai-form-*` sur loopback 55438, détruit après exécution. Aucune connexion hébergée.
- Parcours navigateur fictif avec vérification par code TEST → comparaison des sept titres et champs à `/remblai` → modification de l'adresse, quantité/unité, matériau conditionnel, accès, photo, nom et notes → confirmation → rechargement → relecture des valeurs/photo conservées → refus d'un nom invalide. Vérifié à 420×757, 768×1024 et 1280×1800, sans débordement ni erreur JavaScript. Captures et script : `/tmp/browser/remblai-final/`. Toutes requêtes hors de l'origine locale ont été bloquées. Cette vérification utilise le dépôt fictif du navigateur, pas le serveur hébergé.
- Assemblage local du point d'entrée préparé `owner-edge-entry.ts` par esbuild puis `deno check` du JavaScript assemblé : réussi. Ce contrôle résout les imports ; il ne constitue pas une vérification des types du serveur ni une exécution Cloud/Storage.
- Tests non exécutés : Cloud isolé complet, vrais appareils, courrier réel, géocodage après édition, stockage hébergé des nouvelles photos. Les suites SQL existantes nécessitant un autre cluster sont ignorées et ne sont pas comptées comme réussies.

## Fichiers
Interface : `src/components/parcours/ParcoursForm.tsx`, `src/pages/RemblaiFollowup.tsx`.
Contrats/adaptateurs : `src/lib/remblai/{public-form,service,preview,cloud-client,isolated-client}.ts`.
Préparation : `prepared/exec01b/endpoint.ts`, `prepared/remblai-formulaire/{photos.ts,formulaire-NON-APPLIQUE.sql,AGENTS.md,RAPPORT.md}`.
Tests : `src/test/remblai-original-form.test.ts`, `prepared/remblai-formulaire/test-local.sh` ; documentation : `AGENTS.md`, `roadmap.md`.

## Comparaison détaillée finale
Titre : « Besoin de remplir un terrain ? », identique à la page publique (l’espace insécable avant le point d’interrogation ne change pas le texte).

| Étape | Titre partagé exact | Champs et conditions partagés |
| --- | --- | --- |
| 1 | Où avez-vous besoin du matériel ? | Adresse (minimum 5 caractères), code postal facultatif, indicateur de validation si coordonnées enregistrées |
| 2 | Quelle quantité approximative ? | Quantité, unité existante du catalogue, « Je ne sais pas », lien calculateur ; quantité mal formée refusée dans les deux parcours |
| 3 | Quel est votre projet ? | Les mêmes choix PROJECT_USAGE_OPTIONS, facultatifs ; ancienne réponse hors catalogue affichée et conservée sans remplacement automatique |
| 4 | Quel type de matériau peut convenir ? | Même catalogue illustré, au moins un matériau ; précision lorsque « Autre » ou « Je ne suis pas certain » est choisi |
| 5 | Comment est l'accès au terrain ? | Même question camion lourd, mêmes choix, critères conditionnels lorsqu'une réponse d'accès existe |
| 6 | Photos (optionnel) | Mêmes catégories et ajout/retrait ; références initiales conservées, signature temporaire non enregistrée ; photo inaccessible signalée sans suppression automatique |
| 7 | Vos coordonnées | Nom (minimum 2 caractères), téléphone (10 chiffres minimum), courriel valide, précisions facultatives |

Différences intentionnelles : courriel propriétaire en lecture seule ; bouton final « Enregistrer ma demande » plutôt que « Envoyer ma demande » ; bouton Annuler ; anciennes précisions sans marqueur fiable non éditables et signalées. Photos nouvelles d'édition : formats JPEG/PNG/WebP et limite de 4 Mo vérifiés avant stockage privé ; cette protection est plus stricte que l'ancien ajout public, qui accepte `image/*`. Aucun nouveau champ métier ajouté. L'assistant expérimental n'est pas actif dans la référence standard et ses réponses non structurées ne sont pas reconstruites.

## Corrections supplémentaires de cette session
- Étapes de réception issues de la même définition ; validation des décimales partagée.
- Descriptions inchangées conservées à l'identique ; historique sans marqueur laissé intact même lors d'une autre modification, et refus d'y injecter de prétendues notes récupérées.
- Réponse du premier enregistrement et du rejeu rendue par la même fonction préparée, y compris valeurs héritées et signatures photos.
- Confirmation du portail refusée si le résultat n'est pas le dossier exact avec une version supérieure ; formulaire original absent après modification = pas de confirmation.
- Refus d'une photo privée d'un autre dossier même lorsqu'une ancienne liste la contient.

## Activation future / arrêt obligatoire
Une migration **de fonctions uniquement** est préparée : `exec01_projection(uuid,boolean)` et `exec01_dispatch(jsonb)`. Aucun ajout de table/colonne/index, aucune permission/RLS, aucun backfill ni réparation historique. Le fichier est un prototype LOCAL, pas une migration prête à appliquer en production : il refuse une forme inattendue et une seconde application, mais les empreintes exactes doivent encore être épinglées sur une référence autorisée.
L'inverse local réexécute uniquement les deux définitions originales capturées en mémoire et vérifie l'égalité intégrale ; aucun inverse de production n'est exécuté ou déclaré prêt.
Ordre restant :
1. Obtenir une référence autorisée exacte des deux définitions et du paquet serveur courant ; épingler empreintes et inverse des deux fonctions, vérifier compatibilité avec le correctif durable du lien. Arrêt si divergence.
2. Assembler un paquet de déploiement autonome dans la préparation, sans dépendance à `src/` au moment du déploiement ; vérifier ses types Deno. Le simple JavaScript assemblé testé ici n'est pas le paquet final.
3. Valider ce paquet dans un environnement réellement distinct disposant des protections de la base, identité et stockage privé. Tests nécessaires : ajout/signature/réouverture des photos, géocodage après changement d'adresse, erreur réseau et rejeu. Sans environnement accessible, **activation bloquée**.
4. Après autorisation explicite uniquement, appliquer le SQL épinglé des deux fonctions ; vérifier les définitions et permissions inchangées avant le déploiement du serveur. Aucun ajout de table/colonne/index prévu ; aucune permission/RLS à modifier.
5. Après autorisation, déployer le serveur validé puis publier l'interface ; ne pas publier seul en promettant un enregistrement absent côté serveur.
6. Essai réel et courrier seulement après autorisation distincte. Retour arrière ciblé : paquet précédent et définitions originales épinglées, aucune restauration globale ni suppression de demande.
Ne pas publier seul le formulaire en prétendant que le serveur actuel sait enregistrer `publicForm`. Toute référence divergente, donnée manquante, mutation hors dossier ou faux succès impose l'arrêt.

**Aucune production, publication, migration hébergée, permission, demande réelle, courriel réel ou contenu SEO modifié.**