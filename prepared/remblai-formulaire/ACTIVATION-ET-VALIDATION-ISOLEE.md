# Portail personnel — manifeste de préparation, NON ACTIVÉ

Date : 22 octobre 2026, session commencée à 22:34 UTC.

## Verdict et environnement

**BLOQUÉ pour la validation hébergée et la mise en service.** Aucun environnement complet distinct n’a été établi comme accessible sans coût.

Vérifications de cette session, lecture seule :
- La liste des surfaces contient le projet principal courant et le brouillon « Tests isolés dompe et remblai », prêt mais en retard. Ce nom et cet état ne prouvent pas l’indépendance de sa base, de ses identités ou de son stockage.
- Les métadonnées actuelles indiquent explicitement que les outils et le client du projet sont liés à **Live**, et non à un serveur de test.
- Le contrôle de santé montre base et identité joignables. Cette santé ne prouve aucune isolation.
- Les précédentes vérifications consignées dans `docs/audit/exec08-bilan.md` n’avaient trouvé ni serveur Test indépendant ni runtime conteneurs utilisable. Ces sondes de conteneurs n’ont pas été relancées ici.

Aucun brouillon créé, rafraîchi, accepté ou activé. Aucun export ni ressource créée. Aucun test métier, upload, envoi ou migration hébergés.

## Les deux fonctions de données

1. `public.exec01_projection(uuid,boolean)` : projection des réponses originales réellement stockées, ajout de `publicForm`, références photos canoniques et avertissement pour les précisions historiques irrécupérables. Pas de notes internes, jeton ou état de code dans la projection.
2. `public.exec01_dispatch(jsonb)` : autorisation du lien/dossier exact et de l’identité, projection lors de l’autorisation des photos, modification de la ligne verrouillée `submissions.id`, contrôle version/confirmation/rejeu. L’identifiant et le courriel propriétaire ne changent pas ; aucune nouvelle demande créée par l’édition.

Préparation actuelle : `prepared/remblai-formulaire/formulaire-NON-APPLIQUE.sql`. Ce prototype remplace des segments de définition et s’arrête sur une forme inattendue ou une seconde application. **Les empreintes complètes de la référence et de l’inverse restent à épingler ; ne pas appliquer ce fichier en production.**

Les fonctions `exec01_dispatch_mail`, `exec01_photo_manage`, `exec01_quota` et `has_role` sont des dépendances existantes, pas des fonctions autorisées à modifier par ce lot. Vérifier leur présence et leur contrat sur la cible isolée ; ne pas réinstaller des migrations historiques par défaut.

## Compatibilité des anciennes demandes

- Description inchangée : conservation exacte. Sans marqueur fiable de notes : champ signalé indisponible et non éditable ; aucune extraction inventée ni réparation automatique.
- Date/délai/camion historiques : conservés, non ajoutés aux sept étapes réception.
- Champs facultatifs absents : blancs, sans remplissage arbitraire. Champ obligatoire absent : l’utilisateur doit fournir une valeur valide, pas de valeur simulée.
- Photos accessibles : affichage par signature temporaire pour les références privées conformes. Signature impossible : avertissement, référence conservée.
- Photo privée hors convention ou hors dossier : refus ; pas de déplacement, rattachement ou suppression automatique. Une référence incohérente peut bloquer l’édition entière : décision humaine après vérification du dossier, jamais nettoyage global.
- Réponses détaillées de l’assistant non structurées : non reconstructibles ; le résumé historique reste conservé.
- Adresse changée : anciennes coordonnées invalidées ; processus de géocodage ultérieur encore à valider.

## Manifeste serveur exact à assembler en préparation

Ne rien copier dans les chemins actifs avant autorisation : ils peuvent se déployer automatiquement.

