# Liens historiques — stratégie préparée, aucune donnée modifiée

## Deux chemins réels concernés
Lecture du catalogue le 22 octobre 2026 : `exec01_dispatch(jsonb)` crée/renouvelle avec 30 jours ; `exec01_enqueue_confirmation(jsonb)` crée le lien du courriel initial directement avec 30 jours. Corriger seulement le premier ne suffit pas.

La composition proposée change les créations futures de ces deux fonctions vers `infinity`, sans modifier leurs contrats de destinataire ni le statut commercial. Les contrôles d’expiration restent présents pour les dates finies, ainsi que révocation, identité, quotas et code récent. Le cycle EXEC-02 préparé contient un autre créateur de lien à 30 jours, mais aucune fonction `exec02_dispatch` installée n’a été retrouvée dans la lecture ciblée ; il reste hors activation, et doit être revu séparément avant une future mise en service EXEC-02.

## Décisions à approuver avant production
1. **Option conservatrice, sans mise à jour historique** : les liens déjà envoyés gardent leur date stockée. Un lien expiré ne permet pas la consultation. Le renouvellement sécurisé peut utiliser le secret du lien non révoqué et l’adresse inchangée, dans les limites prévues ; le nouveau lien est permanent, l’ancien révoqué. Le client vérifie ensuite CE nouveau lien par code. Les compteurs ambigus restent bloqués, récupération manuelle vérifiée seulement.
2. **Si le même lien historique doit fonctionner après plusieurs mois** : autorisation distincte d’une prolongation ciblée, dossier par dossier. Avant-image exacte de `expires_at`, identifiant de lien/dossier, motif, approbation et trace d’audit obligatoires. Refuser lien révoqué/remplacé, identité changée, dossier non actif, incohérence ou état historique ambigu. Aucun script de prolongation massive n’est préparé ou exécuté ici.

La seconde option change des données : elle n’est pas incluse dans le SQL de fonctions. Sans décision, ne pas annoncer que tous les anciens liens sont permanents. La prolongation ne contourne jamais la vérification d’identité.

## Retour arrière et sécurité
Les inverses ne remettent pas une ancienne date sur les liens déjà créés permanents : ils restaurent seulement les fonctions. Ces liens restent révocables, rattachés au dossier et soumis à l’identité. Ne pas raccourcir leur durée automatiquement ni reconstruire une date à partir de l’heure actuelle. Toute correction de données exige une autorisation et une avant-image propre au lien ; arrêter en cas de version/identité/révocation différente.

Une fermeture conserve la demande et l’historique ; elle change la disponibilité existante `owner_closed`, pas le statut commercial. Une demande fermée reste consultable après vérification, mais aucune édition/réouverture implicite n’est autorisée. Cette règle préexistante n’est pas transformée en suppression ni en annulation commerciale.