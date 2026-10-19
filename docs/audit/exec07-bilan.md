# EXEC-07 — Aide intégrée, démarrage et démonstrations

19 octobre 2026. **Sources intégrées et parcours locaux vérifiés; NO-GO production.** Aucun déploiement, migration Cloud, contact réel, invitation, paiement ou courrier modifié.

## Accès
- Compte entrepreneur → Aide et démonstrations : `/entrepreneur/aide`.
- Espace employé → Aide et démonstrations, à côté de Mes heures. Guides punch/agenda limités selon rôle; aucun accès CRM/finances/flotte accordé par l’aide.
- Icône bouée dans le bandeau entrepreneur, le punch et la fenêtre Nouveau client : explication contextuelle dans une fenêtre, sans quitter ni démonter le travail. Retour par Revenir à mon travail ou fermeture.
- Démonstration locale : `/entrepreneur/aide?help_test=local`, localhost uniquement. Identités entrepreneur, employée, lecture, accès révoqué. Pointage TEST utilise le vrai PunchBoard et ses RPC, dans la base jetable.
- Documentation : [10 articles complets](exec07-articles.md), [10 scripts de capsules](exec07-capsules.md). Aucun fichier vidéo disponible, aucun faux lecteur. Scripts également consultables dans Démonstrations.

## Ce qui fonctionne
- Recherche accent-insensible dans les articles autorisés; articles avec objectif, étapes, résultat, erreurs/solutions et limites. Libellés contrôlés dans les écrans existants : Remblai/Chantier/Quantité/Recommandations/Confirmation, Nouveau client, Marquer remise, Enregistrer le brouillon, Émettre…/Confirmer l’émission, Encaissements/Annuler la saisie, Puncher l’entrée/pause/sortie, Événement dans Agenda.
- Démarrage facultatif par tâche et rôle, passage/reprise persistants sur cet appareil. Aucune lecture ne coche une étape. Secteur après sauvegarde réussie; recherche après chargement réussi et résultat filtré non vide; client après création confirmée; punch après entrée confirmée. Comptabilité/lecture n’affichent pas une création de client qu’ils ne peuvent pas réaliser.
- En local, aide/commentaire/rappel écrits dans `site_chat_sessions`/`site_chat_messages`, relus côté serveur. Pas de nouveau registre de support. Mode humain, aucune IA appelée; migration 0159 de notification non chargée.
- Créneaux explicitement configurés TEST, vérification de fraîcheur et disponibilité; réservation et conversation dans une transaction. Événement dans `agd_events`, journal de création existant, aucun rappel ni notification client. Sans créneau, rappel sans date promise.
- Rejeu et demandes simultanées dédupliqués par clé utilisateur/entreprise dans les métadonnées de message existantes, verrou transactionnel; refus si même clé avec contenu différent.

## Preuves (pas un total seul)
| Parcours observé | Preuve |
|---|---|
| Recherche « reglement » et ouverture d’un article complet | `exec07-preuves/01-article-desktop.png` |
| Démarrage passé, rechargé et repris; premier pointage employée puis étape confirmée | `02-pointage-demarrage.png`; `prepared/exec07/check_help.py` |
| Recherche employée « facture » donne zéro parcours; accès révoqué retiré | Assertions navigateur et tests de rôle |
| Saisie chantier conservée après ouverture/fermeture d’aide, ordinateur et téléphone | `06-dialog-mobile.png`, `07-work-mobile.png`; `network_proof.py` |
| Rappel sans créneau; appel sur créneau configuré | `03-rappel-sans-creneau.png`, `04-appel-confirme-test.png` |
| Relire conversations, événement et journal; zéro livraison | Preuve DB exportée : 2 conversations, 1 événement, `agd_deliveries=0` |
| Article employée sans débordement à 393×852 | `05-aide-mobile.png`; largeur DOM ≤ écran |

**Tests finaux : 20 réussis** (8 aide/progrès/droits, 7 SQL ciblés, 5 dates punch concernées); 1280×1800 et 393×852; zéro erreur JavaScript. Les premières tentatives ont détecté JSON doublement encodé, requêtes de mesure héritées et capture trop rapide d’une fermeture animée; corrigées et rejouées. La vérification réseau finale distingue requêtes tentées des sorties effectives : Analytics et polices externes bloquées par CSP, **aucune requête externe terminée**. La première exécution avant cette protection avait envoyé de la mesure GA automatique; aucun message métier ni donnée personnelle réelle envoyé. Les polices système du TEST ne représentent pas une validation des polices hébergées.

## Limites et actions restantes
- Accès employé **authentifié hébergé non vérifié** : la fixture n’est pas une preuve JWT/RLS/connexion. Valider en Cloud isolé autorisé les rôles, révocations et sélection d’entreprise.
- Accompagnement hébergé reste préparation sans transmission; bouton capture désactivé. Raccorder via les writers autorisés de conversation existants, revalider droits agents et retrait d’accès, puis agenda/RLS et confirmation capture-only. Pas de writer direct client, pas d’activation AI ou notification.
- Créneaux TEST configurés par opérateur du harnais; aucune disponibilité réelle inférée. Prévoir configuration autorisée et lecture fraîche des disponibilités de l’équipe en environnement isolé.
- Progression appareil uniquement, pas synchronisée; secteur/clients/search raccordements inspectés et règles testées, mais leurs parcours multi-écrans hébergés ne sont pas certifiés par ce lot. Le pointage→progression est vérifié de bout en bout localement.
- Pas de démonstration serveur fictive de déclaration publique/flotte ajoutée, aucun formulaire public réellement soumis. Articles complets/scripts seulement pour ces parcours.
- Les démonstrations EXEC-03/05/06 liées nécessitent leurs serveurs propres; ne pas remplacer une absence de serveur par des données réelles. Un seul opérateur de démonstration à la fois (identité active globale du harnais).
- Aucun pointage hors connexion : indisponible, rien en file. Google, Cloud, Storage, courriel et validations financières antérieures toujours ouverts, détaillés dans [bilan commun](bilan-commun-exec01-exec07.md).

## Fichiers
Nouveaux : `src/lib/help/{catalog,progress}.ts`, `src/components/help/{HelpWorkspace,ContextHelp,HelpLocalScreen}.tsx`, `src/pages/EntrepreneurAide.tsx`, `prepared/exec07/{local-db,harness}.ts`, scripts navigateur et règles AGENTS locales, tests `exec07-help`/`exec07-local`, articles/scripts/bilan/captures et tableau commun.
Modifiés : App, EntrepreneurAppShell, Entrepreneur, EntrepreneurCrm, PunchBoard, punch/runtime, useSearchSector, main (pas d’outbox réelle en TEST), Vite (CSP locale), suivi d’activation et roadmap. Ni schéma Cloud ni settings ni tarifs modifiés.

Nettoyage final : bases uniques de fixture supprimées après vérification host/port/data_directory; aucun service de démonstration laissé actif.
