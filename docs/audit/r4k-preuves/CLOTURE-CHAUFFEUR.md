# R4K — préparation chauffeur, 27 octobre 2026

## Verdict
Préparation indépendante réalisée. Le parcours chauffeur avec vraie session **reste non exécuté** : aucun compte personnel chauffeur confirmé ni session chauffeur disponible. Ce document ne clôture ni SEO, ni abonnement, ni campagnes. Les validations R4K antérieures sont conservées, pas rejouées.

## Changements et environnements
| Point | Environnement | État réel |
|---|---|---|
| Camion et profil fictifs | Serveur en service, données TEST uniquement | Créés et relus; aucun compte ni appartenance ajouté |
| Support de réquisition DT-0056 | Serveur en service | Transport créé sur le dossier 823; affectation **non enregistrée**, sans chauffeur autorisé ni destination approuvée |
| Invitation personnelle | Aperçu uniquement | Raccord aux RPC déjà installées par l'adaptateur capture TEST; visible au propriétaire sur `/entrepreneur/punch`, indépendamment du punch étendu désactivé |
| Activation de l'invitation | Aperçu uniquement | Connexion/création personnelle dans le document privé existant; aucune soumission d'inscription effectuée |
| Portail chauffeur | Aperçu uniquement | Entreprise initiale issue du profil retourné par le serveur, pas d'un ancien choix navigateur |
| Suivi de réquisition | Aperçu uniquement | Lien vers `/chauffeur/mission?requisition=…` uniquement après acceptation ou démarrage; RPC reste l'autorité |
| Serveur, code | Inchangé | Aucune migration, aucun redéploiement, aucune publication, aucun changement d'Auth ou de rôle |

Le drapeau `DRIVER_INVITATIONS_INSTALLED` utilise `import.meta.env.DEV`; la version publiée reste fermée. La capture utilise l'origine canonique autorisée par le serveur (localhost pour l'essai local); le lien affiché manuellement reste sur l'origine de l'aperçu. Aucun jeton personnel n'est archivé dans les preuves.

## Données TEST conservées et identification
Entreprise A : `0986b4f6-6fcd-4a3c-951e-69e3d42198ee` (`TESTA`). Entreprise B : `54a6c2c3-1a92-4694-84f0-83c08a18950a` (`TESTB`).

| Objet | Identification | État |
|---|---|---|
| Camion ajouté | `43537bcf-ed93-48af-b3e8-7aa2469af1f0` — TEST R4K — Camion chauffeur | Entreprise A, privé, tarif nul; 20 tonnes et 12 m³ sont des valeurs fictives indépendantes, aucune conversion |
| Profil ajouté | `9d1b59b7-b36f-44c8-a7f5-1b5669ac2407` — TEST R4K Chauffeur | Entreprise A; `user_id=null`, aucune adresse personnelle imposée |
| Transport ajouté | `5101bddf-c0ce-4189-858f-35cf98b7c250` — DT-0056 | Source `r4k_test_preparation`, courriel réservé `r4k-chauffeur-parcours@test.invalid`, version 1, état de réquisition nul |
| Dossier réutilisé | `342f1785-d190-4f16-9515-e9288dc490d3` — 823 | `r4k-demande@test.invalid`, auteur et entreprise A déjà liés |
| Ancien dossier TEST | `483d4b78-8598-4a4d-b3b0-bbbdc18695ce` — 824 | `r4k-forge@test.invalid`, entreprise A |
| Ancien dossier TEST | `b7a52ea3-4ce8-4322-a59a-24c536a7a0f7` — 826 | `r4k-ancienne1@test.invalid`, rattachement refusé |
| Ancien dossier TEST | `0216d082-fa38-400b-ab3a-33cce84ad544` — 827 | `r4k-ancienne2@test.invalid`, entreprise B, revalidation demandée |
| Vérification refusée | `7609d1da-841b-4271-8759-0ecb6f95db46` | Historique conservé |
| Vérification approuvée | `f8a48499-da48-4f4d-a30a-1b4d19b60f5a` | Historique conservé |
| Fichiers historiques TEST | bucket privé `company-docs`, chemins `0986b4f6-6fcd-4a3c-951e-69e3d42198ee/r4k-test.txt` et `54a6c2c3-1a92-4694-84f0-83c08a18950a/r4k-b.txt` | Objets présents; **aucune ligne correspondante dans ent_company_documents** lors de la lecture actuelle; ne pas les présenter comme pièces accessibles depuis cet écran |

Les comptes TEST confirmés déjà présents ne sont pas des chauffeurs : propriétaires A/B, opérateur A, superadmin, multi-entreprises, entreprises C/D. Aucun compte existant n'a été requalifié. Aucune suppression, réattribution ou modification de dossier réel.

## Réquisition prévue, sans faux enregistrement
- Entreprise : TEST A; dossier/chantier 823; transport DT-0056.
- Profil : TEST R4K Chauffeur, à rattacher **par invitation acceptée avec le compte personnel confirmé**, jamais par nom/courriel.
- Camion : TEST R4K — Camion chauffeur.
- Matériau : terre; quantité : **20 tonnes**, reprise de `submissions.tonnage`, pas convertie depuis la quantité 10.
- Horaire de démonstration à saisir : 28 octobre 2026, 09:00 Toronto (13:00 UTC), sans rendez-vous réel.
- Consignes : « TEST fictif — commandes à l'arrêt; positions synthétiques uniquement; aucune livraison réelle; aucun envoi. »
- Destination : **non choisie**. Aucune `submission_site_decisions` approuvée pour les quatre dossiers TEST lors de la lecture; la coordination doit sélectionner/créer un dossier TEST pertinent et approuver la proposition par le parcours administratif existant. Ne jamais employer une destination réelle ou inventer un identifiant.

