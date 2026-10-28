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
- Pièces jointes des publications : le champ contenu/référence est livré; le rattachement
  de fichiers au système existant reste à brancher si souhaité.
- Conflit temps réel entre deux administrateurs : l'attribution persistante et
  l'avertissement sont livrés; l'essai simultané à deux sessions n'a pas été exécuté.
- Aperçu seulement : aucune publication publique, aucun envoi vers Facebook.
