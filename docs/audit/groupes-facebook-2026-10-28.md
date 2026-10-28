# Groupes Facebook — répertoire et suivi des publications (2026-10-28)

Mandat : partie 1 du document « VRAC QUÉBEC — GROUPES FACEBOOK ET SUIVI DES PUBLICATIONS »
(relevé des 54 captures de Cassandra, 28 octobre 2026) + import du répertoire de la partie 3.

## Installé et testé

### Base (migration 0250_fb_groups_directory)
- `fb_groups` : fiches provisoires, `source_id` (GF…) unique = clé d'import anti-doublon,
  nom affiché tel que lu, note de transcription séparée, captures sources, lien Facebook
  (vide tant que non vérifié), région/villes/catégorie/langue, règles de publicité
  (« À vérifier » par défaut), jours autorisés, intervalle minimal, compte membre,
  notes internes, état actif/en pause/à vérifier, badge « Nom à compléter », fusion
  manuelle (`merged_into`), archivage sans perte.
- `fb_campaigns` : campagnes avec contenu, délai minimal configurable (présenté comme
  choix de configuration, jamais comme règle de Facebook), cycle courant.
- `fb_campaign_groups` : sélection par campagne, exclusion avec motif.
- `fb_publications` : journal complet (campagne, cycle, contenu, responsable, compte,
  dates prévue/soumission/publication, date réelle du post distincte de la date d'action,
  lien du post, statut, notes). Statuts : À préparer / Planifié / Soumis en attente /
  Publié / Refusé / Retiré / Annulé.
- `fb_assignments` : attribution persistante par groupe/campagne/cycle (anti-conflit
  entre administrateurs).
- `fb_group_events` : journal des modifications (qui a modifié quoi).
- RLS : toutes les tables réservées au rôle admin plateforme via `has_role(auth.uid(),'admin')`.
  Vérifié côté serveur : lecture anonyme → liste vide ; écriture anonyme → refusée (42501).

### Import (partie 3)
- 580 fiches importées (GF0001–GF0580), 26 notes de transcription (repères de vignettes),
  7 badges « Nom à compléter » ([nom tronqué] / [fin à confirmer]).
- Relance de l'import vérifiée : 0 doublon (ON CONFLICT source_id DO NOTHING).
- Aucune date de publication inventée à partir des mentions d'activité des groupes.
- Aucune fusion automatique : les homonymes avec repères distincts restent séparés.

### Interface (aperçu)
- Menu super admin : « Groupes Facebook » (Administration, ordinateur et mobile).
- Route `/admin/groupes-facebook`, réservée au rôle admin (garde côté page + RLS côté base).
- Quatre vues : Répertoire (recherche, filtres statut/région/catégorie, pagination 100,
  export CSV, ajout manuel), Prochains groupes (file de rotation), Publications
  (journal filtrable, export CSV, liste de suivi des refus/retraits), Campagnes
  (création avec délai configurable, sélection/exclusion des groupes).
- Fiche groupe : tous les champs du mandat, « Ouvrir le groupe » (lien vérifié seulement),
  « Rechercher ce nom sur Facebook » clairement distinct, actions rapides
  « Copier le texte » / « Marquer soumis » / « Confirmer publié » — ouvrir ou copier
  ne marque jamais rien; historique des modifications visible.
- Rotation : jamais tentés d'abord, puis plus ancienne tentative; soumissions en attente
  retirées de la file; règle du groupe prévaut sur la campagne; avertissement « Règles
  inconnues »; avertissement de répétition toutes campagnes confondues; refus/retraits
  comptent comme tentatives; bilan de cycle (sélectionnés/tentés/en attente/publiés/
  refusés/restants/groupes couverts distincts); nouveau cycle sans effacer les précédents.

## Vérifications
- 9 tests unitaires de rotation (vitest) : ordre de file, retrait des en-attente,
  exclusions, intervalle groupe>campagne, date autorisée, doublons inter-campagnes,
  statistiques de cycle. Tous réussis.
- Essais navigateur (compte fictif test-superadmin@test.invalid, aperçu local) :
  répertoire 580 fiches affiché; recherche GF0001; fiche ouverte; « Marquer soumis »
  puis « Confirmer publié » enregistrés; campagne fictive créée; 2 groupes sélectionnés;
  file affichée avec badges « Jamais tenté » et « Règles inconnues »; attribution
  « Prendre en charge » confirmée; journal des publications affiché.
