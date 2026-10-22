# Protocole d’essais isolés — mise à jour 22 octobre 2026, 20 h 45 UTC

**État : aucun environnement hébergé distinct n’est confirmé.** Aucun n’a été créé, aucune dépense engagée, aucun essai hébergé effectué. Seuls existent des essais locaux (PostgreSQL jetable sur 127.0.0.1:55439) et des simulations navigateur (Chromium).

## Prérequis (tous obligatoires avant un essai hébergé)

1. Environnement hébergé distinct de la production, confirmé par écrit (base et fonctions séparées); coût approuvé.
2. Correctif appliqué seulement là, après relecture de l’empreinte initiale `2da0b80649cfacf5db57fe559adab3c2`; empreinte corrigée attendue `e9d8b2ad33d864aa7a3ba881e78b82cc`.
3. Boîte Outlook dédiée aux essais, jamais celle d’un client; dossiers nommés « TEST ».
4. Véritable iPhone (Safari et application Outlook), version iOS notée.
5. Autorisation d’envoi de test séparée; nettoyage ciblé des seuls dossiers TEST prévu.

## Scénarios et critères de réussite

| # | Scénario | Réussite |
|---|---|---|
| 1 | Renouvellement du lien | Un seul courriel reçu à l’adresse du dossier; nouveau lien fonctionne; ancien refusé. |
| 2 | 5 codes erronés, 6e refusé, attente 15 min, nouveau code | Refus aux essais 1–6, compteur plafonné à 5; délai non prolongé; nouveau code accepté après 15 min réelles. |
| 3 | Révocation | Lien révoqué refusé pour consulter, code, vérifier, renouveler, même après 15 min. |
| 4 | Doubles clics | Un seul événement et une seule modification; aucun courriel en double. |
| 5 | Demandes indépendantes | Deux dossiers TEST : blocage de l’un sans effet sur l’autre. |
| 6 | Erreur réseau (mode avion pendant l’envoi) | Message réseau; aucune modification partielle; reprise réussie. |
| 7 | Outlook dédié | Réception < 5 min, bouton « Suivre ou modifier ma demande » ouvre la page; aucun code/jeton visible dans l’aperçu du message autre que le lien. |
| 8 | Safari iPhone réel | Lien ouvert, fragment retiré de la barre d’adresse, saisie automatique du code, consultation et pause/reprise. |
| 9 | Retour arrière | Inverse exécuté; définition identique octet pour octet à la référence; empreinte `2da0b806…`; second inverse refusé. |

Toute divergence = arrêt et rapport, jamais d’adaptation sur place.

## Complément opérationnel — préparation 21:28 UTC, sans envoi

- Adresse prévue par le propriétaire : `Kassandrapaquette@hotmail.com`. Confirmer qu'elle est dédiée aux essais avant tout envoi autorisé. Un deuxième client fictif distinct reste nécessaire pour tester l'isolation ; ne pas inventer une seconde boîte réelle.
- Noter les cibles exactes du site, de la base et des fonctions isolées et le paquet déployé. Refuser toute clé, file, tâche ou intégration joignant la production.
- Créer uniquement après accord les dossiers TEST A1/A2 pour un même client et B1 pour le second. Consigner leurs identifiants exacts, jamais leurs secrets ou codes dans le rapport.
- Pour chaque courriel, comparer son dossier attendu à celui affiché après le code à six chiffres. A1 doit ouvrir A1, jamais A2 ou B1. Altérer identifiant/secret et combiner le lien A1 avec l'identifiant B1 : refus sans donnée privée. Un lien valide peut être transféré, mais le code reçu à l'adresse du dossier reste nécessaire avant accès non vérifié.
- Simuler l'échec du service d'envoi puis demander « Réessayer l'envoi du courriel » : même dossier, même lien, clé idempotente identique. Après acceptation, répéter et doubler le clic : aucun second message. L'acceptation du service n'est pas une preuve de livraison en boîte.
- Renouveler uniquement vers l'adresse enregistrée : nouveau lien, anciens refusés. Vérifier cinq erreurs, sixième sans prolongation, quinze minutes réelles puis nouveau code, sans effet sur l'autre dossier.
- Perte réseau : distinguer absence de réception serveur et réponse perdue après commit. Relire l'état TEST, puis réessayer sans seconde création ni faux succès.
- Le scénario de retour arrière SQL concerne uniquement le renouvellement M3. Il restaure la définition, pas les liens ou états créés. Le retour des parcours conserve les ajouts M1/M2 et les index.
- Nettoyage éventuel : autorisation distincte nommant chaque identifiant TEST. Relire le dossier, son marqueur TEST et les liens associés avant toute opération ; arrêter sur divergence. Privilégier l'archivage prévu pour les dossiers JSC ; aucune suppression générale ni recherche par courriel pour choisir les dossiers.
- Le délai de réception de cinq minutes est un point d'observation du test, pas une garantie de service. Noter la durée effective, Outlook/iOS/Safari et les résultats ordinateur/mobile.

## Correspondance avec les essais locaux

Scénarios 1–6 et 9 : couverts localement (`src/test/remblai-correctif-15minutes.test.ts`, `verification-preparation-locale.ts`), délai simulé en déplaçant les dates. Scénarios 7–8 : non couverts (aucun vrai courriel, aucun iPhone réel).