Le serveur refuse légitimement l'affectation sans appartenance chauffeur active et sans destination approuvée. Les contrôles n'ont pas été contournés pour remplir artificiellement la réquisition.

## Essais de ce tour
| Essai | Type | Résultat |
|---|---|---|
| Création camion/profil/transport et relecture | Serveur, données fictives | Réussi; transport sans affectation; 0 invitation du profil, 0 mission, 0 réservation |
| Première création transport avec `m3` | Serveur, tentative fictive | Échec attendu de contrainte réelle : seules `tonnes`, `verges`, `inconnu` permises. Transaction annulée; compteur resté 55. Reprise en 20 tonnes enregistrée DT-0056; aucune contrainte modifiée |
| RPC invitation et droits relus | Lecture serveur | `driver_invite_capture`, prepare/accept/options installés; compte confirmé et identité chauffeur imposés par les gardes |
| Capture/activation/arrêt du suivi/erreurs | Local, dépendances simulées | 18 tests existants ciblés réussis; pas une vraie session |
| Adaptateur capture de l'aperçu | Local | 3 nouveaux tests réussis : capture au lieu de préparation ordinaire, renouvellement hors catalogue refusé, erreur sans succès |
| Lien de suivi exact / absence avant acceptation | Local | Résultats dans `tests-locaux.txt` |
| Écran inscription personnelle | Playwright, signé-out, aucun formulaire soumis | Formulaire accessible; `creation-personnelle.png`; aucun compte ni courriel créé |
| Portail sans session | Playwright | Aucun profil ni mission montré; `sans-session.png` |
| Invitation capturée avec vraie session | Hébergé | **Non exécuté** : session propriétaire TEST absente ce tour |
| Accès, acceptation, démarrage, positions fictives, clôture | Hébergé vraie session chauffeur | **Non exécuté** : compte chauffeur confirmé et destination TEST approuvée absents |
| Autre entreprise / autre chauffeur / révocation même session / historique | Hébergé vraie session chauffeur | **Non exécuté** : mêmes dépendances; un second profil/dossier TEST autorisé doit fournir le cas négatif |

Les positions fictives devront être marquées comme démonstration dans le protocole; l'arrêt du suivi doit être observé, puis les nouvelles lectures/actions tentées avec **la même session**, sans renouveler la connexion. RLS peut répondre par une liste vide plutôt que par une erreur : le refus signifie aucune donnée accessible. Les archives seront relues par le propriétaire autorisé. Aucune preuve GPS en arrière-plan sur appareil physique.

## Défaut de téléchargement antérieur, conservé
Défaut R4K : le point Storage simple pouvait resservir une copie en cache après révocation, malgré les contrôles de `secure-file`. Correction déjà déployée : lecture par `/object/authenticated` avec paramètre unique, contrôle session/droits à chaque requête et réponse `no-store`. Archive antérieure `prepared/securite-r4k/archive/secure-file-index.avant.ts`; version corrigée `prepared/securite-r4k/secure-file-index.apres.ts`. Les succès/refus R4K antérieurs sont conservés dans le registre; **pas rejoués ici**. Un téléchargement déjà enregistré sur l'appareil n'est pas effaçable par révocation; les anciens liens signés restent valides jusqu'à expiration. Aucun nouveau redéploiement ce tour.

## Action exacte pour poursuivre
1. Connecter d'abord **`test-a-proprietaire@test.invalid`** dans l'aperçu, écran `/login`, avec le mot de passe uniquement dans le formulaire. Cette session permet de vérifier la capture, le catalogue et la préparation TEST sans élargir les rôles.
2. Ouvrir `/entrepreneur/punch`, entreprise **TEST — Entreprise A**, section **Accès personnels chauffeurs**; sélectionner **TEST R4K Chauffeur** et le courriel du futur compte personnel fictif. La capture installée accepte **uniquement les adresses réservées TEST**; le lien se consulte manuellement, rien n'est remis ou livré par courriel.
3. Depuis ce lien **dans l'aperçu**, choisir **Connexion → Créer un accès personnel → Créer mon compte personnel**. Confirmer le courriel par le parcours normal, puis revenir au même lien, se connecter et **Activer mon accès chauffeur**. Aucun mot de passe ni lien personnel dans le chat.
4. **Limite concrète** : une adresse `.invalid` n'a pas de boîte de réception ordinaire. Si aucun compte chauffeur réservé déjà confirmé par le parcours normal n'est fourni, la confirmation ne peut pas être prétendue disponible. Une vraie boîte de test confirme normalement mais est refusée par la capture actuelle. Il faut alors un environnement de confirmation TEST adapté ou une adaptation ciblée autorisée de cette incompatibilité, jamais une confirmation forcée ou une désactivation globale. Aucun envoi de confirmation lancé ici.
5. Une fois confirmé, connecter le chauffeur dans l'aperçu et conserver sa session ouverte; les essais demandés pourront alors être exécutés. La session transmise depuis l'aperçu est le moyen prévu; aucune session mintée à la place d'un compte non confirmé.

## Protections et périmètre
Lecture actuelle : `exec02_dispatch(jsonb)` non exécutable par `authenticated`; les quatre helpers 0233 fermés à anon/authenticated. Aucune préférence de réception ni réservation créée, aucun worker/cron/envoi activé. Les réglages existants des entreprises et les communications du portail particulier sont inchangés. Les captures sont consultables **dans le projet**, pas publiées.

**Clôture de préparation R4K seulement** : camion/profil/support transport et raccords d'aperçu disponibles; la validation utilisateur chauffeur et la réquisition effectivement affectée restent ouvertes avec les dépendances précises ci-dessus.