| Source de référence | Destination future sous `supabase/functions/` | Adaptation requise |
| --- | --- | --- |
| `supabase/functions/submission-owner-portal/index.ts` (lecture seule) | `submission-owner-portal/index.ts` | Conserver la logique actuelle des drapeaux, courrier atomique et `deliveryCapture`; ne pas la remplacer aveuglément par l’entrée préparée verrouillée/capture-only |
| `prepared/exec01b/endpoint.ts` | `_shared/exec01/endpoint.ts` | Imports locaux Deno vers `./lib/*.ts` et `./original-form-photos.ts`; Zod via `npm:zod@3.25.76` |
| `prepared/remblai-formulaire/photos.ts` | `_shared/exec01/original-form-photos.ts` | Import vers `./photos.ts` |
| `prepared/exec01b/photos.ts` | `_shared/exec01/photos.ts` | Imports Deno autonomes, contrat privé conservé |
| `src/lib/remblai/public-form.ts` | `_shared/exec01/lib/public-form.ts` | Enlever toute dépendance de type `@/` au paquet ; conserver les quatre catégories exactes de photos |
| `src/lib/remblai/service.ts` | `_shared/exec01/lib/service.ts` | Imports locaux avec `.ts` |
| `src/lib/remblai/conditions.ts` | `_shared/exec01/lib/conditions.ts` | Zod via `npm:` |
| `src/lib/remblai/cloud-contract.ts` | `_shared/exec01/lib/cloud-contract.ts` | Résoudre les types générés dans le paquet ou préparer un contrat serveur équivalent vérifié ; aucun import à `src/integrations/` |

Conserver sans remplacement les dépendances actives `_shared/exec01/photo-cleanup.ts` et `_shared/exec01/delivery-mode.ts`, sauf défaut prouvé dans le périmètre. `prepared/exec01b/owner-edge-entry.ts` est une référence d’essai désactivée, **pas un remplacement prêt de l’entrée actuelle**. `prepared/exec01b/package.ts` vise d’autres dépendances et ne certifie pas ce manifeste.

Le paquet autonome TypeScript final et son contrôle de types Deno ne sont pas encore livrés ni validés. Le bundle JavaScript antérieur est un contrôle d’assemblage seulement. Une version prête nécessite les imports ci-dessus entièrement résolus et les empreintes du paquet de référence.

## Préparer l’environnement distinct — prérequis avant tout test

Il manque une cible explicitement désignée par le propriétaire, accessible, indépendante de Live : base, identité, API de données, stockage privé, fonctions et capture courrier. Option sans ressource Cloud nouvelle : ordinateur ou CI déjà disponible avec runtime conteneurs, mais son accès n’est pas fourni. Une cible hébergée déjà disponible doit fournir une preuve d’identité distincte et un coût autorisé ou nul confirmé.

Ne pas copier de données réelles. Utiliser uniquement un jeu fictif A/B, deux liens séparés, des adresses réservées et des photos artificielles. Désactiver tous les courriers externes, SMS, workers et tâches automatiques ; capture interne uniquement. Le droit de préparer cet environnement n’annule pas l’interdiction actuelle de migration ou de modification de permissions : autorisation distincte indispensable si l’initialisation l’exige.

## Protocole hébergé isolé NON EXÉCUTÉ

