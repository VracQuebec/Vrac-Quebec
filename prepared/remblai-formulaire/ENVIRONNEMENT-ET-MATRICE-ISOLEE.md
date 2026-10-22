# Serveur, base, photos et notifications isolés — NON CRÉÉ

## Disponibilité et coûts
L’aperçu courant utilise Live. Le brouillon nommé « Tests isolés dompe et remblai » n’est pas une preuve de base, identité, clés, stockage ou notifications distincts. Aucun environnement complet indépendant accessible n’a été démontré ; aucun test hébergé n’a été exécuté.

| Option | Ressources | Coût estimable / limite |
|---|---|---|
| Ordinateur ou CI déjà disponible | Runtime conteneurs, PostgreSQL, API de données, identité fictive, stockage privé, Deno, capture courrier locale, navigateur | 0 de nouvelle ressource Cloud si matériel/temps CI déjà inclus ; consommation de l’équipement et CI non mesurée. Accès/runtime non fourni. Aucun conteneur créé ici. |
| Projet Cloud distinct | Base/API/identité/stockage/fonctions séparés, capture sans fournisseur externe | Usage variable en crédits ; documentation : allowance Cloud 20 crédits/mois par espace, pas par projet. Solde disponible et coût incrémental non vérifiés. Ne pas présumer gratuité, obtenir budget/plafond accepté avant création. |

Aucune dépense d’infrastructure engagée ni ressource payante créée. La consommation normale des outils de développement n’est pas présentée comme gratuite. Pas d’estimation monétaire fictive.

## Étapes de création à autoriser
1. Désigner une machine/CI déjà accessible ou approuver une cible Cloud indépendante et son budget. Une initialisation hébergée SQL/permissions/déploiement exige une autorisation distincte.
2. Fournir preuve des identités distinctes de base/API/serveur/stockage, origine dédiée, clés propres. Écarter toutes clés et URLs Live de la configuration de test. Aucun secret dans le rapport.
3. Construire un schéma fictif minimal et ses droits propres : aucun clonage des demandes/comptes réels, aucun worker CRM/SMS/SEO. Les fixtures locales actuelles omettent volontairement les déclencheurs commerciaux : elles ne certifient pas les contrats hébergés complets.
4. Installer le paquet sous `serveur/` uniquement sur cette cible autorisée ; drapeau courrier réel faux, capture obligatoire et réseau sortant de courrier/SMS bloqué. Maintenir l’en-tête IP de confiance ou un équivalent isolé vérifiable ; jamais croire un en-tête client forgé.
5. Créer A/B fictifs, identités séparées, codes capturés, JPEG/PNG/WebP artificiels. Pour l’émetteur initial qui refuse les adresses réservées, employer uniquement un domaine de capture contrôlé avec sorties réseau interdites ; jamais détourner cette protection en production.
6. Vérifier anonymat refusé, objets privés, absence d’accès sans signature et absence d’appel vers Live avant la première écriture fictive.
7. Exécuter la matrice, conserver résultats/captures sans secrets. Toute fuite, sortie externe ou isolation incertaine = arrêt.

## Matrice à reprendre en hébergement — tous les cas NON EXÉCUTÉS
| Cas | Preuve locale exécutée | Résultat hébergé attendu |
|---|---|---|
| Dossier A valide | Endpoint préparé → SQL → relecture exacte | Même identifiant et valeurs réelles, code du lien A requis |
| Non autorisé | Refus droits SQL anon/authenticated, contrôle endpoint | JWT non admin ne peut émettre/CRM/nettoyer ; RPC privée refusée |
| Autre client B | Lien/secret A avec dossier B refusés | Aucune donnée ni photo B, même avec adresse courriel identique |
| Incomplet/null | Payload refusé et ligne entière inchangée | Pas de confirmation, aucun champ vidé |
| Version périmée/null | Refus côté SQL | Pas d’écrasement, relire sans perdre la saisie |
| Anciennes photos/notes | JSON null → références historiques, texte conservé | Métadonnées absentes et signature impossible : référence conservée |
| Photo en suppression | Barrière `deleting` exécutée | Refus édition/rattachement, pas de recréation ou suppression réelle |
| Erreur avant commit | Transaction annulée puis réessai réussi | Aucune fausse confirmation ni perte |
| Réponse perdue après commit | Réessai identique, événement unique | Relecture confirme la sauvegarde, pas de doublon |
| Simultané identique | Résultat unique et un événement | Une seule mutation |
| Simultané distinct | Un succès et un refus à version égale | Aucun écrasement silencieux |
| Fermeture | Confirmation requise, historique/photo conservés, statut commercial inchangé | Même règles, relecture autorisée du dossier fermé |
| Restauration après échec | Arrêt/rollback SQL, inverses par étape et complet exécutés | Définitions/droits exacts, données de test conservées |
| Courrier initial | Émetteur réel SQL avec file locale simulée : un lien `infinity`, une entrée | Queue réelle capturée, réessai sans second lien/courrier |
| Codes/renouvellement | 54 tests et 10 contrôles : 5 erreurs/15 min, sixième sans prolongation, historiques bloqués | Code 10 min ; code reçu capturé, renvoi honnête ; quota et révocation |
| Photos réelles de test | Adaptateur objet simulé uniquement | Upload privé réel, signature 120 s, ouverture sans signature refusée, pas de fuite A/B |
| Téléphone/tablette/ordinateur | 420×757, 768×1024, 1280×1800, mémoire fictive navigateur | Reprendre sur la cible distincte, navigateur et vrais appareils si disponibles |

## Critères finaux
Tous les cas obligatoires passent sans skip ; l’identité et le stockage réel sont testés ; aucune notification externe ; aucun faux succès ; nouvelles demandes/éditions/reprises et clôture exactes ; retour ciblé exécuté sur la cible isolée. Un test local ou Deno check ne vaut pas validation du serveur hébergé.