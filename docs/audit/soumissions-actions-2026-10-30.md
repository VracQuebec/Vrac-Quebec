# Soumissions automatisées — 30 octobre 2026

## Périmètre
- Présentation des résultats /acheter-materiaux et /soumission : appels/rappels retirés, acceptation existante, refus explicite avec confirmation, modification/recalcul.
- Aucun changement de tarifs, de moteur, de permissions, de coordonnées ailleurs, ni de consentement.
- Réponses conservées sur le même jeton CRM; les verrous empêchent les décisions simultanées.

## Validation en aperçu
- 64 tests ciblés réussis (6 fichiers), compilation de l’aperçu OK.
- Navigateur Chromium, largeur 491 px : erreur de calcul réelle provoquée par adresse fictive non desservie, demande persistée en attente; modification et reprise sur le même dossier, refus ou acceptation; acceptation visible après rechargement.
- /acheter-materiaux : #872 `da0c242e-d4ac-4924-961f-13f2ef75f59b` refusée; #873 `e79eafb3-79fc-4dec-9110-6c5dd75534cb` acceptée.
- /soumission : #877 `ba9db4d0-b663-4a3e-b448-e59318295e37` refusée; #878 `d851a07e-3093-40a3-bb42-443afd0e4593` acceptée.
- Lecture serveur : une ligne par jeton, statut CRM `nouveau` distinct des décisions. Essais interrompus laissés sans réponse, jamais convertis en refus.
- Identité réservée `essai-final@test.invalid`; serveur supprime l’envoi courriel et notifications téléphone `skipped` (10 au contrôle de 20:23 UTC).
- Aucune demande réelle modifiée ou supprimée. Les fiches et historiques fictifs sont conservés.

## Publication
- Publication demandée à 20:20 UTC. Les premiers contrôles sur vracquebec.ca servaient encore l’ancien écran; ils ne constituent pas une validation de la nouvelle version.
- Analyse préalable terminée : aucun résultat critique; résultats connus ignorés conservés. Analyse approfondie distincte disponible sur demande.

## Vérification publiée terminée
- vracquebec.ca sert les nouveaux boutons : aucun appel/rappel sur les résultats, erreur sans faux prix, modification accessible.
- Les deux parcours ont effectué erreur réelle → modification → recalcul → refus/acceptation. Les deux acceptations restent visibles après rechargement.
- /acheter-materiaux : #881 `ea890567-1995-4cec-ba46-f5eb19aa2512` refusée, #882 `f1526be0-d793-46ab-ba4a-a8305124a9df` acceptée.
- /soumission : #883 `57d1951f-fe54-4b25-9306-aa881ca8858d` refusée, #884 `3dddcf08-2411-4471-acf9-72d40d8ec71b` acceptée.
- Lecture serveur exacte : quatre lignes (une par jeton), calcul réussi et décisions attendues, statut CRM `nouveau` inchangé; 14 notifications fictives `skipped`, aucune `pending`.
- L’indicateur automatique `achat_*_fail_phone` vaut true parce que le résumé contient le téléphone fictif saisi; la capture confirme l’absence de bouton ou invitation à téléphoner.
- Aucun consentement choisi pendant les essais, aucune permission modifiée. La session Lovable entrepreneur n’a pas été utilisée comme administrateur; conservation vérifiée en lecture serveur, pas par une session propriétaire CRM.