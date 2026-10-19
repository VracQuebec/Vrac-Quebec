# Vrac Québec — Correctifs de l’audit EXEC-03 / EXEC-04

19 octobre 2026. Périmètre : correction des défauts confirmés dans les sources existantes et préparées. Aucun EXEC-05.

## Verdict

**GO limité au passage à une validation d’intégration dans un environnement Cloud réellement isolé, après autorisation distincte. NO-GO production et activation du serveur partagé.**

Les sources préparées ont été corrigées et les tests ciblés locaux réussissent. Cela ne certifie ni les permissions hébergées, ni les services externes, ni les échanges réels. Aucune migration Cloud, publication, activation Google, communication, facture, transaction ou commission réelle n’a été effectuée. Aucune donnée historique métier n’a été modifiée.

## 1. Anomalies corrigées

| Défaut | Correction et preuve |
|---|---|
| Retraits de consentement non bornés | Clé serveur comprenant courriel, entité Vrac Québec, sujet/type, canal, finalité, mode de preuve et périmètre partenaire/besoin. Test : retrait d’un accord laisse intacts trois accords étrangers au périmètre. |
| Preuve TEST convertible | Mode de preuve figé par trigger; création TEST réservée au cluster local jetable vérifié. Le serveur hébergé refuse ces preuves; l’envoi réel les exclut. Le renouvellement TEST ne retire pas l’accord réel, ne change pas son jeton et ne supprime pas sa suppression. |
| Réponses internes exposées aux partenaires | Projection serveur explicite : id, titre, ville, statut et partage autorisé name/email/city/need. Qualification, réponses, notes et clés inconnues absentes. Lecture conditionnée au consentement actif, au besoin et à l’entreprise membre autorisée. |
| Réactivation des besoins terminaux | Refus des actions sur annulee, terminee, litige, archivage ou inactivité. Qualification, partage, réponses et résultat limités à leurs états admissibles. |
| Permissions vérifiées seulement à la préparation | Vérification serveur à la préparation, à la réservation en file et par le worker juste avant chaque tentative : contact vérifié, identité courriel courante, provenance réseau, disponibilité, finalité, accord/expiration, suppression, campagne active, token promotion courant, absence de capture. Échec du contrôle = aucun prestataire appelé. |
| File bloquée par un message déjà en attente | La sélection ignore les entrées déjà remises à la file réelle et poursuit les suivantes. Aucun nouveau lien ni second message créé. Les captures seules conservent une récupération locale. |
| Consentement non revérifié après échec | Un message failed reste admissible au contrôle du worker existant, qui conserve le message jusqu’à la nouvelle tentative; le gestionnaire de campagne ne le ré-enfile pas. Reprise réelle pgmq restant à vérifier en environnement isolé. |
| Affichage incohérent des droits | Préférences projetées par le contrôle effectif serveur : accord expiré, supprimé ou non admissible affiché unknown, et non granted. La saisie de consentement fictif est limitée à la vue TEST locale. |
| Ancien lien de désabonnement après renouvellement | Après accord promotion email explicitement renouvelé : rotation du token utilisé, invalidation de son ancienne URL et suppression du seul motif unsubscribe associé. Bounce/complaint préservés. Sans rotation explicite, la suppression promotion continue de bloquer. |
| Simulation susceptible de rejoindre l’envoi réel | Endpoint local refuse queue; capture_only bloque toujours le prestataire, même sans marqueur EXEC-04. Le SQL exige que le mode du message corresponde au mode du serveur; une capture ne récupère pas une entrée réelle. |
| Acquisition sans événement métier | Référence UUID obligatoire à un événement immutable service_action/result, lié au même besoin et partenaire, avec besoin terminé, actif et non archivé. Montant présent/non négatif et déclencheur correspondant obligatoires. Aucune acquisition sur simple texte d’événement. |
| Commissions avec montant NULL | Création atomique refusée si la règle ne fournit pas une base, attribution, déclencheur result et soit un montant fixe non négatif, soit un taux valide avec base chiffrée. En cas de refus, état du besoin et commissions inchangés. Les valeurs TEST ne deviennent pas des règles commerciales. |
| NULL contournant des contrôles | Identité serveur, confirmation, finalité/canal/état, source/preuve, réponse de résultat, montant et entente requis; contrôles explicites des états NULL et existence des objets. |
| Segmentation réduite à la ville | Campagnes : comparaison de la ville déclarée ou de la région exacte issue du référentiel municipal partagé. Partenaires : territoire ville/région/province déclaré; aucun rattachement pour une ville inconnue. |
| Ville/région absentes des résultats EXEC-03 | SQL préparé enrichissant les deux RPC existants de la ville déclarée et région issue de seo_cities, sans adresse privée ni GPS. Carte et comparateur utilisent le même adaptateur; celui-ci conserve les RPC courants tant que le raccordement hébergé est désactivé. |
| Prévol authentifié incomplet | Authorization, apikey, x-client-info, Content-Type admis. OPTIONS atteint le handler malgré le verrou d’activation; origine étrangère refusée par le handler recherche. |
| Dessin persistant après changement de secteur | Référence du mode courant et garde canDrawSector dans le clic carte; dessin interrompu au changement de mode ou d’entreprise. Test de logique pour tous les modes non polygon. Google réel non utilisé. |
| Données incomplètes filtrées comme inadmissibles | Géographie inconnue conservée à confirmer; incohérence connue exclue. Résolution exacte seulement, jamais coordonnées inventées. Distance géographique, route estimée et économie mesurée restent distinctes. |

