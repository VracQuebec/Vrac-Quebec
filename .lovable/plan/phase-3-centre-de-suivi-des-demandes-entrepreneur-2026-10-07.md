# Phase 3 — Centre de suivi des demandes entrepreneur

## Résultat visé
Transformer les écrans existants « Mes demandes » et « Dossier de demande » en centre de suivi opérationnel, sans changer le reste de l’application ni créer de données ou de règles métier.

## Mise en œuvre
1. **Consolider le modèle d’affichage existant**
   - Enrichir la vue de présentation `EntrepreneurRequestView` avec les références, libellés et états déjà chargés.
   - Conserver la distinction stricte entre demande de matériau et demande de transport.
   - Utiliser « À compléter » ou « Non précisé » pour toute information absente.

2. **Améliorer la liste « Toutes les demandes »**
   - Garder la recherche et les filtres existants.
   - Rendre chaque ligne plus scannable : numéro, type, chantier, ville, matériau/service, quantité, date et statut.
   - Ajouter « Confirmées » seulement pour les statuts existants qui le prouvent; aucune nouvelle valeur métier ne sera créée.
   - Préserver les liens actuels vers la fiche unique de chaque demande.

3. **Recomposer la fiche de détail existante**
   - Respecter l’ordre mobile : statut, numéro, résumé, chantier, matériau/quantité, suivi, éléments liés, actions.
   - Présenter une progression calculée uniquement à partir du statut et des relations déjà disponibles.
   - Ne jamais marquer une étape comme terminée sans preuve dans les données chargées.
   - Afficher clairement les absences de liens utiles, notamment chantier, dompe et transport.

4. **Réutiliser les relations et parcours existants**
   - Chantier : relation calculée actuelle, sans rapprochement par adresse.
   - Dompe : composant sécurisé existant.
   - Transport : relation explicite existante par demande d’origine.
   - Voyages et services : composants et routes existants, seulement lorsqu’ils sont réellement applicables.
   - Soumission et client/entreprise : afficher uniquement si une relation autorisée et déjà exposée à l’entrepreneur existe; sinon ne pas inventer de lien.

5. **Actions contextuelles**
   - Réutiliser seulement les destinations déjà présentes : chantier, dompe, transport, voyages/services et création de transport.
   - Masquer toute action non applicable plutôt que d’ajouter une opération serveur.

6. **Validation**
   - Ajouter des tests ciblés pour les filtres, valeurs absentes, étapes de suivi et relations explicites.
   - Tester la liste, l’ouverture/retour, les demandes avec et sans chantier/transport, puis les formats 393×852, petit mobile et desktop.
   - Refaire un contrôle d’isolation avec les deux sessions autorisées, sans créer de données persistantes.

## Contraintes garanties
- Aucune nouvelle table ni migration.
- Aucune donnée modifiée.
- Aucune modification RLS, permission ou authentification.
- Aucun changement à Super Admin, la carte des dompes, la flotte ou le moteur de transport.
- Accueil entrepreneur conservé; seuls ses liens existants seront vérifiés.
- Travail en TEST uniquement, sans publication.
