# Parcours hébergé isolé — protocole non exécuté

## Disponibilité

Environnement PostgreSQL local disponible confirmé à `127.0.0.1:55439`, données sous `/tmp/exec-correctifs/pgdata`. Il n’est pas une stack hébergée complète.
Aucun environnement hébergé réellement distinct identifié dans les moyens examinés. L’aperçu et le site publié partagent le service actif : l’aperçu n’est PAS un environnement d’essai hébergé sûr. Aucun environnement créé, aucun catalogue distant interrogé, aucun abonnement souscrit. L’absence d’identification n’atteste pas qu’aucun environnement n’existe ailleurs.

## Conditions GO / NO-GO avant toute opération

1. Fournir la preuve d’un service séparé : origine web TEST, base, Auth, stockage, fonctions, file et journaux distincts; ne pas copier les données de production.
2. Autoriser séparément toute création, coût, installation SQL ou déploiement TEST. Aucun SQL à lancer aujourd’hui, même hébergé isolé.
3. Dossiers et comptes fictifs, administrateur TEST, deux demandes indépendantes; aucune adresse ni photo réelle de client.
4. Transport courrier désactivé par défaut. D’abord capture locale uniquement; ensuite autorisation explicite d’envoi à une boîte Outlook dédiée, liste de destinataires fermée, aucun SMS, marketing, rappel ou tâche périodique non indispensable.
5. Utiliser une boîte de test autorisée réelle pour la réception : les adresses `.invalid` sont réservées à la capture et restent interdites d’envoi. Ne pas supprimer globalement la garde des adresses fictives.
6. Environnement et URL confirmés avant chaque scénario; bloquer les appels au service actif. Prévoir nettoyage TEST ciblé autorisé, jamais suppression globale.
7. Logs sans corps de requête, paramètres, secrets, codes, hash sensibles, cookies, liens personnels ou URL signées. Désactiver traces/HAR/vidéos/captures qui contiendraient les secrets; ne pas copier des journaux bruts dans le rapport.
8. Vrai iPhone, Outlook, Safari et ordinateur disponibles. Chromium mobile ne remplace pas ces appareils. Date UTC et fuseau Toronto relevés pour les preuves temporelles.

## Matrice d’essais à exécuter seulement après autorisation

| Cas | Manipulation TEST | Critère observable |
|---|---|---|
| Renouvellement | Lien expiré, jamais vérifié, contact inchangé; demander un nouveau lien | Une seule nouvelle entrée et un message pour le destinataire enregistré; aucun accès privé avant code |
| Réception | Recevoir dans Outlook dédié et ouvrir sur iPhone | Texte lisible, accès à la vérification; aucun suivi public; fragment retiré rapidement sans fuite aux requêtes externes |
| Erreurs 0/1/4/5/6 | Code neuf; erreurs contrôlées sur dossiers fictifs distincts | Avant cinq : bon code accepté; cinquième : attente 900 secondes, code consommé; sixième : même échéance |
| Attente réelle | Observer juste avant échéance puis après 15 min depuis cinquième erreur, sans modifier l’horloge ou la base | Avant : code/verify/renew refusés; après : ancien code inutilisable, nouveau code nécessaire |
| Nouveau code | Demander et recevoir un code après délai | Nouveau code accepté; compteurs remis à zéro, aucun ancien code réutilisable |
| Liens révoqués | Nouveau lien puis ancien lien, y compris après délai | Ancien read/code/verify/renew/action/photo refusé, aucun dossier privé affiché |
| Isolation | Deux demandes même courriel et une autre identité; croiser identifiants/liens | Une demande par lien, croisement refusé; adresse modifiée refusée |
| Consultation | Jamais vérifié puis contact déjà vérifié | Premier cas inaccessible avant code; second accessible uniquement au dossier du lien valide, sans droits d’action supplémentaires |
| Actions sensibles | Modifier, confirmer, pause, reprise, fermer; sans confirmation, sans code, code ancien de plus de 10 min, code autre lien | Refus dans les cas non autorisés; réussite avec code récent du même lien et confirmation; même dossier CRM, historique unique |
| Fréquence | Liens à moins de 60 s, sixième sur 24 h; code renvoyé trop tôt; quota réseau | Limites maintenues; quota réseau effectivement raccordé (30/min local ne prouve pas le raccordement hébergé) |
| Double clic | Deux renew simultanés; deux act avec même clé puis payload différent | Un nouveau lien/courriel; action rejouée sans second événement, payload différent refusé |
| Panne et reprise | Couper avant serveur puis après commit avant réponse, reprendre même opération | Saisies conservées, lecture du résultat, pas de second dossier/événement; pas de fausse promesse « non enregistré » |
| Livraison désordonnée | Deux renew espacés autorisés, retarder le premier courriel | Seul le lien généré le plus récemment fonctionne; ordre de réception différent identifié comme risque |
| Confidentialité | Examiner navigateur, passerelle, fonctions, courrier/file et logs DB dans TEST | Aucun code/jeton dans logs/erreurs/réponses publiques; exceptions attendues : code et lien dans le courriel privé, données sensibles dans corps HTTPS vers endpoint autorisé |
| Photos | Accès anonyme/ancien lien/demande croisée puis accès valide | Refus hors autorisation; références privées inchangées, URL signée temporaire seulement pour autorisé |

Le SQL interne peut retourner le contact au transport courrier : vérifier que la réponse HTTP publique ne l’expose pas. Un lien personnel contient nécessairement son secret dans le fragment initial et un courriel de code contient nécessairement le code; « aucune fuite » ne signifie pas « aucun secret n’existe ». Contrôler aussi l’absence de stockage persistant, traceurs, referer et copie de l’URL dans les outils de support.

## Risque de renouvellements répétés

Chaque renouvellement accepté révoque les liens précédents de cette demande. Une rafale est freinée par une/minute et cinq/24 h; un ancien lien révoqué ne peut plus renouveler. Un second renouvellement depuis le nouveau lien peut néanmoins invalider celui que la personne est en train d’ouvrir; un courriel livré en retard peut sembler le plus récent dans la boîte.
Protections proposées, non activées : avertissement avant renouvellement, bouton occupé durant la requête, réutilisation de la clé d’opération après réponse perdue, capture atomique lien/courrier conservée, et étude d’une déduplication de renouvellement en cours dans la file existante. Vérifier réellement le quota de passerelle. Toute modification serveur/file exige sa propre revue et autorisation; ne pas laisser d’anciens liens actifs pour résoudre ce problème.

## Autorisations séparées

- Identification d’un environnement existant : vérification non destructive seulement; aucune création implicite.
- Création/souscription/coût : accord explicite avec montant et portée.
- Installation SQL, permissions, fonctions, déploiement ou publication TEST : accord explicite limité à l’environnement confirmé.
- Création de fixtures hébergées et nettoyage : accord explicite sur dossiers fictifs et périmètre.
- Envoi Outlook : accord explicite sur boîte, scénarios et nombre maximal; aucun autre destinataire.
- Toute production, sauvegarde, export, restauration ou retour arrière : autorisation séparée, jamais déduite d’un accord TEST.