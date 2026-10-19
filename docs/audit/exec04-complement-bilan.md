# EXEC-04 — complément des écrans existants

19 octobre 2026. **Développé et vérifié localement; non activé Cloud. GO limité à une validation d’intégration isolée autorisée, NO-GO production. Aucun EXEC-05.**

## Résultat et chemins

| Écran existant | Chemin local fictif | Résultat |
|---|---|---|
| Réseau et campagnes | `/admin/relances?exec04=local` | Segments existants conservés; registre source/date/preuve/état/échéance/retrait/périmètre; modèles compatibles avec la population; captures persistantes |
| Propriétaire | Lien personnel capturé vers `/portail/remblai?server=local&exec04=local#…` | Code de vérification, besoin connexe, préférences, refus/autorisation facultative |
| Qualification et résultat | `/admin/marche/soumissions?exec04=local` | Qualification, résultat, actions terminales masquées, historique lisible |
| Partenaire | `/partenaire/soumissions?exec04=local` | Entreprise vérifiée côté serveur, projection minimale, réponse et soumission fictive |
| Ententes et commissions | `/admin/marche/commissions?exec04=local` | Relecture des conditions persistantes, statuts distincts, événement de résultat visible; aucun taux inventé |

Les mêmes routes sans paramètres conservent les portes d’activation désactivées. Les paramètres locaux exigent le harnais local, ils ne raccordent pas les dossiers Cloud. Ne pas partager de lien personnel dans les rapports.

## Inspection brève et réutilisation

Les écrans CRM/relances/marché et les objets `submissions`, `entrepreneurs`, `mkt_consents`, `mkt_promo_sends`, `mkt_quote_requests`, `mkt_bids`, `mkt_partners`, territoires/services et commissions restent les sources existantes. Aucun accès marketing transversal à `ent_crm_contacts` ou aux clients privés. Les notifications restent dans leur architecture existante. L’envoi réel/sa file/son prestataire demeurent désactivés dans les copies préparées; EXEC-01/02 restent les traitements des offres et rendez-vous opérationnels. Aucun contact réel, migration Cloud, notification, paiement ni commission réelle modifié.

## Manques complétés

1. Registre partagé entre propriétaire et réseau : source et preuve affichées, dates et retrait, périmètre partenaire/besoin, permission inconnue explicitée. Lecture serveur bornée à l’entité Vrac Québec et au sujet; lecture réseau réservée administrateur.
2. Modèle incompatible avec la population refusé côté SQL et retiré du sélecteur. Offres/rendez-vous ne sont plus proposés comme campagnes générales qui seraient silencieusement ignorées : ils restent dans les dossiers EXEC-01/02.
3. Capture locale réutilise l’admissibilité serveur par sujet/finalité en mode TEST, plutôt qu’un test générique qui échouait pour les promotions fictives. Pas de conversion en permission réelle.
4. Collision d’identité détectée dans le parcours navigateur : un propriétaire avec un cookie administrateur local était interprété comme administrateur et son partage refusé. Les justificatifs personnels du dossier ont désormais priorité; le serveur vérifie toujours le lien/code/dossier, sans faire confiance à un rôle client.
5. Historique des refus, partages, réponses et résultats exposé dans la vue équipe; actions terminales/incompatibles désactivées dans l’écran en plus des refus serveur existants.
6. Ententes existantes relues, valeurs commerciales explicites existantes préservées (aucune inventée); assiette chiffrée facultative au résultat si une entente réelle existe. Sans montant/taux complet, aucune acquisition de commission possible. Statuts estimée/acquise/facturée/encaissée/annulée distincts, preuve d’événement disponible pour l’équipe.

## Modèles rédigés conservés

Source unique : `src/lib/marketplace/communications.ts`. Chaque modèle comporte un sujet, un texte et un HTML sans suivi publicitaire. Bouton propriétaire **« Suivre ou modifier ma demande »**, entrepreneur **« Mon espace entrepreneur »**.

| Modèle | Sujet | Texte principal / finalité |
|---|---|---|
| Confirmation | Confirmation de votre demande — Vrac Québec | Votre demande est enregistrée. Aucune livraison n’est confirmée. Consultez votre besoin et vos conditions depuis votre lien personnel. / Suivi |
| Reconfirmation | Votre besoin de remblai est-il toujours actuel ? | Confirmez votre besoin, modifiez vos conditions ou mettez la demande en pause depuis votre lien personnel. Le silence ne confirme aucune réception. / Suivi |
| Offre compatible | Une proposition de réception à examiner | Consultez matériau, composition, quantité/unité, véhicule, horaire et conditions dans le dossier; aucune réception sans accord valable. / Événement EXEC-02, pas une campagne générale |
| Rendez-vous | Votre rendez-vous de réception | Consultez créneau, quantité, véhicule, présence exigée et conditions; seul un rendez-vous confirmé est présenté comme confirmé. / Événement EXEC-02 |
| Accueil entrepreneur | Bienvenue dans le réseau Vrac Québec | Retrouvez vos demandes et recherchez les besoins de remblai; propositions soumises à compatibilité et autorisation. / Promotion avec permission |
| Fonctions disponibles | Vos outils disponibles dans Vrac Québec | Demandes, carte et comparateur; secteurs mémorisés et nouveaux services explicitement non activés pour les dossiers réels. / Promotion avec permission |

