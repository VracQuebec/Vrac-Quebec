# Sauvegarde et validation de restauration — procédure NON EXÉCUTÉE

## Vérifiable automatiquement

Les fichiers SQL, signatures, empreintes et ACL peuvent être comparés par lecture du catalogue. Les tests locaux vérifient logique, conservation des dossiers fictifs et inverse du renouvellement. Ils ne donnent aucun accès à l'inventaire de sauvegardes, ne prouvent aucune restauration de sauvegarde réelle et ne confirment pas les réglages de connexion hébergés.

## Vérification manuelle Lovable obligatoire

Le propriétaire confirme une sauvegarde enregistrée, sans timestamp. Ouvrir **More → Database → Manage → Backups**, relever la date UTC exacte. Ne pas inventer le nombre ou la fraîcheur des snapshots. Les snapshots sont quotidiens, conservés jusqu'à environ 14 jours, sans restauration à un instant arbitraire. Ils couvrent schéma et données seulement.

## Essai séparé, après autorisations distinctes

1. Confirmer source et destination ; si des environnements Test/Live sont proposés, demander explicitement lequel exporter. Ici l'aperçu partage la base publiée : il n'est pas une destination isolée.
2. Faire approuver export et destination, coût compris, avant toute action. Ne pas créer d'environnement maintenant.
3. Dans Lovable : **More → Database → Manage → Settings → Export project data → Export data → Database → Export → Start export**. Backend en cours d'exécution requis ; ne pas promettre qu'un export le reprend.
4. Télécharger l'export depuis le lien reçu ou **More → Storage**. Limites : base jusqu'à 15 Go, fichier jusqu'à 5 Go, un export par 24 heures.
5. Faire restaurer cet export dans un projet Supabase distinct appartenant au propriétaire, après accord explicite. Les snapshots Cloud ne restaurent que la même base en place : aucun import dans un autre backend Cloud n'est promis.
6. Isoler tous courriels, webhooks, tâches planifiées et clés AVANT de laisser les traitements fonctionner. Ne pas copier les secrets de production. Reconfigurer les fournisseurs de connexion et clés à destination.
7. Vérifier connexion, schéma et dossiers sur la destination autorisée. Les comptes et hachages de mots de passe sont inclus dans l'export, mais pas les fichiers de stockage, le code des fonctions, les secrets ou les réglages de connexion.
8. Télécharger séparément les fichiers nécessaires depuis **More → Storage** sur autorisation. Ni snapshot ni export de base ne les couvre.
9. Tester le paquet précédent avec les ajouts M1/M2 conservés, puis les copies préparées avec la RPC durable, et documenter séparément chaque résultat.

Une restauration globale en place est permanente : écritures postérieures perdues, schéma rétabli avec les données, indisponibilité quelques minutes. Préserver l'état courant par export préalable exige une autorisation supplémentaire. Ce n'est jamais le retour opérationnel ordinaire de ce correctif.

**Mise en service BLOQUÉE tant que timestamp et restauration séparée ne sont pas vérifiés.** Aucune sauvegarde, exportation, restauration ou destination créée pendant cette préparation.