# Staging isolé et sauvegardes — PRÉPARATION SEULEMENT

> Ce document n'autorise rien. Aucun environnement n'a été créé, aucune sauvegarde ni restauration n'a été lancée, aucun coût engagé.

## 1. Constat actuel (vérifié)
- L'aperçu et le site publié utilisent **le même backend** (même base, mêmes fonctions serveur, mêmes secrets). L'aperçu n'est donc **pas** un staging.
- Selon la documentation de la plateforme, les changements de fonctions serveur et de migrations s'appliquent au backend sélectionné sans passer par « Publier ». Avant toute modification de fonction, vérifier qu'aucun déploiement automatique ne touche la production (voir § 6).

## 2. Options de staging
| Option | Isolation base | Fonctions / secrets | Coût | Remarque |
|---|---|---|---|---|
| A. Projet Supabase séparé appartenant au propriétaire, restauré depuis un export | Totale | Séparés ; à redéployer et reconfigurer | Abonnement Supabase du propriétaire (gratuit ou payant selon la taille) | Seule option documentée pour une restauration isolée |
| B. Copie (« remix ») du projet Lovable | Nouvelle base, **schéma et fonctions copiés, aucune donnée** | Nouveaux secrets à saisir | Consommation Cloud du nouvel espace (crédits) | Données fictives à créer ; pas un clone |
| C. Environnements Test / Live de Lovable Cloud (si offerts au projet) | Base Test séparée | À confirmer | À confirmer | Non vérifié pour ce projet |
| D. PostgreSQL local jetable (déjà utilisé) | Totale | Aucune fonction hébergée | Aucun | Prouve le SQL et la concurrence, **pas** les fonctions hébergées ni Mailchimp/Resend |

Recommandation : B pour les fonctions hébergées avec données fictives ; A seulement si un test de restauration de données réelles est exigé.

## 3. Reproduire le schéma
1. Créer l'environnement (B : remix ; A : nouveau projet + restauration de l'export).
2. Appliquer dans l'ordre : migrations existantes de `supabase/migrations/`, puis `migration-anti-doublon-transactionnel-NON-APPLIQUEE.sql`, puis `migration-resserrement-grants-anon-NON-APPLIQUEE.sql`.
3. Lancer `inventaire-privileges-LECTURE-SEULE.sql` et comparer avec l'inventaire de production.

## 4. Variables et secrets (noms seulement, jamais les valeurs)
`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (fournies par l'environnement), `RESEND_API_KEY`, `LOVABLE_API_KEY`, `GOOGLE_MAPS_API_KEY` (ou équivalent), `MAILCHIMP_WEBHOOK_SECRET`, `MAILCHIMP_*`, secrets push/VAPID. En staging : **clés de test distinctes** ou absentes.

## 5. Neutraliser les envois réels
- Ne pas définir `RESEND_API_KEY` (ou clé de test) ; `admin_notification_email` = adresse `@exemple.invalid` (bloquée par la garde existante des adresses réservées).
- Toutes les données fictives utilisent `@exemple.invalid` / `.test`.
- Ne pas configurer de webhook Mailchimp vers le staging ; tester avec des appels HTTP simulés.
- Aucune clé VAPID/SMS ; supprimer les abonnements push copiés.
- Désactiver les tâches planifiées (`crm_notifications_sweep`, `asr_sweep`, etc.) ou les rediriger vers un journal.

## 6. Prouver que le staging ne peut pas écrire en production
- Comparer l'identifiant du projet dans `SUPABASE_URL` (staging ≠ production) — sans afficher de secret.
- Écrire une ligne témoin en staging et vérifier en **lecture seule** qu'elle n'apparaît pas en production.
- Vérifier que le frontend de staging pointe vers l'URL de staging.
- Vérifier qu'aucune fonction de staging ne contient l'URL de production en dur (`rg vracquebec|kenduhx supabase/functions`).

## 7. Création / suppression
Création : remix ou nouveau projet → secrets de test → migrations → données fictives → contrôles § 6.
Suppression : supprimer le projet de staging et révoquer ses clés de test ; aucune action sur la production.

## 8. Tests restant à faire en staging
- Fonctions hébergées `submit-parcours` et `quote-submit` : 2 et 5 envois simultanés, échec puis reprise, doublon → référence exacte, absence de second courriel.
- Courriels client/interne en échec réel (clé invalide) après enregistrement.
- Mode de secours : fonctions `guard_*` absentes.
- Migration des permissions : parcours publics (questionnaire, catalogue, blogue, dompes) sans erreur « permission refusée » ; restauration exacte.
- `mailchimp-webhook` : secret invalide → 401, rejeu idempotent, erreur base → 500.

## 9. Sauvegarde avant toute opération de production
Faits de la plateforme : une sauvegarde automatique quotidienne de la base (schéma + données), conservée environ 14 jours ; **pas** de retour à un instant précis ; fichiers de stockage **non inclus**.

Procédure (faite par le propriétaire) :
1. Ouvrir **Plus → Base de données → Gérer → Sauvegardes** et noter l'horodatage UTC le plus récent (seule preuve valable de son existence).
2. Faire un export complet : **Plus → Base de données → Gérer → Paramètres → Exporter les données → Base de données → Exporter**. Limites : 15 Go de base, 5 Go d'export, un export par 24 h. Conserver le fichier et noter sa date, sa taille et son empreinte (SHA-256).
3. Télécharger séparément les fichiers de stockage (**Plus → Stockage**).
4. Noter l'état des permissions (instantané ACL créé par la migration dans `acl_backup_20261016`).

Intégrité : une sauvegarde n'est **vérifiée** qu'après restauration réussie dans un environnement isolé (option A), avec comptage des lignes des tables clés (`submissions`, `transport_requests`, `jsc_quotes`, `jsc_requests`, `seo_pages`) et connexion d'un compte test.

Restauration en production (dernier recours, irréversible) : bouton **Restaurer cette sauvegarde** ; les données écrites après l'instantané sont perdues, le schéma revient en arrière, la base est indisponible quelques minutes. Exporter d'abord l'état courant.

Non couverts par la sauvegarde ni l'export : code des fonctions serveur (récupérable par l'historique du projet), secrets, réglages d'authentification et fournisseurs, réglages Mailchimp/Resend, tâches planifiées. À documenter manuellement avant toute opération.

**État actuel : aucune sauvegarde n'a été consultée ni vérifiée par moi ; aucune restauration testée.**