## 2. Fichiers modifiés

### EXEC-03
- prepared/exec03/search-endpoint.ts
- prepared/exec03/edge-entry.ts
- prepared/exec03/geography.sql — nouveau SQL préparé, non installé en Cloud.
- prepared/exec03/search-sites.sql
- src/lib/entrepreneur/search-sector.ts
- src/lib/entrepreneur/dompes.ts
- src/pages/Entrepreneur.tsx
- src/pages/EntrepreneurComparateur.tsx
- src/test/entrepreneur-exec03.test.ts — isolation vérifiée avant écritures.

### EXEC-04
- prepared/exec04/schema.sql
- prepared/exec04/endpoint.ts
- prepared/exec04/queue-guard.ts
- prepared/exec04/local-db.ts
- prepared/exec04/local-fixture.sql
- prepared/exec04/package.ts — inclut le référentiel géographique partagé requis côté serveur.
- src/lib/marketplace/communications.ts
- src/components/marketing/TargetedCommunications.tsx
- src/components/marketplace/CommissionAgreementPanel.tsx
- src/test/marketplace-exec04.test.ts
- src/test/exec03-exec04-corrections.test.ts — 28 tests ciblés supplémentaires.

### Suivi et preuves
- AGENTS.md — conventions serveur et isolation.
- roadmap.md
- prepared/exec01b/activation-checklist.md — liste commune mise à jour.
- docs/audit/exec03-exec04-correctifs.md
- docs/audit/exec03-exec04-correctifs-preuves/communications-desktop.png
- docs/audit/exec03-exec04-correctifs-preuves/communications-mobile.png

Les fonctions serveur actives, les règles financières existantes et la configuration Cloud n’ont pas été déployées ni remplacées.

## 3. Tests exécutés et preuves

### Isolation démontrée
PostgreSQL local : adresse 127.0.0.1, port 55439, data_directory sous /tmp/exec-correctifs/. Vérification effectuée **avant CREATE DATABASE et avant les écritures de fixtures**. Bases aléatoires exec04_<uuid> ou exec03_test_<uuid>, adresses réservées @test.invalid, teardown des bases de suite. Aucun branchement à la base Cloud partagée. Le harness navigateur utilise uniquement une base locale fictive; tous les accès réseau non locaux sont bloqués.

### Résultat final
Commande :

```text
EXEC01B_LOCAL_TEST=1 bunx vitest run src/test/exec03-exec04-corrections.test.ts src/test/entrepreneur-exec03.test.ts src/test/marketplace-exec04.test.ts
```

**66 tests réussis, 0 échec** : 28 correctifs, 17 EXEC-03, 21 EXEC-04. Dernière exécution : 17:06:55 UTC. Les deux suites préexistantes ont été reprises parce que les handlers/SQL qu’elles exercent ont changé; aucun autre lot rejoué.

- EXEC-03 : union secteurs, polygone/rayon, route inconnue, économies 12 × 20 min / 60 × 150 = 600 $ bruts estimés, frais, cache et origine, absence d’appel au fournisseur désactivé, accès authentifié, SQL préférences et isolation.
- EXEC-04 : exclusions privées, consentements, replay campagne/soumission partenaire, rollback file/lien, droits propriétaire/partenaire, capture/reprise, facture liée fictive sans flux concurrent, désabonnement, absence d’offre/rendez-vous inventé.
- Correctifs : séparation entité/sujet/canal/périmètre et TEST, tokens renouvelés, suppressions, liste blanche partenaire, états terminaux, référence d’événement immutable, champs absents, segmentation régionale, contrôles frais avant envoi y compris état failed, progression après entrée réelle en attente, absence de NULL commission, CORS et enrichissement des deux sources.

Les refus constatés pendant la mise au point ont été corrigés puis les suites relancées; les résultats antérieurs ne sont pas présentés comme résultats finaux.

