# Phase 4 — Profil professionnel entreprise Vrac Québec

## Résultat visé
Faire de « Mon entreprise » une fiche professionnelle mobile claire, tout en gardant le compte utilisateur, les données privées et la présentation publique strictement séparés.

## Mise en œuvre
1. **Consolider l’identité réelle**
   - Donner priorité au nom commercial ou légal de la fiche entreprise liée, puis au nom d’entreprise existant; ne jamais dériver le nom du courriel.
   - Conserver une section « Mon compte » distincte avec le nom, le courriel et les rôles du compte connecté.

2. **Structurer « Mon entreprise »**
   - Présenter le logo ou un remplacement neutre, le nom, la description, la localisation, le téléphone professionnel, les services et les territoires déjà enregistrés.
   - Afficher « À compléter » ou « Aucun service configuré » quand la donnée manque.
   - Calculer seulement « Profil complet » ou « Profil à compléter » à partir des champs déjà disponibles; ne pas afficher de certification inventée.
   - Ajouter un résumé privé des véhicules de l’entreprise en réutilisant `trucks` et l’appartenance existante, sans plaques, documents, assurances ni détails internes dans ce résumé.

3. **Réutiliser le profil public existant**
   - Garder la projection serveur `mkt_partner_public` comme unique source publique : identité, description, ville/région, services, territoires, photos/avis et vérification réellement enregistrée.
   - Réorganiser la fiche publique en sections ouvertes, mobile-first, avec le CTA existant « Demander une soumission ».
   - Afficher des états explicites lorsque services ou territoires sont absents.
   - Ne pas afficher de véhicules publiquement : ni `trucks` ni les équipements ne possèdent actuellement de champ de visibilité publique explicite.

4. **Préserver la sécurité**
   - Garder les lectures privées derrière l’appartenance à l’entreprise et les règles existantes.
   - Ne charger aucune donnée privée dans la fiche publique; conserver les fonctions serveur actuelles sans migration, RLS ou permission nouvelle.
   - Vérifier qu’un identifiant d’entreprise étrangère ne retourne aucune fiche privée et que la fiche publique ne contient ni courriel privé, adresse complète, téléphone privé, plaque, documents, assurances, finances ou CRM.

## Validation
- Tests unitaires : nom réel, données absentes, services présents/absents, flotte présente/absente et projection publique sans données privées.
- Parcours réels : profil privé, profil public, lien entre les deux et accès direct étranger.
- Formats : 320×667, 393×852 et ordinateur, sans débordement horizontal.
- Compilation finale et confirmation : aucune table, migration, donnée, RLS, permission ou publication.

## Contraintes techniques
- Réutiliser `entrepreneurs`, `jsc_company_members`, `mkt_partners`, `mkt_partner_services`, `mkt_partner_territories`, `trucks`, `mkt_partner_full` et `mkt_partner_public`.
- Aucun appel de création automatique durant une simple consultation.
- Aucun véhicule dans le profil public tant qu’un indicateur de visibilité explicite n’existe pas.
