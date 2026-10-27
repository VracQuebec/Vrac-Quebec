# Paquet EXEC-02 → éditeur de demandes → missions R4D — prêt à installer (NON installé)

État de référence : serveur en service lu le 2026-10-27 (corps de fonctions identiques à la réplique; droits d’exécution effectifs équivalents). Empreintes : `MANIFEST.sha256`. Remplace `prepared/reprise-r3-r4/INSTALLATION-PAQUET-EXEC02-EDITEUR-R4D.md` (ancien manifeste supprimé car antérieur aux corrections).

## Ordre (une migration par fichier, arrêt au premier échec)
| # | Fichier | Rôle | Garde |
|---|---|---|---|
| 00 | trips_journal_creation | Correctif d’un défaut EXISTANT : toute création de voyage échoue (journal écrit avant le voyage). Sans lui, aucune livraison EXEC-02 mesurable. | empreinte `trips_status_audit` |
| 01–02 | exec02_coordination / lifecycle | Réservations, capacité, mesures, échéances | additif |
| 03 | employes_invitations_dependance | Identités employés réutilisées | additif |
| 04–06 | editeur composition / workbench / transport | Édition même dossier, versions, invalidation, historique | additif |
| 07–08 | invitations chauffeurs / capture TEST | Invitations, révocation, file de capture | additif |
| 09 | missions_revocation_adapte | Contrôle missions liées; ne redéfinit pas ce que 0231 a installé | additif |
| 10 | missions_rpc | 3 RPC missions : contrôle réquisition seulement si la mission en a une | empreintes des 3 RPC |

## Installation technique ≠ activation
Installer ne déclenche aucune réservation, aucun courriel, aucun envoi : réservation automatique seulement si un propriétaire enregistre une règle « préautorisée »; envois réels désactivés par `EXEC01_REAL_MAIL_ENABLED`; points d’entrée EXEC-02/invitations non déployés. Activation = décision séparée.

## Compatibilité missions actuelles
Serveur : 0 mission, 0 point lors de la dernière lecture. Missions ordinaires (sans réquisition) gardent leurs règles : démarrage, point, lecture, clôture et isolation testés avant/après révocation d’un chauffeur.

## Décisions à prendre (non inventées)
1. L’éditeur exige l’auteur du dossier; le serveur l’efface pour toute demande non administrative : 731/737 demandes n’en ont pas. Seules les 6 demandes créées par l’administration seraient modifiables. Il faut décider comment établir le propriétaire (aucune déduction par courriel/nom).
2. Un entrepreneur ne voit jamais une fiche TEST (règle serveur); les essais de propositions TEST passent par la coordination.

## Retour arrière
`retour/00-10_paquet.sql` : restaure fonctions, droits et règles archivés, retire déclencheurs/règles/fonctions ajoutés, CONSERVE tables/colonnes ajoutées et leurs données. Vérifié sur réplique : état identique au serveur après retour. `retour/00_trips_journal_creation.sql` : retour du seul correctif 00.

## Tests (réplique isolée, `scenarios.ts`) : 40/40
Mission ordinaire (5), invitation capturée/isolation (8), réquisition/édition/revalidation/rejeu/historique (6), session ouverte et révocation (10), concurrence 3×30 sur 50 → 30 réservés, voyage + livraison 12, modification refusée après livraison, livré 12/solde 38 conservés, accord non livré invalidé, pas de réservation avant revalidation (11).
Non exécuté : Auth/API/Storage hébergés, vraies sessions TEST.
