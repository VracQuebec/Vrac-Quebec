# EXEC-05 — facturation finale entrepreneur

19 octobre 2026. **Développement intégré et validation locale réalisés; GO limité à une validation d'intégration isolée autorisée, NO-GO production.** Aucune migration Cloud, publication, modification de données historiques, communication externe, activation de paiement ni modification d'abonnement.

### Mise à jour EXEC-08
Le défaut de PDF/EML aux octets différents relevé ci-dessous est corrigé dans les sources : téléchargement et brouillon EML réutilisent le même fichier privé enregistré, sans nouveau rendu pour le courrier. Deux tests ciblés vérifient identité des octets et refus en cas de fichier absent/inaccessible. Le chemin Storage hébergé et le parcours navigateur complet restent non revalidés; les captures ci-dessous restent les preuves historiques d’EXEC-05, pas des preuves de la correction EXEC-08.

## Accès et manques résolus
- `/entrepreneur/crm?tab=clients` : actions soumission et facture depuis le client.
- `/entrepreneur/crm?tab=quotes` : soumission → acceptation documentée → chantier et conversion contrôlée en facture; accès client, chantier et factures/encaissements.
- `/entrepreneur/crm?tab=projects` : liens client, soumission et factures filtrées par chantier.
- `/entrepreneur/finances?tab=factures` : facture directe, client/chantier, quantités effectivement facturées, émission, PDF, préparation du courriel, encaissements et avoirs existants. Paramètres `company`, `client`, `chantier`, `quote`, `facture` portent les références, sans contourner les permissions serveur.
- `/entrepreneur/finances?tab=comptabilite` : grand livre existant; accès général, pas de présélection d'une écriture.
- Essais : mêmes composants sur localhost, `finance_test=local`, raccordés au harnais local, aucun adaptateur Cloud activé. Cette entrée ne fonctionne pas sur le domaine public.

Les moteurs fiscaux, numérotation par entreprise, modèles PDF, instantanés, entrées attendues, règlements manuels, avoirs et facturation progressive sont réutilisés. Création directe avec clé stable et reprise contrôlée; une réponse réseau incertaine n'accepte pas une facture d'un autre client/chantier. Conversion enrichie de l'adresse et du chantier à la création uniquement. Téléchargement Blob différé; préparation EML avec PDF, `X-Unsent: 1`, validation du destinataire/objet, capture locale unique et refus de clé rejouée avec un message différent.

Statuts financiers dérivés des encaissements/avoirs et échéances existants : brouillon, émise, partiellement payée, payée/en retard et correction par avoir. Le courrier ne change pas le solde. Document émis immuable, correction par mécanismes existants, jamais remplacement silencieux.

## Validation locale réellement exécutée
Cluster PostgreSQL **127.0.0.1:55439**, répertoire vérifié `/tmp/exec-correctifs/`; chaque essai crée une base vide `exec05_<UUID>`, nettoyée après succès ou échec. Harnais HTTP localhost:55445 arrêté après vérification. Aucune connexion aux données Cloud pour ces tests. Identité fictive **entrepreneur propriétaire**, sans rôle super admin; permissions appliquées dans les vrais RPC et politiques, pas simplement dans l'interface.

**29 tests réussis, six fichiers**, commande ciblée avec `EXEC05_LOCAL_TEST=1` :
| Fichier | Nombre | Résultat |
|---|---:|---|
| `src/test/exec05-integration.test.ts` | 7 | SQL réel de facturation et grand livre |
| `src/test/exec05-rules.test.ts` | 4 | statut courrier distinct du paiement, avoir distinct d'argent reçu, injection d'en-tête refusée, EML non envoyé avec PDF |
| `src/test/fin-08.test.ts` | 2 | moteur de facture existant |
| `src/test/fin-08b-receipts.test.tsx` | 4 | encaissements |
| `src/test/fin-09a-credit.test.tsx` | 5 | avoirs |
| `src/test/fin-09b1-progress.test.tsx` | 7 | acomptes/situations progressives |

Tests SQL nouveaux :
1. Facture directe idempotente; client étranger et utilisateur d'une autre entreprise refusés.
2. Soumission convertie sans doublon; quantité réelle 3 × 100 $ → **344,93 $**; réémission sans deuxième entrée attendue; facture figée et modification directe de la soumission engagée refusées.
3. Facture **229,95 $**, paiement **100 $** puis **129,95 $**, solde nul; même clé sans deuxième encaissement, clé avec montant différent refusée; lecture et règlement interentreprises refusés.
4. Avoir sur taxes figées, émission rejouée sans deuxième effet, entrée attendue archivée après crédit complet.
5. Capture courrier TEST persistante unique; contenu différent sur même clé, entreprise étrangère et adresse réelle refusés.
6. Grand livre **original 0148** : facture **229,95 $**, paiement **100 $**, avoir **229,95 $**, écritures équilibrées, une écriture par source et synchronisation répétée sans doublon; modification directe et lecture interentreprises refusées. Le mode avoir « balance » crédite le brut encore créditable, pas le solde net après encaissements; le trop-perçu reste calculé par l'existant, jamais réaffecté automatiquement.
7. Acompte puis solde par le dossier progressif existant; cumul hors taxes **1 000 $**, total facturé **1 149,76 $** (taxes arrondies séparément par facture, écart de 0,01 $ avec une facture unique), pas de seconde facture au rejeu et conversion intégrale refusée après engagement progressif.

