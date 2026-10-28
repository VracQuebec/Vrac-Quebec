# Suite 28 octobre 2026 — consentement, capacité, miniatures, purge, unités

Légende : **Aperçu** = code dans l'aperçu, non publié. **Préparé** = fichier prêt, non installé. **Serveur** = installé sur le serveur en service. **Testé** = essai réellement exécuté (environnement précisé).

## 1. Bandeau de consentement (Aperçu, testé navigateur d'essai)
- `src/components/ConsentBanner.tsx`, `src/lib/analytics/consent.ts`, `ga4.ts`, `index.html`, lien « Témoins » dans `PublicContactFooter`.
- Accepter / Refuser / Personnaliser (même poids visuel); choix modifiable par « Témoins »; changement appliqué aux autres onglets.
- Par défaut tout est refusé : le script Google Analytics **n'est plus chargé** avant accord. Refus = GA désactivé et témoins `_ga*` effacés.
- Choix enregistré localement : accord oui/non, publicité toujours « non », date, version de politique `2026-10-28`.
- Jamais mesuré : `/admin`, `/entrepreneur`, `/portail`, `/partenaire`, `/chauffeur`, `/mission`, `/compte`, `/client`, `/invitation`, `/auth`, liens personnels (exclusion existante conservée). Paramètres d'adresse retirés sauf `utm_*`; référent vidé; signaux publicitaires Google désactivés.
- Événements autorisés (liste blanche, valeurs courtes sans `@` ni `.`) : `lead_created` (form, service, variant), `intent_select`, `home_cta`, `phone_click`, `whatsapp_click`, `form_submit` (page_slug). Tout autre événement ou champ est ignoré.
- Tests : 7 tests unitaires (`consent.test.ts`) réussis. Navigateur d'essai : 0 requête Google Analytics avant choix et après refus; après accord, envois `collect` présents, **aucune fuite** de `code`, `secret`, `linkId`. Les seules requêtes Google avant accord sont Google Maps (saisie d'adresse, service fonctionnel) — à mentionner dans la politique comme fournisseur, non comme mesure.
- Politique de confidentialité mise à jour (section Témoins). **Manquant** : durée de conservation configurée dans Google Analytics (2 ou 14 mois) — à lire dans l'administration Google Analytics; mention Google Maps comme sous-traitant; responsable de la protection des renseignements.
- Aucun traceur publicitaire ajouté.

## 2. Surveillance quotidienne (Préparé, testé base jetable locale)
- `prepared/stockage-2026-10-28/02_surveillance_alertes.sql` (remplace `01_…`).
- 1 relevé/jour (~470 octets), seuils modifiables par un admin : base > 6 Go / > 8 Go, journal des tâches > 2 Go, croissance > 300 Mo/24 h, fichiers > 2 Go.
- **Où** : cloche des notifications admin existante (catégorie « systeme », lien `/admin`).
- **Anti-répétition** : une clé par type et par semaine; un nouveau dépassement la même semaine met à jour la même alerte sans en créer une nouvelle, et une alerte traitée n'est pas rouverte. Les envois téléphone/push suivent les réglages existants de la catégorie.
- Essai local PostgreSQL jetable : sans dépassement = 0 alerte; deux passages = 1 relevé, 1 alerte par type (fusionnée); seuil critique distinct; lecture non-admin = 0 ligne; appel non-admin refusé. Preuve `suite-2026-10-28-preuves/surveillance-locale.txt`.
- Planification (1 exécution/jour) et retour arrière inclus en commentaire. Non installé.