- Données fictives d'essai retirées après les tests (aucune fausse publication conservée).
- Compilation : build OK.

## Limites et suites
- Aucun lien Facebook n'est fourni par le relevé : les 580 fiches affichent « À fournir »;
  l'identité des groupes reste à vérifier avec l'URL (bouton de recherche prévu).
- 7 noms à compléter (tronqués sur les captures) : texte visible conservé, suite non inventée.
- Les groupes hors secteur ou hors Québec sont conservés; exclusion par campagne avec motif.
- Pièces jointes et essai simultané : finalisés dans le lot ci-dessous.
- Aperçu seulement : aucune publication publique, aucun envoi vers Facebook.

## Finalisation — pièces jointes, concurrence et accès (28 octobre)

### Installations et changements
- Migration 0251 installée sur le serveur partagé : `fb_publication_files`, accès SELECT/INSERT réservés aux administrateurs plateforme approuvés; rattachement à la publication et journal d'ajout.
- Stockage existant `crm-docs` privé et ses politiques admin réutilisés sans élargissement. Chemin stable par publication/fichier; originaux conservés. Lecture authentifiée à chaque ouverture avec cache contourné; aucune nouvelle URL signée réutilisable.
- Interface d'aperçu : pièces dans la fiche et dans Publications; brouillon enregistrable, ajout multiple, état d'avancement par fichier, erreurs persistantes, reprise avec la même identité sans deuxième upload après un rattachement interrompu; aperçu image/PDF et téléchargement.
- PDF.js chargé à la demande, version compatible anciens navigateurs, une page dessinée localement depuis les octets autorisés. Un premier contrôle révélait un canvas blanc : corrigé et revérifié avec pixels noirs du texte fictif et capture. Les fichiers PDF ne sont ni compressés ni réécrits.
- RPC `fb_claim_group`/`fb_release_group` : identité issue de la session serveur, verrou transactionnel par groupe/campagne/cycle, attribution et événement atomiques. Un trigger refuse le remplacement direct d'une attribution et la libération par un autre responsable.

### Tests réellement exécutés
- Deux sessions d'administrateurs plateforme approuvés, clic simultané sur le même groupe TEST : un seul gagnant, conflit explicite pour l'autre, une attribution et un événement. Tentative directe d'écrasement refusée `42501`.
- Sessions entrepreneur TEST A et gestionnaire actif d'entreprise sans rôle plateforme admin : les sept tables du module renvoient des listes vides; sept tentatives INSERT par compte refusées `42501`; modification d'une fiche TEST ne retourne aucune ligne; les deux RPC refusées 403; lecture du fichier privé refusée. Pas de suppression testée sur le serveur partagé.
- Ajout réel de photo JPEG et PDF fictifs via l'écran, aperçu et téléchargement : PDF téléchargé strictement identique à l'original. Les 580 fiches GF importées sont conservées.
- Navigateurs Chromium simulant téléphone 390×844, iPad 820×1180 et ordinateur 1280×1800 : quatre onglets, fiche, dialogue Publications, photo, page PDF réellement dessinée et téléchargement identique; aucune largeur de page débordante. Ce n'est pas un essai physique Safari/iPadOS.
- 14 tests unitaires ciblés : neuf rotation, trois fichiers/reprise/originaux/session, deux attribution serveur/conflit/refus.
- Preuves temporaires sous `/tmp/browser/fb-final/` : scripts de concurrence, permissions, formats d'écran, captures, fichiers fictifs. Les sessions et identifiants secrets ne sont pas livrés ni consignés ici.

### Données TEST conservées et suites
- Groupe « TEST FB finalisation 28 octobre — ne pas publier », campagne « TEST FB finalisation — aucun envoi », brouillon non publié, fichiers fictifs, attribution et événements conservés; aucune suppression de ce lot.
- Liens Facebook vides : ne bloquent ni brouillon, ni pièces, ni attribution. Vérification des liens et sept noms tronqués reste un travail éditorial.
- Interface livrée dans l'aperçu seulement; migration ciblée installée, aucune publication du site ni sur Facebook. Aucun appel à Facebook ne publie du contenu.
- Essai physique téléphone/iPad (Safari, réseau réel) reste à réaliser. Avertissements React de refs sur Badge et fetchPriority préexistants visibles dans la console; aucune erreur bloquante observée dans les parcours testés.