Les promotions exigent leur permission distincte; retrait promotionnel sans fermeture de la demande. Un courriel existant ne suffit pas. Les offres et rendez-vous capturés des lots précédents ne sont pas annoncés comme de nouveaux envois vérifiés.

## Vérifications réellement exécutées

- **55 tests ciblés réussis**, 3 fichiers : `marketplace-exec04.test.ts` (21), `exec03-exec04-corrections.test.ts` (28), `exec04-screen-completion.test.ts` (6).
- Nouveau contrat testé : isolation du registre par sujet/entité, refus partenaire de lire le registre, compatibilité modèle/population sans insertion, TEST promotion interdit en réel et admissible en capture, préparation rejouée unique, historique du refus sans partage, prévol origine étrangère refusé avant authentification, priorité identité propriétaire avec session administrateur.
- Les suites concernées couvrent permission inconnue/retirée, séparation d’entreprises, fréquence/reprise/doublon, refus, partenaire hors secteur, commission annulée et absence de double entrée financière; aucune suite ancienne non concernée rejouée.
- Isolation démontrée avant écritures : `127.0.0.1:55439`, répertoire `/tmp/exec-correctifs/pg`, bases neuves `exec04_<uuid>` créées par le harnais avec vérification de ces trois critères. Aucun identifiant Cloud utilisé. Des erreurs attendues des tests négatifs restent dans les journaux locaux.
- Parcours navigateur à **1280×1800 et 420×757** : permission réseau → campagne admissible → capture TEST → lien personnel → code → besoin connexe → qualification → refus de partage → autorisation → partenaire → réponse → soumission fictive → résultat terminal/historique → entente sans taux sauvegardée/rechargée.
- Délai anti-abus de 60 secondes respecté pour le second code; pas de contournement. Le premier essai a révélé la collision d’identité corrigée; les reprises de campagne ont utilisé une nouvelle base pour respecter la fréquence.
- Dernier parcours : **0 tentative externe et 0 erreur JavaScript**. Aucun état envoyé/livré utilisé pour une capture. Journal des captures vérifié par l’écran.
- `deno check` de l’entrée préparée EXEC-04 réussi; dernier signal aperçu : `build OK` du 19 octobre à 17:27:53 UTC. Contrôles futurs Cloud non couverts par ces résultats.

## Captures et preuves

Sous `docs/audit/exec04-complement-preuves/` :
- `registry-desktop.png`, `registry-mobile.png` : registre et périmètres.
- `campaign-desktop.png`, `campaign-mobile.png` : captures TEST persistantes.
- `owner-registry-mobile.png` : besoin fictif mobile (la fin du registre n’est pas intégralement visible dans cette capture).
- `partner-desktop.png` : réponse/soumission fictive.
- `result-history-desktop.png` : résultat terminal et refus/partage/réponse/soumission conservés.
- `agreement-desktop.png` : conditions sans taux relues.
- `exec04-screen-tests.log`, `deno-complement.log`, `browser-complement.log` : preuves de la dernière exécution réussie.

## Fichiers de ce complément

- `src/components/marketing/PermissionHistory.tsx` (nouveau), `OwnerCommunicationPreferences.tsx`, `TargetedCommunications.tsx`.
- `src/components/marketplace/RelatedServicesPanel.tsx`, `CommissionAgreementPanel.tsx`.
- `prepared/exec04/schema.sql`, `endpoint.ts`, `harness.ts` (préparés uniquement).
- `src/test/exec04-screen-completion.test.ts` (nouveau).
- `AGENTS.md`, `roadmap.md`, `prepared/exec01b/activation-checklist.md`.
- Ce rapport et ses captures/journaux. Aucune modification de source active d’envoi ni de configuration Cloud.

## Restant à activer ou non vérifié

- **Autorisation d’un Cloud réellement isolé** : migrations préparées, JWT, droits PostgREST/RLS, origines, stockage/photos, assemblage de toutes fonctions/triggers et services. Le Cloud partagé est resté intact.
- **File réelle et prestataire** : activation interdite; reprise, suppression, opposition, fréquence et retours envoyé/livré à vérifier avec environnement de test autorisé. La capture n’est ni un envoi ni une livraison. Aucun SMS réel branché/testé.
- **Google/EXEC-03** : géocodage, dessin, routes et préférences hébergées sur origine autorisée restent dans la liste commune, sans coordonnées inventées ni appel Google.
- **Finances** : les règles sont préparées et testées sur objets fictifs; aucune entente chiffrée décidée, aucune chaîne facture/paiement réelle validée. Le test navigateur a enregistré un résultat sans créer de commission.
- **Données réseau/secteurs** : provenance historique et référentiel exact à valider en lecture/activation isolée; données inconnues exclues, pas d’inférence depuis les CRM privés.
- **Ergonomie partenaire** : référence d’entreprise encore saisie dans la vue de test; contrôle d’appartenance serveur présent, résolution automatique de l’entreprise en session hébergée non validée.

Conclusion : fonctions complétées dans les sources et parcours local vérifié, **pas une certification de production**. Toute activation, communication, migration Cloud, décision de tarif ou EXEC-05 nécessite une nouvelle autorisation.
