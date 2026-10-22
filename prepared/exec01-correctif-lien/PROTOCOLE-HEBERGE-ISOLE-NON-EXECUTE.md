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

## Correspondance avec les essais locaux

Scénarios 1–6 et 9 : couverts localement (`src/test/remblai-correctif-15minutes.test.ts`, `verification-preparation-locale.ts`), délai simulé en déplaçant les dates. Scénarios 7–8 : non couverts (aucun vrai courriel, aucun iPhone réel).
