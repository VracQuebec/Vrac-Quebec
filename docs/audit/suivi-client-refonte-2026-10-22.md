# Suivi personnel — refonte en aperçu uniquement

## Résultat

Identité existante, logo local, vert officiel, fond clair et texte anthracite. En-tête compact, résumé prioritaire, état réel, actions avant les détails, cinq accordéons et photos privées via le composant existant. Propositions et livraisons conservées, états vides contextualisés. Aucun pourcentage ni phase d’analyse inventée.

La ville reste le secteur affiché : aucune extension de l’exposition de l’adresse. La quantité du formulaire original est utilisée lorsqu’elle est récupérable; sinon les conditions existantes, sans conversion. Le statut commercial et le commentaire opérationnel interne ne sont plus affichés dans la consultation personnelle. Les données sauvegardées restent inchangées.

## Fichiers

- `src/pages/RemblaiFollowup.tsx` : composition visuelle, chargement/erreur/identité, regroupement des actions; handlers, confirmation, version et identifiant d’opération conservés. Délai existant de renvoi également appliqué au bouton avant modification.
- `src/components/remblai/RequestOverview.tsx` : en-tête, résumé et étapes attestées.
- `src/components/remblai/RequestDetails.tsx` : détails repliables et réemploi de `ReceptionPhoto`.
- `src/components/remblai/RequestActivity.tsx` : listes existantes et messages vides.
- `src/lib/remblai/presentation.ts` : transformation d’affichage pure, sans autorisations ou mutation.
- `src/index.css` : tokens locaux à la page, contraste du bouton vert, coins 8 px, cibles 44 px et mouvement réduit.
- `src/test/remblai-presentation.test.ts` : dix tests de fidélité des états et données.
- `AGENTS.md`, `roadmap.md`, présent bilan : règles et suivi documentaire.

## Validation réellement exécutée

Commande : `bunx vitest run src/test/remblai-presentation.test.ts src/test/remblai-exec01.test.ts src/test/remblai-exec01-handler.test.ts src/test/remblai-portal-errors.test.ts src/test/remblai-original-form.test.ts`.

**58 tests réussis, 22 ignorés** : cas SQL du formulaire original non exécutés, nécessitant leur environnement jetable. Aucune migration exécutée pour cette refonte. Dernier journal de compilation : `build OK`.

Playwright Chromium, demandes entièrement fictives :

- 360, 768 et 1280 px : active sans proposition, proposition transmise, pause, fermeture, données facultatives absentes.
- Même trois tailles : chargement, panne, accès non vérifié, dossier/lien refusé, expiration/interdiction d’un autre dossier simulées.
- 33 combinaisons contrôlées; aucune largeur de page supérieure à l’écran, tous les boutons visibles du contenu ≥ 44 px.
- Code TEST demandé et vérifié; bouton modifier bloqué avant vérification; ouverture/annulation du formulaire original; confirmer le besoin; pause; reprise; sauvegarde des conditions; annulation de fermeture puis fermeture confirmée; rechargement et lecture du dossier fermé avec quantité et cinq événements conservés.
- Aucune erreur JavaScript dans les scénarios de consultation instrumentés.
- Captures téléphone/tablette/ordinateur, accès protégé et fermeture inspectées visuellement. Scripts et captures : `/tmp/browser/suivi-client/`.

Les fonctions réelles sont interceptées ou bloquées dans les contextes navigateur. Le dépôt fictif existant sert aux mutations; les scénarios d’erreurs utilisent des réponses locales interceptées. Ce ne sont pas des essais de sécurité hébergés.

## Limites et problèmes préexistants

- Le serveur confond initialement lien refusé et identité non vérifiée (403). La page conserve le parcours sécurisé existant : aucune donnée privée, vérification d’abord, refus explicite après tentative de code. Pas de modification du contrat serveur pour distinguer ces cas.
- Le nettoyage précoce des paramètres personnels supprime `scenario`. Les tests de refus ne reposent donc pas sur ce paramètre, mais sur des réponses interceptées. Ce comportement de confidentialité n’a pas été changé.
- Une proposition n’est dite disponible que si sa soumission est transmise (`soumission_envoyee`). `demande` seule n’est pas une proposition disponible, `accepte` ne confirme pas de livraison.
- La confirmation de livraison conserve le critère explicite préexistant `confirmee`; la planification ne le remplace pas. La correspondance avec tous les états du serveur réel n’est pas certifiée par cette refonte.
- Sauvegarde hébergée du formulaire original, photos Cloud, courriel réel, appareils physiques et notifications non testés. Les préparations précédentes du formulaire peuvent rester incompatibles avec le serveur actif; aucun raccordement serveur dans ce lot.
- Les panneaux annexes de coordination/communications gardent leurs contrôles et leurs activations existantes; leurs services restent hors validation de cette refonte.

## Périmètre protégé

Aucune publication, aucun déploiement, aucune migration, aucun changement de permission ou modèle; aucune demande réelle, donnée CRM/SEO ou fonction serveur modifiée; aucun courriel modifié ou envoyé.