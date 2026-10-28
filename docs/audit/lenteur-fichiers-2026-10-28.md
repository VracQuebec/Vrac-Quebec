# Fichiers, capacité et mesure : bilan du 28 octobre 2026

## 1. Mesures (M = mesuré, E = estimé)
| Élément | Avant | Après |
|---|---|---|
| Photo de téléphone 4032×3024 envoyée par les formulaires (M) | 10,54 Mo | 2,35 Mo, compression en 286 ms |
| Affichage d'une photo dans la liste CRM (M) | original signé (jusqu'à 20 Mo) | miniature de 36,6 Ko, créée en 152 ms |
| Envoi de plusieurs fichiers CRM | 1 à la fois, aucun nouvel essai | 3 en parallèle, 3 essais |
| 6 photos sur une 4G à 5 Mb/s (E) | ≈ 101 s | ≈ 23 s |
| Photos déjà stockées, lead-photos (M) | 98 fichiers, 3,93 Mo en moyenne, 9,44 Mo au maximum | inchangées |
| crm-docs (M) | 12 fichiers, 4,75 Mo en moyenne | inchangés (aucune compression) |

Tests restants :
- Envoi réel depuis un téléphone sur réseau cellulaire.
- Ouverture d'un PDF ou d'un gros document par `secure-file` avec une session TEST (mesure de la durée de vérification des droits).
- Téléchargement d'une grande photo existante : l'accès anonyme a renvoyé 98 octets (accès refusé), conforme à la protection.

## 2. Ce qui est compressé et ce qui ne l'est pas
- Compressées : photos de terrain des formulaires publics (remblai, dompe, détails).
- Originaux intacts plus miniature : pièces CRM (une photo peut servir de preuve, par exemple un billet de pesée ou une photo avant/après).
- Non touchés : PDF, documents signés, photos de la ronde de sécurité (preuves de défauts), pièces de dépenses et d'achats (preuves fiscales), documents de flotte.

## 3. Accès aux miniatures
- Migration 0247 : ajout de la colonne `thumb_path` à `ent_crm_files`, et la politique de lecture accepte `storage_path` OU `thumb_path`.
- Les miniatures sont soumises au même contrôle par entreprise (`entcrm_can_read`). La révocation et l'isolation entre entreprises restent inchangées.
- Anciennes photos : pas de miniature. L'original est chargé seulement au clic, et non plus pour afficher la liste.

## 4. Ressources (M le 28 octobre)
| Ressource | Valeur |
|---|---|
| Instance | Tiny |
| Mémoire | 65 % utilisée |
| Connexions | 9/60 |
| Disque | 43 % utilisé |
| Base | 4,72 Gio (≈ 5,07 Go décimaux), dont environ 92 % de journaux de tâches planifiées |
| Journal d'écriture (WAL) | 128 Mo |
| Fichiers | environ 443 Mo |
| Transactions annulées depuis le démarrage | 134 963 (à suivre, pas d'alerte) |
| Alertes d'épuisement sur 48 h | aucune |

Non disponibles : processeur (CPU), historique de croissance de la base et inventaire des sauvegardes.

Plan de capacité (E) :
| Volume | Estimation | Conservation proposée |
|---|---|---|
| Journaux de tâches planifiées | environ 8 700 lignes par jour | 14 jours (purge non autorisée à ce jour) ; volume ramené à quelques dizaines de Mo |
| Positions GPS | environ 1 point / 30 s × 8 h ≈ 0,2 Mo par chauffeur et par jour ; 10 chauffeurs ≈ 0,7 Go par an | positions brutes 90 jours, puis seulement le résumé du trajet (à faire valider) |
| Photos | sans compression : environ 4 Mo par photo ; avec compression : environ 0,3 à 2,4 Mo | — |
| Événements de mesure locaux | négligeable | — |

Alertes proposées : disque au-delà de 70 %, mémoire au-delà de 85 %, base en hausse de plus de 10 % par semaine. Ces alertes reposent sur le relevé quotidien préparé (`prepared/stockage-2026-10-28/`), qui n'est pas installé.

Augmentation de capacité : le disque coûte 0,6164 crédit par Go tous les 30 jours. Le changement d'instance se fait dans Cloud → Advanced settings. Aucun changement effectué.

## 5. Cookies et outils de mesure (inventaire)
| Outil | Données et lieu de stockage | Conservation | Volume chez nous |
|---|---|---|---|
| Google Analytics 4 (G-T6HYZVY8E0, actif) | serveurs de Google (États-Unis) ; bloqué sur les pages privées (`privateTelemetryBlocked`) | réglage Google, 2 ou 14 mois, à vérifier | ga4_* : résumés quotidiens seulement, moins de 1 Mo par an |
| Session de connexion | navigateur (localStorage) | jusqu'à la déconnexion | 0 |
| `vq_stay_logged_in`, `vq.lastUid` | navigateur | préférence | 0 |
| Brouillons et filtres CRM | navigateur, sessionStorage et localStorage | session ou jusqu'à l'envoi | 0 |
| Plausible | aucun outil chargé (mot présent seulement dans le code) | — | — |

Configuration proposée (non activée) : bandeau de consentement avant GA4, conservation Google de 2 mois, aucun identifiant utilisateur envoyé, et au plus 5 événements métier (demande commencée, envoyée, appel, photo ajoutée, erreur d'envoi). Effet estimé sur notre stockage : nul, car les données restent chez Google.
