# R4B — opérations de mise en service, NON exécutées

## Ce que couvre R4B
Composition entre édition d’un dossier, réquisitions et accords EXEC-02 : persistance transactionnelle, contrôle des acteurs, concurrence, version/rejeu, historique, notifications applicatives et invalidation des accords affectés. Une édition ne doit pas laisser une ancienne acceptation utilisable ou une capacité réservée silencieusement. Ce lot ne livre pas un serveur Auth/Storage indépendant ni des invitations chauffeurs nouvelles.

## Réalisé dans cette reprise
- Sauvegardes et relectures sur PostgreSQL local; tables de réservations et fonction d’exception extraites **sans réécriture** de `prepared/exec01b/coordination.sql`.
- Réservations pending/reserved/counter affectées → exception, snapshots archivés dans accepted_history; nouvelle proposition explicite requise. Mesures/débits/remaining non réécrits. L’état exception ne peut être accepté ou livré directement.
- Test dans une même base de `exec02_dispatch` complet + nouvelle édition, y compris acceptation propriétaire concurrente; aucun ancien accord encore réservé après édition.
- `request_update_versioned` compose `request_update` existant : ID inchangé, version optimiste même sur notes, résultat rejoué, notification unique. Ancien appel bloqué pour les champs d’une nouvelle réquisition liée afin de ne pas contourner la revalidation.
- Camion actif relu avant transmission/acceptation/départ; notifications admin pour transitions; ancien chauffeur informé lors de réaffectation. Réaffectation après incident retourne à revalidation et exige retransmission/acceptation, jamais reprise implicite.
- Présentation : choix d’entreprise via catalogue existant; confirmation d’édition transport seulement après relecture des valeurs attendues; double clic gardé. Toujours `REQUEST_WORKBENCH_INSTALLED=false`.

## « Fixed admin role check » — précision
Le libellé exact n’a pas été retrouvé dans les fichiers ou le diff accessible : aucune attribution historique à un défaut serveur ne peut être certifiée. Le refus SEO du compte entrepreneur était et reste attendu.

**Défaut effectivement corrigé maintenant** : `useUserRoles` lisait seulement `role`, sans `approved`, et pouvait rétablir `admin` depuis sessionStorage après erreur réseau. Il lit désormais `role,approved`, conserve seulement approved=true et ne restaure jamais admin depuis le cache. C’est une correction des indications de navigation, pas une attribution de droits. Les accès réels restent décidés serveur.

Lecture hébergée du 23 octobre 18:24 UTC : `has_role` exige role exact + approved=true; `trq_actor_role` utilise has_role puis le `user_id` propriétaire; rapport SEO exige admin. Empreintes lues inchangées : has_role `6e055322eaad390f6c2c3ef45fec6857`, request_update `505b20c3f2bf83127488f20de466dcf6`, helper chauffeur `0a2c44196ce3066892e94e223a22d165`. Aucun remplacement en hébergé.

## Session administrateur autorisée
La session de la reprise précédente était entrepreneur; aucune session admin approuvée n’est disponible/établie pour cet essai. Action exacte : un utilisateur **déjà admin approuvé** se connecte dans l’aperçu, puis demande la vérification; ou le demandeur désigne ce compte existant pour la création nominative d’une session de test avec approbation. Ni mot de passe/jeton à transmettre ni changement de rôle.

Contrôle préparé : session normale → `/admin/seo` → rapport Québec/Lévis/nouvelle ville en lecture seulement; vérifier requête aboutie, catalogue/pertinence séparés, zéro génération/publication. Vérifier en parallèle qu’entrepreneur et admin non approuvé restent refusés. Dans la cible indépendante, ouvrir même dossier avec admin/entreprise A/chauffeur/B, modifier puis relire historique et notification exacte.

## Autorisations
**Déjà autorisé et exécuté** : développement, préparation SQL, SELECT hébergés, cluster fictif local, capture interne sans fournisseur. Les autorisations EXEC-01 antérieures ne sont pas redemandées et ne s’étendent pas à EXEC-02/réquisitions.

**Nouvelle autorisation nécessaire, non demandée prématurément** : installation des changements R3/R4/R4B sur serveur partagé; installation/activation EXEC-02 distincte; correction helper chauffeur existant; modification du flag dans version publiée. Publication générale, messages réels, GPS réel et achats restent exclus.

