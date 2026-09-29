# Test réel des notifications iPhone — plan technique final

## Point important à connaître avant tout accord
Les fonctions serveur et la base sont **déjà partagées** avec le site en ligne. Toute modification de l'envoi des notifications est donc active **dès son déploiement**, sans publication. C'est pourquoi rien ne sera touché avant votre accord explicite.

## Protection des notifications de Jonathan
- Vérifié en lecture seule : l'unique téléphone abonné appartient à un compte **administrateur approuvé**.
- Aucune modification de son abonnement, de ses réglages ni de ses catégories.
- Option retenue (la plus prudente) : **l'envoi automatique des avis CRM reste exactement tel quel**. Le seul ajout est une exclusion : les appareils des comptes de test (adresse @test.invalid) ne reçoivent jamais les avis CRM réels. Le téléphone de Jonathan n'est pas concerné par cette règle.
- Avant et après le déploiement : contrôle que l'appareil de Jonathan reste bien ciblé par l'envoi (vérification sans lui envoyer d'avis).
- Si ce contrôle échoue, retour immédiat à la version actuelle de l'envoi.

## Modifications proposées (3, limitées)
1. **Envoi automatique des avis CRM** : exclure les appareils appartenant à un compte de test. Rien d'autre ne change.
2. **Nouvelle action « test personnel »** côté serveur :
   - réservée à la personne connectée, pour **ses propres appareils seulement** (identité vérifiée par le serveur à partir de sa session, jamais depuis la page) ;
   - accessible **uniquement aux comptes de test** (@test.invalid) ; refusée pour tout autre compte ;
   - texte **fixe et codé dans le serveur** : « TEST — Vrac Québec · Notification de test ». Aucune donnée n'est lue dans les demandes, clients, adresses ou entreprises ; la page ne peut transmettre aucun texte.
   - l'action d'essai administrateur existante reste inchangée.
3. **Bouton « Activer les notifications / Envoyer un test »** dans l'espace de l'entreprise fictive C, affiché seulement pour les comptes de test.

## Validations prévues
Côté serveur (avant iPhone) :
- Compte C : l'action « test personnel » vise uniquement ses appareils.
- Appel direct avec un faux identifiant d'utilisateur dans la demande : ignoré.
- Appel sans session : refusé. Appel par un compte non-test : refusé.
- Le texte envoyé est fixe même si la page tente d'en fournir un autre.
- L'appareil de C est exclu de l'envoi automatique des avis CRM réels.
- L'appareil de Jonathan reste ciblé par l'envoi automatique.

Sur l'iPhone de test (compte C) :
- Réussite : avis de test reçu physiquement, heure confirmée par vous.
- Échec : abonnement de C volontairement faussé ; le CRM affiche l'erreur réelle ; aucun autre appareil touché.

## Nettoyage
- Retrait de l'abonnement de test de C et du journal d'essai.
- Bilan avant/après : nombre d'appareils abonnés, avis CRM, demandes, clients, comptes — identiques hors éléments de test.

## Publication (non incluse dans cet accord)
Les modifications 1 et 2 sont actives dès leur déploiement. La modification 3 (bouton) exige une publication pour apparaître sur l'iPhone.
Avant toute publication, je vous remettrai la liste exacte des changements en attente d'être mis en ligne, dont le Centre de contrôle (page, menu, couleurs), établie à partir d'une comparaison réelle, et j'attendrai votre accord séparé.

## Risques
- Faible : une erreur dans la modification 1 pourrait affecter l'envoi automatique ; atténué par le contrôle de ciblage de Jonathan et le retour arrière immédiat.
- La publication mettrait aussi en ligne le Centre de contrôle.
- Le compte C ne voit que ses données fictives.

## Accès nécessaires
- Votre accord pour les modifications 1 à 3.
- Un accord distinct pour la publication.
- Un iPhone de test connecté au compte fictif C.
