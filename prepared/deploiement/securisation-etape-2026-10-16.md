# Étape de sécurisation — 16 oct. 2026 (préparation seulement)

## 1. État de la production
- La documentation de la plateforme indique que les fonctions serveur gérées **se déploient automatiquement** quand leur code change. Les fichiers `submit-parcours`, `quote-submit`, `mailchimp-webhook` et `_shared/public-guard.ts` ont été modifiés : il est **probable** qu'ils tournent déjà en production.
- Preuves cherchées : journaux de `quote-submit`, `submit-parcours`, `mailchimp-webhook` → aucun (aucun trafic dans la période conservée). Aucune version déployée consultable. **État : NON VÉRIFIÉ.**
- Fait vérifié (lecture seule) : les fonctions SQL `guard_claim/guard_complete/guard_release/guard_check_and_log` **n'existent pas** en production. Si le nouveau code tourne, il fonctionne en **mode de secours non atomique** (journal `guard.fallback_active`, raison `migration_absente`) — comportement testé (tests 11/12), mais sans protection contre deux envois parfaitement simultanés.
- Le changement de l'écran d'achat (aucun succès sans numéro) est dans l'aperçu ; le site publié ne l'a pas.
- Moyen de vérifier sans écrire : à la prochaine vraie demande, chercher `guard.fallback_active` dans les journaux de la fonction (présent = nouveau code).

## 2. Environnement isolé recommandé
Copie (« remix ») du projet : nouvelle base vide, fonctions copiées, aucun secret ni donnée copiés. Coût : consommation Cloud de la copie en crédits (montant **inconnu**, dépend de l'usage ; allocation Cloud gratuite de 20 crédits/mois par espace). Risque principal : une URL de production codée en dur dans une fonction → contrôle `rg` avant tout test. Détails et preuves d'isolation : `staging-et-sauvegardes-2026-10-16.md` § 5–6.

## 3. Fonctions anonymes
Inventaire : `inventaire-fonctions-anon-2026-10-16.csv` (194 lignes). Lecture : classement assisté par script sur le code complet de chaque fonction + droits réels + usage par les politiques RLS + appelants dans le code ; **relecture manuelle intégrale de 12 fonctions** seulement.
Décisions proposées : 38 public nécessaire (dont 27 utilisées par des politiques RLS), 3 à corriger, 125 à restreindre (dont 49 fonctions de déclencheur, sans effet), 28 à examiner davantage.
Constat clé : 169 fonctions sont accessibles via PUBLIC ; révoquer `anon` seul ne retire rien. Proposition : `proposition-restriction-fonctions-anon-NON-APPLIQUEE.sql`.

## 4. Preuves à recueillir avant toute migration
1. Horodatage UTC de la dernière sauvegarde automatique (écran Sauvegardes) — capture.
2. Export complet téléchargé + SHA-256 + taille + date.
3. Sortie de `inventaire-privileges-LECTURE-SEULE.sql` (ACL avant).
4. Comptes de lignes : submissions, transport_requests, jsc_requests, jsc_quotes, seo_pages, public_request_guard.
5. Compteur transport_request_number_counter (attendu ≥ 54).
6. Test de restauration de l'export dans l'environnement isolé, mêmes comptes de lignes.
Sans 1, 2 et 6 : sauvegarde **non vérifiée** → ne pas migrer.

## 5. Doublons résiduels
Réservation « en cours » : 120 s (remblai), 180 s (achat de vrac). Au-delà, une réservation sans issue est considérée « périmée » et une nouvelle tentative est acceptée.
- Cas A — instance arrêtée **après** l'enregistrement mais **avant** la confirmation : la demande existe, la réservation reste « en cours ». Remblai : la reprise cherche la demande (courriel + adresse + sens + quantité, un seul résultat exact) et la renvoie. **Achat de vrac : aucune recherche → seconde demande créée.**
- Cas B — création plus lente que la fenêtre (géocodage/moteur bloqués > 2–3 min) : une reprise pendant ce temps crée un doublon dans les deux parcours.
- Cas C — recherche du remblai ambiguë (2 résultats) ou en erreur → doublon possible.
Correction proposée (non appliquée, exige une migration) : ajouter une colonne `guard_claim_id uuid` (nullable, indexée) à `submissions` et `jsc_requests`, écrite dans la même insertion ; la reprise d'une réservation périmée recherche la ligne par **cet identifiant exact** au lieu de critères métier. Complément : rafraîchir la réservation (« battement ») pendant les étapes lentes, ou porter la fenêtre à 10 min. Test : base jetable — réserver, insérer avec `guard_claim_id`, ne pas confirmer, vieillir de 4 min, reprendre → attendu « doublon » avec la même référence.
