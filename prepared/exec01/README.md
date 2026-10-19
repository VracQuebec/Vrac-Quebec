# EXEC-01 — préparation non déployée

## État exact
Le parcours TEST est opérationnel sur des données fictives locales. Aucun lien réel n'est émis, aucun courriel n'est envoyé, aucune écriture métier ni migration n'est réalisée. Le CRM TEST est une vue du même dossier fictif, **pas une connexion vérifiée au CRM hébergé**. Il ne constitue pas un deuxième CRM métier.

`handler.ts` valide les opérations côté serveur avec le même service testé et un dépôt injecté. Il n'est pas déployable tel quel comme fonction Cloud : les imports `src/` devront être empaquetés et le dépôt transactionnel implémenté. Ne pas copier ce dossier dans les fonctions actives sans autorisation et revue.

## Objets existants à réutiliser lors de l'activation
- `submissions` : id, status (commercial), availability_status/updated_at/source/reason, remaining_capacity, quantity_value/unit, opening_hours, truck_types_allowed, access_criteria/access_details, photos_meta.
- `submission_fill_profile`, `submission_material_conditions`, `submission_environmental_info` : préférences et validation environnementale restent séparées.
- `submission_availability_log` et `set_dompe_availability` : historique et changement de disponibilité; autorité admin existante à conserver, jamais accorder ce RPC global aux anonymes.
- `submit-parcours` et le modèle `client-confirmation` : points d'émission et de courriel existants. **Inchangés** dans ce lot car la base est partagée et les fonctions actives peuvent se déployer automatiquement.
- `/s/:token`, `entcrm_public_quote`, `entcrm_public_respond` : exemple de projection publique limitée, mais non réutilisable pour une demande de remblai (autre objet, lecture avec mutation et jeton non haché).

## Dépendances précises restant à réaliser hors production
1. Environnement backend isolé pour les tests serveur. Aucun environnement ni projet créé ici.
2. Dépôt transactionnel Cloud : complément additif des conditions dans `submission_fill_profile`, états de lien/code/opération liés uniquement à `submissions.id`; RLS et GRANT explicites, aucune lecture anonyme directe. Les ajouts SQL n'ont pas été appliqués ni prétendus disponibles.
3. Émission après vérification du contact : secret cryptographique haché uniquement au repos, lien à fragment supprimé avant toute mesure, expiration/révocation et renouvellement envoyé uniquement au contact déjà vérifié. Ne jamais accepter une nouvelle destination depuis un visiteur.
4. Réutiliser le courriel existant avec son bouton conditionnel après émission serveur; désactiver réécriture/tracking des liens. Configurer une boîte de capture TEST avant tout essai. Configuration du prestataire non vérifiée dans ce lot.
5. Brancher la vue admin existante sur les mêmes écritures et son rafraîchissement/realtime. Le test de synchronisation Cloud n'a pas été réalisé.
6. Photos réelles via Storage privé, chemins limités au dossier, URLs temporaires sans jeton portail; contrôle MIME/taille/autorisation serveur. Les photos TEST locales sont des data URLs.
7. La plateforme ne dispose pas de primitive standard de limitation des tentatives : le test applique 5 échecs de code, mais le quota global, le renouvellement et l'émission doivent recevoir un mécanisme partagé validé avant activation. Aucune protection anti-abus distribuée n'est revendiquée.
8. Revalidation des confirmations et éventuels engagements existants par RPC transactionnel. Ne pas annuler/autoriser les transports par une préférence propriétaire.

## Hors périmètre
Facturation, punch, paiements, réservations et autorisations opérationnelles de livraison.