### Contrôles de sources et aperçu
- Sources serveur préparées EXEC-03 et EXEC-04 contrôlées avec Deno : succès.
- Dernier signal de l’aperçu : build OK, 17:06:59 UTC.
- Parcours navigateur réel local : connexion admin fictive → filtre Capitale-Nationale → 2 contacts → campagne fictive → admissibles → capture TEST → lecture du journal persistant. Capture non envoyée et non livrée.
- Captures 1280 × 1800 et 420 × 757 inspectées; aucun débordement horizontal sur mobile; 0 requête externe détectée.
- Les dernières protections SQL ajoutées après cette capture sont couvertes par les 66 tests finaux, pas par une nouvelle capture navigateur.

Chemins existants : /admin/relances (TEST local : ?exec04=local), /portail/remblai pour les préférences/services du propriétaire, /entrepreneur et /entrepreneur/comparateur pour la recherche. Les modules hébergés restent verrouillés; ces chemins ne prouvent pas leur activation réelle.

## 4. Anomalies encore ouvertes et risques résiduels

Aucun défaut confirmé de l’audit ciblé n’est laissé volontairement sans correction dans les sources préparées. **Les limites suivantes restent ouvertes en intégration, non certifiées :**

1. Le Cloud partagé ne possède pas les objets préparés : ville/région peuvent rester inconnues avec les RPC actifs. Le repli conserve cette incertitude plutôt que de l’inventer.
2. La reprise pgmq réelle, les tentatives prestataire, TTL, limite d’essais, DLQ et journaux actifs nécessitent un environnement isolé. Le code existant garde les échecs en file et le SQL les accepte à la nouvelle tentative; aucune re-création de message ne sert de preuve de livraison. La réconciliation d’un journal métier après passage en DLQ reste à valider.
3. La rotation du token a été testée dans SQL local, pas par un véritable lien hébergé ni par le prestataire. Le modèle existant de désabonnement est global au courriel pour les promotions Vrac Québec; les accords fins restent séparés par sujet.
4. Le mode TEST est refusé par motif source/proof et preuve figée. Une affirmation mensongère saisie par un administrateur ne peut pas être authentifiée automatiquement : la provenance réelle doit être vérifiée opérationnellement en environnement isolé; la saisie fictive n’est pas offerte dans la vue hébergée.
5. Acquisition result seulement : événements immutable renseignés par un acteur autorisé et dossier terminé. Cela prouve la déclaration métier enregistrée, pas matériellement les travaux sur le terrain. Les autres déclencheurs d’entente restent refusés tant qu’une preuve métier officielle n’est pas raccordée.
6. Google réel, coordonnées/routes du fournisseur, dessin/rendu et géocodage n’ont pas été activés. La sortie du dessin est vérifiée par la logique et les références UI, pas par un clic sur Google réel.
7. Les finances complètes sont remplacées dans les fixtures par leur contrat minimal; aucune certification de comptabilité réelle ou des règles de facturation/paie/paiement n’est déduite.
8. Les municipalités inconnues ou ambiguës restent à confirmer. Le raccordement SQL ne transforme pas les coordonnées publiques existantes; aucune route routière n’est dérivée d’une ligne droite.

## 5. Validation nécessitant un Cloud isolé

- Installation autorisée dans l’ordre commun : dépendances EXEC-01/02 → EXEC-03 geography.sql → preferences.sql/search-sites.sql → EXEC-04 schema.sql; vérifier seo_cities, grants, RLS et signatures réelles.
- Authentification JWT réelle; refus inter-entreprises et liens propriétaire hors besoin, expirés, révoqués ou non récemment vérifiés; prévol sur origine autorisée.
- Mise à l’épreuve du handler de désabonnement existant avec token utilisé/renouvelé; bounce/complaint conservés; accord expiré/retrait entre réservation et tentative.
- File réellement isolée : progression, échec temporaire, nouvelles tentatives par le worker existant, révocation entre tentatives, expiration, DLQ, journaux et zéro doublon lien/message.
- Projections partenaires avec colonnes hébergées, transitions et événement lié, permissions financières de lecture de facture existante sans création de flux.
- Référentiel municipal et résultat de recherche réel; Google autorisé séparément avec origine maîtrisée, conservation de l’incertitude routière et des estimations économiques.

**Aucune de ces validations n’a été exécutée en Cloud; elles ne sont pas une autorisation d’activation.** Liste commune : prepared/exec01b/activation-checklist.md.

## 6. Conclusion

Code préparé corrigé et testable; 66 tests locaux ciblés réussis et capture TEST visible. GO pour organiser une validation d’intégration isolée sous nouvelle autorisation; NO-GO production. Aucun EXEC-05 engagé.
