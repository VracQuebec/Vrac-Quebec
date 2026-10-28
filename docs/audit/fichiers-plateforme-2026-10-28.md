# Fichiers partout — corrections et couverture, 28 octobre 2026

## Verdict
**Mandat transversal non terminé.** Corrections dans l'aperçu, tests réels ciblés sur les comptes fictifs existants; aucun déploiement serveur ni publication. Aucun original client modifié, aucune suppression, aucun changement de droits. Cookies, politique et capacité exclus.

L'inventaire de motifs a repéré 57 fichiers sources, listés dans `fichiers-plateforme-preuves/sources-reperees.txt`. Ce nombre n'est pas un nombre d'écrans certifiés : les composants partagés desservent plusieurs pages. Les pipelines transitoires `prepared/` ne sont pas comptés comme actifs. Les exports générés ont été recensés, mais pas tous mesurés.

## Tableau demandé
« Non mesuré » signifie qu'aucun gain en secondes ne peut être affirmé. Les différences de réseau et de démarrage à froid interdisent d'attribuer les variations du service inchangé aux corrections.

| Écran | Opération | Cause identifiée | Correction | Mesure avant/après | État de déploiement |
|---|---|---|---|---|---|
| Formulaires Remblai / Détails / Parcours public | Ajout photos | Photos de téléphone volumineuses | Améliorations acquises conservées : préparation, 3 envois parallèles, progression | Mesure antérieure conservée : 10,54 → 2,35 Mo; pas rejouée | Aperçu, correction antérieure |
| Obtenir des soumissions | Ajout / reprise | Jusqu'à 8 envois séquentiels; un nouvel essai renvoyait les succès | 3 en parallèle; chemin stable et succès conservé par File pendant la page; progression par nombre; originaux inchangés | 1 → max. 3 en simultané; durée réseau non mesurée sur ce formulaire | Aperçu, non publié |
| CRM entrepreneur, leads/clients/soumissions/chantiers | Liste / photo au clic | Originaux déjà remplacés par miniatures; conserver acquis | Miniatures privées conservées; grande image au clic | TEST existante : originale 3000×2000 ouverte; traitement ancien non rejoué | Aperçu; colonne/politique miniature déjà installées |
| CRM entrepreneur | Ajout / reprise après rattachement interrompu | Nouvelle clé/fichier/fiche à chaque reprise | Identités objet/fiche/lien stables, verrou par travail; reprise au dernier stade confirmé; relecture sous les mêmes droits | Avant : code recommençait upload+fiche; après réel : 1 upload, 1 fiche, 2 essais de lien; une seule pièce affichée | Aperçu; PDF fictif conservé sur serveur TEST |
| Flotte : véhicule/entretien/réparation/inspection/dépense, admin et entrepreneur | Liste | Originaux signés pour chaque petite image, même hors écran | Aucun original téléchargé pour la liste : icône puis ouverture explicite; vraies miniatures flotte restent à préparer | Transferts originaux de la liste : N → 0 par conception; pas de comparaison réseau sur une liste peuplée de photos | Aperçu, non publié |
| Flotte | Ajout multiple / aperçus locaux | Envois séquentiels; URL locale recréée à chaque rendu sans libération | Max. 3 envois; progression par nombre, erreurs persistantes; une URL par File avec nettoyage | Test 6 pièces : max. 3 simultanées, 5 succès/1 refus; chaque original une fois | Aperçu |
| Flotte admin — onglet Documents camion TEST | Ajout / ouverture PDF | Ouverture après attente peut être bloquée; réemploi ancien lien liste | Onglet réservé dès le clic; lien demandé à l'ouverture, pas tiré de la liste | Réel : 1 upload; 118 ms jusqu'au nouvel onglet (pas preuve de rendu PDF complet) | Aperçu; pièce synthétique conservée |
| Flotte entrepreneur TEST A | Ajout | Refus serveur, **pas lenteur** : crm-docs INSERT admin seulement; crm_documents INSERT admin seulement | Refus conservé; erreurs désormais visibles dans l'écran; aucune permission élargie | Storage 400 avec AccessDenied/RLS; ajout légitime entrepreneur non disponible | Blocage serveur confirmé; décision de droits séparée nécessaire |
| Documents entreprise | Ouverture PDF/image | Pas d'état pendant vérification/transfert; double clic pouvait lancer plusieurs lectures | Verrou immédiat, octets reçus ou taille si connue; aucune cache de résultat; objet URL réutilisé pour téléchargement dans le même aperçu | TEST PDF 1 003 189 o : ajout 1,425 s; ouverture boîte 1,911 s, rendu PDF ensuite constaté; téléchargement octets identiques | Aperçu; service secure-file installé inchangé |
| Documents / Assurances — transfert contrôlé | Ouverture gros document | Fonction attend le Blob entier avant réponse | Streaming préparé : mêmes buckets, même auth/RLS, point authenticated et cache-buster/no-store inchangés | Réseau navigateur installé : 1 Mo 1,556 s; 15 Mo 1,444 s. Avant antérieur : 1 Mo 0,46–4,64 s; 15 Mo 1,01–2,80 s. **Pas de gain serveur attribuable** | Source préparée seulement, NON DÉPLOYÉE |
| Assurances : police / soumission assureur / preuves renouvellement | Ouverture / téléchargement | Lectures concurrentes involontaires; attente silencieuse | Verrou partagé par écran et progression d'octets; mêmes fichiers/droits | Tests helper : 2 appels distincts, deuxième 403 refusé; parcours police complet non exécuté | Aperçu, non publié |
| Chauffeur — preuves d'assurance | Ouverture | Popup créée après attente; URL Blob jamais libérée | Popup réservée au clic, verrou, progression, libération différée | Test helper autorisation réussi; chauffeur révoqué non réactivé, UI chauffeur non exécutée | Aperçu |
| Finances — achats fournisseurs / notes de crédit / pièces de commande réutilisant uploadProof | Ajout original | SHA-256 puis transfert attendus séquentiellement | Empreinte et envoi indépendants en parallèle; original byte-for-byte | Temps = max(hash, upload) plutôt que somme, gain réseau non mesuré | Aperçu; aucune écriture financière de test |
| Notes de frais | Ajout original | Empreinte puis upload séquentiels | Parallélisation après identification autorisée; original et RPC existants conservés | Gain non mesuré; régressions métier locales réussies | Aperçu |
| Finances — Reçus et documents | Liste / aperçu | Deux lectures fin_cap_detail; signature original même avant ouvrir aperçu | Une lecture du détail; aperçu au clic sur ordinateur et téléphone; conversion affichée à la demande | Réel TEST : 2 → 1 lecture détail; 1 → 0 signature avant clic; 1 signature après clic | Aperçu; aucune extraction IA lancée |
| Finances — justificatifs de règlement | Ajout multiple | Pièces envoyées en série après déclaration | Max. 3 attachments en parallèle, succès/échecs individuels conservés; aucun nouveau règlement automatique | Non mesuré; 8 tests PostgreSQL règlements ignorés faute de fixture locale configurée | Aperçu, validation intégrée restante |
| Factures émises / avoirs / brouillons | PDF / téléchargement | Documents figés et lecture canonique : pas de lenteur spécifique démontrée ici | Originaux, snapshots et rendu existants conservés; pas de régénération substitutive ni compression | Tests PDF/facture réussis; mesures factures UI restant à exécuter (ne pas assimiler PDF TEST à facture) | Inchangé pour ces écrans |
| Administration — photos demandes | Liste / ouverture | Images originales sans lazy loading | Chargement natif à la demande et décodage asynchrone | Non mesuré; dérivés privés admin encore non raccordés | Aperçu |
| CRM administratif historique | Ajout / ouverture | Upload brut; liens de 5 min | Recensé, pas corrigé ce passage | Non mesuré | Inchangé |
| Ronde de sécurité | Preuve photo / ouverture | Upload original rds-photos; lien 300 s | Originaux de preuve conservés; optimisation à poursuivre | Non mesuré | Inchangé |
| Coupons / compteur voyages | Photo | Upload direct cpn-photos | Recensé, conservation preuve | Non mesuré | Inchangé |
| Logbook chauffeur | Pièce / ouverture | Upload direct log-files, lien 60 s | Recensé, conservation preuve | Non mesuré | Inchangé |
| Obligations et renouvellements | Preuve / ouverture | Upload direct obl-proofs, lien 120 s | Recensé, conservation preuve | Non mesuré | Inchangé |
| Partenaire — galerie | Ajout / liste / ouverture | Originals et très longs liens existants | Recensé, aucun changement de visibilité ni fournisseur | Non mesuré | Inchangé |
| Portail personnel remblai / conditions réception | Ajout / aperçu | Encodage base64 et transport bearer séparés | Parcours privé protégé conservé; pas de cache personnel ajouté | Non mesuré | Inchangé |
| Soumission client publique | Pièce partagée / téléchargement | Fonction résout jeton + pièce cochée de la version | Autorisation étroite conservée; pas de lien élargi | Non mesuré | Inchangé |
| Administration blogue / SEO, galeries générées | Ajout / images / export | Pipelines publication séparés | Recensé; aucune génération IA/publish | Non mesuré | Inchangé |
| Finances, BI, CRM, imports CSV/Excel et configuration JSC | Import local / PDF / Excel / CSV export | Génération locale ou pagination, pas automatiquement transfert Storage | Recensé : CsvImportModal, ExcelImportModal, GoogleSheetImportModal, ConfigBackup, PricingCsv, ResourceManager, BillingOverview, Treasury, FinanceSearch, Profitability, LedgerYears, ClientAccounts, BankReconciliation, PublicationDashboard, TerritorialCoverage, OptimizationReportModal | Non mesuré dans ce passage | Inchangé |

