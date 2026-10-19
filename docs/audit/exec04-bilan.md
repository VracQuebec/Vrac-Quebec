# EXEC-04 — communications ciblées et partenaires

19 octobre 2026 — développé dans les sources, vérifié localement, **non activé dans Cloud**.

## Réutilisé et ajouté
- Réseau `submissions`/`entrepreneurs`, registre `mkt_consents`, envois `mkt_promo_sends`, partenaires/services/territoires, demandes `mkt_quote_requests`, soumissions `mkt_bids` et commissions/ententes existantes. Aucun client privé CRM dans la projection réseau; les propriétaires exigent une provenance réseau explicite, inconnue exclue.
- Segments : secteur, matériaux, restant/unité, disponibilité/confirmation, métier, activité et fonctions déclarées. Informations inconnues non déduites des clients privés.
- Finalités/canaux/source/date/preuve/échéance/retrait; promotions facultatives non précochées, retrait sans fermeture du remblai. Partage limité au besoin et au partenaire choisi après code récent et qualification.
- Campagnes : modèles, sélection serveur, aperçu, exclusions/doublons/fréquence, file persistante, transaction lien/message, reprise, captures et échecs. Gardes ajoutées à la copie préparée du worker existant; aucun prestataire réel exécuté.
- Services : besoin → qualification → refus/autorisation → partenaire dans le secteur → réponse/soumission → résultat, annulation et historique.
- Ententes sans taux décidé : assiette, événement, attribution, échéance; estimation/acquisition/facturation/encaissement/annulation distincts. Prospect connu/doublon/contestation; rattachement unique à facture existante, aucun mouvement financier créé. Les états financiers consultent le moteur canonique existant.

## Chemins et sources
| Parcours local | Accès |
|---|---|
| Communications réseau | `/admin/relances?exec04=local` |
| Qualification des besoins | `/admin/marche/soumissions?exec04=local` |
| Ententes/commissions | `/admin/marche/commissions?exec04=local` |
| Réponse partenaire | `/partenaire/soumissions?exec04=local` |
| Préférences/services propriétaire | `/portail/remblai`, lien secret capturé uniquement |

Les mêmes pages normales conservent les raccordements désactivés. Le harnais PostgreSQL local/HTTP utilise le même SQL préparé et les mêmes traitements que l'entrée Cloud; son login fictif n'est pas une validation JWT.

Principaux fichiers : `src/lib/marketplace/communications.ts`, `src/components/marketing/{TargetedCommunications,OwnerCommunicationPreferences}.tsx`, `src/components/marketplace/{RelatedServicesPanel,CommissionAgreementPanel}.tsx`, pages existantes, `prepared/exec04/{schema,endpoint,edge-entry,queue-guard,local-db,harness,package}`, copie `prepared/exec01b/process-email-queue.ts`, tests `src/test/marketplace-exec04.test.ts`.

## Modèles rédigés
1. **Confirmation** : demande enregistrée, aucune livraison confirmée, bouton personnel pour besoin/conditions.
2. **Reconfirmation** : confirmer/modifier/pause depuis le lien; le silence ne confirme rien.
3. **Offre compatible** : consulter matériau/composition/quantité/unité/camion/horaire/conditions; accord valable nécessaire.
4. **Rendez-vous** : consulter créneau/quantité/véhicule/présence/conditions; seul un rendez-vous confirmé est annoncé confirmé.
5. **Accueil entrepreneur** : demandes et recherche dans l'espace; compatibilité et autorisation distinctes.
6. **Fonctions disponibles** : demandes/carte/comparateur; secteurs et services préparés non annoncés actifs sur les dossiers réels.

Textes complets dans `campaignTemplates`; messages sans traceurs. Offre et rendez-vous passent par EXEC-02, jamais par diffusion générale inventant une réservation. Capturé en TEST n'est ni envoyé ni livré. SMS/app : registre uniquement, aucune nouvelle voie d'envoi.

## Vérifications réellement effectuées
- **21 tests ciblés réussis** : permission inconnue/retirée, unité, exclusion CRM privé et propriétaire non inscrit explicitement, activité inconnue, séparation entreprises/dossiers, hors secteur, partage refusé/autorisé, soumission idempotente, commission annulée, panne lien/file et reprise sans doublon, retrait au passage worker, capture sans prestataire, facture unique/état payé (contrat financier local), retrait promotionnel sans fermeture, rendez-vous non inventé.
- Navigateur desktop 1280 et mobile 393 : campagne enregistrée/capturée puis relue; propriétaire vérifié par code capturé → besoin → qualification équipe → refus/partage → réponse/soumission partenaire → relecture dans le portail. Aucun appel externe tenté dans ces parcours, pas de débordement mobile.
- Contrôles Deno de l'entrée serveur et du worker préparés réussis, compilation automatique aperçu « build OK ». Aucun test des lots anciens rejoué.
- Schéma structurel consulté, pas de lignes personnelles; compatibilité des objets préparée d'après types/migrations/structure accessible. La fixture locale ne prouve pas l'exécution de tous les déclencheurs Cloud ni du moteur financier complet.

## Captures
- [Campagne ordinateur](exec04-captures/campaign-desktop.png)
- [Campagne mobile](exec04-captures/campaign-mobile.png)
- [Services propriétaire mobile](exec04-captures/services-owner-mobile.png)
- [Réponse partenaire ordinateur](exec04-captures/services-partner-desktop.png)

## Dépendances restantes — activation, pas code manquant masqué
1. **Cloud partagé interdit aux essais** : autoriser un environnement Cloud isolé, appliquer les SQL préparés dans l'ordre commun, puis vérifier JWT/RLS/membership/tous triggers. Entrée et client restent false.
2. **File et prestataire hébergés non exécutés** : installer les copies empaquetées seulement en isolé; vérifier pgmq, suppression/retrait, reprises et retour livré fiable. Capture locale uniquement dans ce lot.
3. **Finances complètes** : tester `fin_invoice_balance`, reçus/crédits/taxes et droits réels dans l'environnement isolé; ici contrat financier fictif, aucune facture réelle modifiée ni créée.
4. **Provenance/activité réseau** : les champs nouveaux restent inconnus pour les anciennes demandes; renseigner seulement depuis une preuve autorisée, pas d'inscription ou permission globale automatique.
5. **Proxy/Storage/Google des lots précédents** : validations hébergées et origine Google toujours en attente, aucune activation ni dépense autorisée.

Manipulations précises conservées dans [la liste commune](../../prepared/exec01b/activation-checklist.md). Aucune publication, migration publique, communication externe, modification de contact réel ou décision tarifaire.