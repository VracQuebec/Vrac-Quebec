# Procédure de sauvegarde et de restauration vérifiable — À EXÉCUTER SEULEMENT SUR AUTORISATION

Aucune étape n'a été exécutée. Les menus sont ceux documentés par la plateforme.

## Étape A — Dernière sauvegarde automatique (gratuit, lecture seule, par le propriétaire)
1. Ouvrir **Plus → Base de données → Gérer → Sauvegardes**.
2. Noter l'horodatage UTC de la ligne la plus récente ; faire une capture d'écran.
3. Critère : sauvegarde de moins de 24 h. Sinon : arrêt.
Rappel : sauvegarde quotidienne, ~14 jours, base seulement (schéma + données), pas de retour à un instant précis, fichiers de stockage exclus.

## Étape B — Export complet (le propriétaire)
1. **Plus → Base de données → Gérer → Paramètres → Exporter les données → Base de données → Exporter → Démarrer l'export.**
2. Limites : base ≤ 15 Go, fichier ≤ 5 Go, un export par 24 h ; backend actif requis.
3. Télécharger depuis le lien reçu par courriel ou **Plus → Stockage**.
4. Coût : **inconnu** (stockage du fichier et activité Cloud décomptés en crédits ; aucun tarif publié pour l'export).
5. Contenu : base complète, comptes avec mots de passe chiffrés. **Exclus** : fichiers de stockage, code des fonctions, secrets, réglages de connexion.

## Étape C — Empreinte de l'export (sur votre ordinateur, ou par moi sur autorisation)
- Taille, date du fichier et SHA-256 (macOS : `shasum -a 256 fichier` ; Windows : `certutil -hashfile fichier SHA256`).
- Noter les trois valeurs dans le journal de déploiement.

## Étape D — Relevés avant migration (lecture seule, par moi sur autorisation)
1. Permissions : `inventaire-privileges-LECTURE-SEULE.sql` → fichier daté.
2. Comptes de lignes : submissions, transport_requests, jsc_clients, jsc_requests, jsc_quotes, seo_pages, public_request_guard, crm_notifications, blog_posts.
3. Compteur des demandes d'accès : `select * from transport_request_number_counter` (attendu ≥ 54 ; prochaine demande #0055 tant qu'aucune n'est arrivée).
4. Les 1 281 meta_title : MD5 de la sauvegarde CSV existante (387584f2379426e168fd5164187118a6) comparé à la base.

## Étape E — Restauration isolée (exige un environnement séparé — autorisation et coût)
1. Créer un projet séparé appartenant au propriétaire (seule cible documentée pour restaurer un export ailleurs).
2. Y restaurer l'export ; reconfigurer connexions et clés **de test** ; aucune clé d'envoi réelle.
3. Rejouer les relevés D2 et D3 : écarts attendus = 0.
4. Ouvrir une session avec un compte d'essai et lire une demande.
5. Résultat : la sauvegarde n'est **vérifiée** que si 3 et 4 réussissent.
Coût : **inconnu** (abonnement du fournisseur choisi pour ce projet séparé).

## Restauration de la production (dernier recours)
Bouton **Restaurer cette sauvegarde** : irréversible ; perte des données écrites après l'instantané ; schéma ramené en arrière ; quelques minutes d'indisponibilité. Toujours faire un export juste avant.
Non restaurés : code des fonctions (historique du projet), secrets, réglages de connexion, Mailchimp/Resend, tâches planifiées — à noter manuellement avant toute migration.