## Ordre exact proposé (après validation préalable et autorisation)
1. Vérifier cible et sauvegarde, schéma complet, empreintes/functions/triggers/grants/permissions effectives. Comparer journal 0225–0230; **ne jamais les rejouer**. Garder flag false. Pas de backfill d’entreprise.
2. Vérifier présence de EXEC-02 exact (reservations, accepted_history, exec02_exception, mesures/débits et worker). S’il manque, **arrêt** : `prepared/exec01b/coordination.sql` et `lifecycle.sql` sont des dépendances préparées, pas des migrations prêtes à rejouer sur schéma existant. Leur installation exige composition et autorisation propres; cette reprise ne les active pas.
3. Migration additive `r4b_reservation_composition`, contenu exact `prepared/reprise-r3-r4/R4B-COMPOSITION-NON-APPLIQUEE.sql`. Création helper service-only. Le helper est appelé seulement par fonctions protégées; pas accessible aux sessions.
4. Migration additive `r3_r4_request_workbench`, contenu exact `prepared/reprise-r3-r4/INSTALLATION-NON-APPLIQUEE.sql`. Colonnes nullable/default, index opération, RPC/restrictions/triggers. **Application une fois seulement**, CREATE FUNCTION/trigger non idempotents; vérifier leur absence avant soumission. L’association de dossier est une action admin unitaire motivée, pas une migration de données.
5. Migration additive `r4b_transport_versioned`, contenu exact `prepared/reprise-r3-r4/R4B-TRANSPORT-NON-APPLIQUE.sql`. Nouveau wrapper et garde legacy; `request_update` original non remplacé.
6. Correction indépendante `driver_revocation_guard`, contenu exact `REVOCATION-CHAUFFEUR-NON-APPLIQUEE.sql`, seulement si empreinte et droits correspondent. Effet immédiat : profils inactifs/membres révoqués perdent les anciennes lectures basées sur ce helper. Vérifier aussi `jsc_driver_portal`/autres accès qui pourraient le contourner; l’inverse n’est pas autorisé automatiquement puisqu’il réintroduit le défaut.
7. Aucune fonction Edge nouvelle dans R4B; pas de secret, OAuth, cron, fournisseur, configuration de courriel ou worker changés. Dépendances existantes uniquement. RPCs sont installées via migration, aucune copie dans `supabase/functions`.
8. Vraies sessions fictives autorisées, messages forcés capture-only, test complet et révocation; relecture via API et écrans. Si succès, autorisation distincte pour flag true/version publique; aucune activation par URL/localStorage. Aucun test compte réel de propriétaire ou chauffeur.

## Effets sur l’existant et limites d’installation
- Pas nouvelles tables CRM, pas URL/numéro modifiés, pas historique importé ou effacé.
- Les lignes sans edit_company_id restent refusées. Le rôle entreprise est JSC; son articulation avec `entcrm_can_write` et les memberships entrepreneurs doit être validée dans le schéma complet, pas inférée d’un nom d’entreprise.
- La nouvelle garde n’affecte les anciens dossiers sans réquisition que lorsqu’ils commencent à utiliser le nouveau service. Une ancienne interface ne peut modifier silencieusement une réquisition liée.
- SELECT hébergés n’ont pas certifié un environnement complet indépendant. Le cluster utilisé reproduit JWT/roles SQL et contient les fonctions métier préparées, pas une vraie Auth/PostgREST/Storage ni tous les triggers publics. L’absence de cette cible et de session admin bloque la validation finale, pas les tests exécutés.
- Invitation existante identifiée sous `pun_invite_prepare/accept` (EXEC-06); elle ne crée pas à elle seule un profil `jsc_drivers` ni membership JSC. Ne pas l’activer ou la détourner pour prétendre accès chauffeur livré. Raccordement identité/invitation restant à développer et tester séparément avec ses règles.

## Retour arrière non destructif
1. Flag false/version d’aperçu précédente; aucun retrait des lignes/historiques/mesures.
2. Contenu `RETOUR-NON-APPLIQUE.sql` : révoque les seuls nouveaux RPCs publics, y compris request_update_versioned. Les guards restent pour empêcher une ancienne interface de modifier les accords; l’admin doit traiter les nouvelles réquisitions via chemin explicitement validé, sinon rester en maintenance de ce périmètre.
3. Aucun DROP de colonnes/table/triggers ni restauration globale; garder les données additives pour une reprise compatible.
4. Helper chauffeur : fichier `REVOCATION-RETOUR-NON-APPLIQUE.sql` historique **non prêt à exécuter** (garde textuelle trop large, empreinte finale et ACL à épingler). Revenir à une fonction vulnérable n’est pas une correction sûre; maintenir la fermeture du parcours concerné si problème plutôt que rouvrir accès révoqué. Aucune opération inverse hébergée exécutée.

## Prochain sous-lot exact
R4C : raccordement des invitations personnelles/profils JSC à l’entreprise, validation réelle Auth/PostgREST/Storage et examen de tous les chemins chauffeur; générer manifeste d’installation épinglé sur schéma complet et rollback testé. R5 : communications/hiver/partenaires capture-only puis formation Jonathan; ordre détaillé au registre.