Les migrations existantes utiles jusqu'à 0148 sont chargées, non réécrites. 0118/0119/0120 et les modules non concernés restent exclus; fixture membres/Storage et queue locale ne reproduisent pas tous les déclencheurs/services hébergés. Les tentatives initiales de chargement ont échoué sur champs de fixture absents; fixtures complétées, dernière exécution 29/29 réussie. Avertissements d'accessibilité Radix dans des tests existants de facturation progressive; aucun échec de test associé. Dernier signal aperçu : `build OK`.

## Parcours navigateur et documents
Chromium ordinateur **1280 × 1800**, mobile **420 × 757** : vrai écran Clients → création soumission 10 × 100 $ → remise/acceptation documentée → chantier → facture ajustée à 3 × 100 $ → émission → téléchargement PDF → préparation/capture courrier → paiement 100 $ puis 244,93 $ → solde **0,00 $**; ensuite facture directe 2 × 100 $ → **229,95 $**. Deux factures, deux règlements liés à la première, une capture persistante. Zéro erreur JS, zéro erreur du harnais. Les demandes analytics/polices externes du document racine ont été **interceptées et bloquées** : quatre tentatives, aucun succès; ne pas prétendre « aucune tentative externe ».

PDF téléchargé **8 976 octets**, rendu et contrôlé visuellement : sous-total **300,00 $**, TPS **15,00 $**, TVQ **29,93 $**, total **344,93 $**, client/entreprise/chantier/échéance corrects. EML téléchargé non vide, pièce jointe PDF **8 694 octets**, signature `%PDF`, montant identique; taille différente liée au nouveau rendu, pas identité binaire certifiée. Les noms, adresses, identifiants fiscaux et coordonnées sont fictifs, jamais des données opérationnelles.

Captures conservées dans `exec05-preuves/` :
- [Soumission et chantier](exec05-preuves/quote-desktop.png)
- [Facture issue de la soumission](exec05-preuves/invoice-desktop.png)
- [Facture directe](exec05-preuves/direct-desktop.png)
- [Courriel capturé, non envoyé](exec05-preuves/mail-desktop.png)
- [Paiement partiel](exec05-preuves/partial-desktop.png)
- [Facture réglée ordinateur](exec05-preuves/paid-desktop.png)
- [Solde mobile](exec05-preuves/paid-mobile.png)
- [Liste mobile](exec05-preuves/list-mobile.png)
- [PDF rendu](exec05-preuves/pdf-page.png)

## Fichiers intégrés
- `src/pages/EntrepreneurCrm.tsx` : accès croisés, export des composants existants pour le harnais, conversion conservant uniquement en local le mode TEST.
- `src/components/finances/Invoices.tsx` : client/chantier et liens, création/reprise contrôlée, PDF et préparation du courriel.
- `src/components/finances/InvoiceMailDialog.tsx`, `src/lib/finances/invoiceMail.ts`, `src/lib/finances/download.ts` : édition, EML/PDF non envoyé, téléchargement et capture locale.
- `src/components/finances/FinanceLocalScreen.tsx`, `src/lib/finances/exec05.ts`, `src/App.tsx` : entrée TEST localhost réutilisant les véritables écrans, sans montages de services métier.
- `prepared/exec05/{invoices.sql,local-base.sql,local-db.ts,harness.ts,mail.ts}` : extension préparée, assemblage original, environnement jetable, contrôles serveur et capture de la queue locale existante.
- `src/test/exec05-{integration,rules}.test.ts`, `AGENTS.md`, `roadmap.md`, `prepared/exec01b/activation-checklist.md`, présent bilan et captures.

## Limites, risques et activation restante
1. **Cloud isolé autorisé requis** pour le schéma exact, tous les prédécesseurs/triggers, JWT/membres/permissions réels, PostgREST, concurrence de numérotation et Storage privé. Les paramètres de connexion/inscription hébergés ne sont pas vérifiés par une fixture.
2. **Courriel réel non raccordé**, conformément à l'interdiction : capture locale réutilisant la fixture d'EXEC-02, pas pgmq ni prestataire réel. Le fichier EML utilise une pièce jointe; le service existant de courriels d'application ne supporte pas les pièces jointes et devra utiliser un lien privé signé. File, suppression, retries et états prestataire à vérifier en Cloud isolé autorisé; aucun envoi/livraison certifié.
3. Migrations préparées non appliquées, `EXEC05_HOSTED_ENABLED=false`; l'enrichissement serveur et la nouvelle création par clé restent à installer isolément. Chemin hébergé conserve la création existante avec identifiant stable et vérification client/chantier de reprise, pas une certification transactionnelle du nouvel adaptateur.
4. Grand livre nécessite les associations de comptes de chaque entreprise; aucune association/tarification commerciale inventée. Synchronisation SQL vérifiée, écran global du grand livre non exercé par ce parcours navigateur; conservation des exercices/clôtures hébergés à vérifier.
5. PDF/EML vérifiés sous Chromium; iOS Safari, partage natif et politiques des liens privés hébergés non vérifiés. Pas de nouveau processeur : règlements manuels vérifiés sans activation PSP.
6. Avoir/acompte validés SQL et composants ciblés, pas par un nouveau parcours navigateur complet pour chacun. Nouvelle révision fiscale du devis n'altère pas la facture émise; les règles de plafond/retenues restent celles des modules existants.

Les dépendances EXEC-01/02/03/04, Cloud, Google, courrier et finances sont **conservées** dans la liste commune. Aucun travail du lot suivant ni action réelle ne découle de ce GO limité.