## 3. Miniatures des anciennes photos CRM (Aperçu, tests unitaires)
- Bouton « Créer les miniatures (10 à la fois) » dans Photos et documents, visible aux membres pouvant écrire, seulement s'il manque des miniatures.
- Original téléchargé avec la session et les droits de l'utilisateur, jamais modifié; miniature déposée sans écrasement sous un chemin fixe par fichier; enregistrement seulement si la miniature est encore vide → reprise sans doublon. PDF et HEIC ignorés.
- Tests : 3 réussis (création, reprise sans doublon, refus d'accès). Essai réel sur une ancienne photo : **non exécuté** (aucune ancienne photo TEST sans miniature).

## 4. Avant toute purge (rien supprimé)
| Table | Nature | Période | Volume | Conséquence d'une purge > 14 jours |
|---|---|---|---|---|
| `cron.job_run_details` | journal technique des tâches planifiées | non lisible (accès protégé); ≈ 1,53 M lignes ÷ ≈ 8 700/jour ≈ depuis début mai 2026 | 4 567 326 720 o = 4,57 Go = 4,25 Gio | perte du détail des exécutions anciennes; aucune donnée client. ≈ 92 % des lignes visées. L'espace est réutilisé par la base mais le disque ne rétrécit qu'avec une réorganisation (verrou) |
| `net._http_response` | réponses techniques d'appels sortants | déjà purgée automatiquement (6 h) | 141 Mo pour 1 818 lignes | rien à purger; volume = espace non récupéré, réorganisation seulement |
| `ai_cache` / `ai_call_log` | cache et journal techniques IA | 27 juil.–14 oct. | 21 Mo / 2 502 et 4 125 lignes | cache recalculable (coût IA) ; journal = traçabilité des coûts — conserver |
| `email_send_log` | journal d'envoi | depuis 7 mai | 2 331 lignes | **preuve d'envoi/consentement — conserver** |
| `crm_audit_log`, `submission_audit_log`, `jsc_audit_log` | historiques métier | — | 17 / ≈30 k / ≈11 k lignes | **jamais purgés** |
| `seo_pages_links_backup_20260814` | sauvegarde ponctuelle | 14 août | 9 Mo | décision séparée; non proposé |

## 5. Unités et hypothèses GPS
- La base mesure **5 071 555 731 octets** = **5,07 Go** (décimal) = **4,72 Gio** (binaire). Le « 4,72 Go » d'un bilan précédent était une erreur d'unité (Gio), corrigée; **aucune baisse de volume**.
- Journal des tâches : 4 567 Mo décimaux = 4 356 Mio : même volume, deux unités.
- GPS : 1 position / 30 s (`MIN_INTERVAL_MS`) seulement pendant une mission et page visible ; 8 h → 960 points/jour. Ligne mesurée sur le serveur : 108 o + ≈ 28 o d'en-tête + index ≈ 220 o/point → ≈ 0,21 Mo/chauffeur/jour; 10 chauffeurs : ≈ 0,53 Go/an (250 jours) à 0,77 Go/an (365 jours). Hypothèses non vérifiées : durée réelle des missions, nombre de chauffeurs, positions refusées.

## 6. Mesures PDF / gros document (compte TEST A, serveur en service, réseau du bac à sable)
| Fichier fictif | Envoi | Ouverture contrôlée (1re / à chaud) | Lecture Storage directe |
|---|---|---|---|
| texte 15 o | — | 0,48 s / 0,50–0,61 s | 0,23 s |
| PDF 1 Mo | 1,79 s | 4,64 s (démarrage à froid) / 0,46–0,68 s | 0,71 s |
| document 15 Mo | 1,71 s | 2,80 s / 1,01–1,04 s | 0,49 s |
- Coût fixe des vérifications d'accès ≈ 0,3 s; démarrage à froid ≈ 4 s à la première ouverture après inactivité. Contenu identique, réponse `no-store`.
- Données TEST créées : `company-docs/0986b4f6…/r4k-perf-1000000.pdf` et `r4k-perf-15000000.pdf` (fictifs, non supprimés). Limite : réseau du bac à sable, pas celui d'un téléphone.

## 7. Protocole téléphone réel (5 minutes)
1. Téléphone sur données cellulaires puis Wi-Fi; noter l'opérateur et le nombre de barres.
2. Ouvrir l'aperçu, se connecter avec un compte TEST.
3. Formulaire « Je veux du remblai » : prendre 3 photos avec l'appareil; chronométrer de « Envoyer » au message de confirmation (ne pas envoyer : s'arrêter à la confirmation des photos si possible, sinon utiliser un dossier TEST).
4. CRM d'un dossier TEST : joindre 1 photo et 1 PDF; chronométrer l'apparition dans la liste; ouvrir la photo et le PDF, chronométrer l'affichage.
5. Recommencer une fois (2e essai = à chaud). Noter : modèle du téléphone, réseau, durées, messages d'erreur. Me transmettre ces notes.
- GPS en arrière-plan : essai séparé, non couvert.

## État
- Serveur : rien installé dans ce lot (seuls deux PDF fictifs TEST déposés pour la mesure).
- Aperçu : bandeau, blocage GA, politique, bouton miniatures.
- À approuver : installation de la surveillance (2), purge des journaux techniques (4), publication du bandeau.