## Sécurité et preuves
- `secure-file` n'est pas étendu à crm-docs/entcrm-files/fin-expense-files : ses protections actuelles ne couvrent pas ces chemins. Les URL signées historiques gardent leur durée résiduelle; pas de fausse promesse de révocation instantanée universelle.
- Aucune cache de Blob entre ouvertures protégées. Un document déjà affiché/téléchargé ne peut pas être rendu invisible rétroactivement.
- Règles Storage et crm_documents réelles consultées : permissions admin-only expliquent le refus entrepreneur flotte. Ce mandat ne les élargit pas.
- Trois petits/fictifs ajouts conservés : PDF reprise CRM, PDF Documents ~1 Mo, PDF flotte administratif. Les photos/PDF TEST existants ont été lus sans suppression ni modification d'original.
- Capture miniatures acquise non rejouée; ouverture grande image 3000×2000 et listes CRM revérifiées.
- Régression : 19 tests de fichiers/finances ciblés réussis, puis 3 nouveaux tests de reprise/auth réussis; autre lot 17 réussis, 8 tests SQL règlements ignorés. Ne pas additionner sans dédupliquer les suites qui se recouvrent.
- `deno check` secure-file streaming réussi, pas preuve d'exécution hébergée. Dernières compilations aperçu OK.

## Travaux restants, pas un blocage téléphone
1. Continuer miniatures privées admin/flotte et nouveaux uploads des pipelines encore inchangés; conserver le modèle de droits de chacun, pas de nouvelle architecture universelle supposée.
2. Réconcilier les permissions documentaires flotte entrepreneur avant un éventuel serveur ciblé : le refus actuel est réel, pas à contourner.
3. Valider puis autoriser distinctement le streaming secure-file sur le serveur partagé; avant/après comparable à produire après installation.
4. Mesurer factures/avoirs, justificatifs financiers, imports/exports, HEIC et les autres lignes non mesurées. Préserver les originaux signés/probants; conversion locale réutilisable à étudier sans perdre la vérification de l'original.
5. Progression réelle d'envoi en octets et reprise inter-rechargement ne sont pas universellement livrées : progression par nombre de fichiers sur les lots corrigés; reprise CRM dans la page prouvée.
6. Essais physiques téléphone Wi-Fi/cellulaire avec le mécanisme QR existant, sans nouveau login. Ce point ne bloque pas les autres travaux.

**Aucune publication générale autorisée ou exécutée. Aucun jeton, mot de passe, clé ni contenu client réel dans les preuves.**