| Cas | Action sur les dossiers fictifs | Critère de réussite |
| --- | --- | --- |
| Première ouverture | Ouvrir lien A, demander code capturé, vérifier | Aucune donnée avant vérification ; seul dossier A chargé ensuite |
| Persistance | Modifier un champ, confirmer, fermer puis rouvrir | Même identifiant, version augmentée, valeur relue par serveur ; B et champs protégés inchangés |
| Facultatifs/historique | Charger blancs, description sans marqueur, anciennes photos | Aucun champ inventé ; description identique ; avertissement photo plutôt que suppression |
| Photos | Ajouter JPEG/PNG/WebP fictif, signer puis rouvrir | Objet privé lié à A, signature courte, référence canonique conservée ; jamais accès B |
| Refus | Secret modifié, lien révoqué, identifiant B avec lien A, identité périmée | Refus sans données privées ni mutation |
| Erreur avant écriture | Provoquer refus validation ou erreur contrôlée | Aucune confirmation, aucune donnée écrasée |
| Erreur après commit | Perdre réponse puis réessayer même opération | Même résultat/dossier, un seul événement ; aucun nouveau dossier |
| Version concurrente | Modifier depuis deux sessions | Ancienne version refusée, saisie conservée, pas d’écrasement silencieux |
| Stockage indisponible | Échec upload/signature et reprise | Échec honnête ; objet éventuellement orphelin privé soumis au mécanisme existant, pas de balayage automatique |
| Retour arrière | Sur cible isolée autorisée uniquement | Deux définitions originales et paquet restaurés exactement ; données fictives conservées |

Toute fuite interclient, fausse confirmation, mutation protégée, perte de description ou courrier externe impose l’arrêt immédiat. Ne jamais provoquer ces erreurs sur Live.

## Plan d’activation conditionnel et retour arrière

1. **Préparation seulement** : achever le paquet autonome et vérifier les types Deno ; obtenir références exactes des deux fonctions, empreintes avant/après et inverse complet. Arrêt si référence inconnue ou permission plus large.
2. **Validation distincte autorisée** : vérifier les contrats existants, les types/colonnes requis et le stockage ; exécuter le protocole ci-dessus. Si une initialisation exige SQL/permissions, demander autorisation avant. Aucun passage à Live sans résultats enregistrés.
3. **Point de contrôle humain** : confirmer sauvegarde antérieure et stratégie de retour ciblé ; l’inventaire n’est pas accessible aux outils et les fichiers de stockage ne sont pas couverts par la sauvegarde de base. Aucune sauvegarde/export/restauration effectué ici.
4. **Après autorisation production séparée** : appliquer uniquement le paquet SQL épinglé des deux fonctions. Vérifier leurs définitions et droits, sans créer de dossier réel. Aucun ajout de table/index/colonne prévu. Si le contrôle échoue, arrêter avant déploiement.
5. **Après autorisation de déploiement** : copier le manifeste serveur validé puis déployer `submission-owner-portal` et ses dépendances. Vérifier CORS, origine autorisée, en-tête de passerelle fiable, drapeaux et absence de dépendance manquante ; ne pas basculer le transport du courrier vers capture-only en production.
6. **Après autorisation de publication** : publier uniquement la version d’interface approuvée ; vérifier que la publication ne comprend pas d’autres modifications non approuvées du site. Aucun titre SEO modifié par ce lot.
7. **Essai réel séparément autorisé** : une seule demande dédiée et courrier/apparareil réels. Jamais fusion ni nettoyage des demandes clients ; toute suppression TEST doit être autorisée et limitée à l’identifiant exact.

Retour arrière ciblé : remettre le paquet précédent exact et, si nécessaire après autorisation, réexécuter uniquement les deux définitions originales épinglées ; comparer définition, signature et droits. Ne pas remettre un ancien `exec01_dispatch` qui annulerait un correctif durable installé entre-temps. Pas de restauration complète, suppression de colonne, RLS, permission ou demande. L’inverse complet prêt-production reste un prérequis non fourni, et non un fichier testé en hébergement.

## Preuves disponibles et limites

Session précédente : 66 tests locaux réussis, 0 échec final, 24 ignorés ; trois tailles d’écran fictives vérifiées. Les journaux locaux ont été relus ici, **aucun de ces tests n’a été réexécuté dans cette session**. Aucun test hébergé ni réel effectué. Pas de nouvelle simulation créée pour remplacer la validation hébergée manquante.

Cette session modifie seulement ce document, `RAPPORT.md` et `roadmap.md`. Les adaptations fonctionnelles existantes sont conservées en préparation et en aperçu. Aucun changement de production, migration, permission, CRM, SEO, publication ou courrier réel.