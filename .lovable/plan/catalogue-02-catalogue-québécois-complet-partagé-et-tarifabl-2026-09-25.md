# CATALOGUE-02 — Catalogue québécois complet, partagé et tarifable

Ce travail est trop gros pour un seul tour. Il est découpé en 5 lots livrables. Chaque lot est testé et présenté avant de passer au suivant. Rien n'est publié sans votre accord.

## Lot 1 — Vérification et recherche du catalogue québécois
- Vérifier les chiffres actuels dans la base : 45 entrées, 44 sélectionnables, 6 variantes tarifées, formulaire Remblai limité.
- Parcourir les 6 sources imposées, puis d'autres fournisseurs de plusieurs régions (Québec, Montréal/Laval, Estrie, Outaouais, Saguenay, Bas-Saint-Laurent).
- Pour chaque produit : nom d'origine, source (URL), date de vérification, caractéristiques et preuve de vente en vrac. Les produits vendus seulement en sac sont exclus.
- Livrable : un fichier exportable (CSV/XLSX) avec les ajouts proposés, les familles et régions couvertes, et les lacunes restantes. **Aucun prix Internet n'est importé.**

## Lot 2 — Structure centrale et administration du catalogue
- Chaîne famille → matériau → variante commercialisable → offre fournisseur → tarif, en réutilisant les tables existantes (aucune copie).
- Variantes : calibre, composition, couleur, traitement, spécification. Codes MG-20 et CG-14 seulement s'ils sont documentés, jamais déduits d'un « 0-3/4 ».
- Nouvelles colonnes de traçabilité : source, date de vérification, preuve de vente en vrac.
- Historique des renommages et des désactivations.
- Écran admin pour ajouter un matériau, une variante ou un synonyme sans toucher au code.
- Import des ajouts validés au Lot 1. Le script peut être relancé sans créer de doublons.

## Lot 3 — Tarifs dans toutes les unités
- Le moteur calcule directement dans l'unité du tarif : tonne, m³, verge³, voyage et forfait.
- m³ ↔ verge³ : simple conversion de volume, sans densité. Une densité documentée est exigée seulement pour passer du poids au volume (ou l'inverse).
- Un voyage n'est jamais converti en tonnage.
- Livraison vérifiée à part : si elle ne peut pas être calculée, le sous-total matériau est affiché et la livraison reste « à confirmer ». Aucun total incomplet n'est présenté comme final.
- Écran Tarifs matériaux : « Ajouter un tarif » sur chaque variante, frais séparés (vente / transport / réception), et import/export CSV avec aperçu, rapport d'erreurs et aucun écrasement silencieux.

## Lot 4 — Branchement de tous les modules
- Faire la liste de chaque page, formulaire, filtre et service qui utilise une liste de matériaux figée, puis les brancher sur le catalogue central : catalogue public, Vrac (le catalogue devient l'entrée principale), offres et surplus, fiches fournisseurs et entrepreneurs, soumissions admin, CRM, filtres de carte, matching, interpréteur, exports.
- Remblai : choix multiple dans le catalogue complet (familles repliables, recherche, variantes), avec « accepté / refusé / à confirmer » et des conditions pour chaque matériau.
- Les acceptations historiques restent intactes. Un nouveau matériau n'est jamais ajouté automatiquement à une dompe existante.
- Les rôles, droits et fonctions désactivées ne changent pas.

## Lot 5 — Preuves et livrables
- Tests automatiques et parcours réels avec des comptes de test, sans aucun courriel réel envoyé (envois capturés) et avec nettoyage à la fin :
  - nouveau matériau visible dans les sélecteurs ;
  - tarif puis soumission complète ;
  - soumission à la tonne, au m³ et à la verge³ ;
  - conversion de volume ;
  - conversion poids ↔ volume impossible ;
  - tarif absent, expiré ou ambigu ;
  - livraison non calculable ;
  - Remblai avec plusieurs matériaux ;
  - soumission remise qui reste identique après un changement de prix ;
  - droits d'accès.
- Matrice par matériau et variante : source, présence dans chaque module, unités, tarifs, admissibilité au calcul automatique. Comptes séparés (familles, matériaux, variantes, synonymes, offres, tarifs).
- Captures des écrans de prix et des soumissions dans plusieurs unités, avec pour chaque élément l'état développé, testé ou publié.

## Détails techniques
- Migrations sans suppression. Les ajouts au catalogue passent par des insertions relançables (ON CONFLICT sur slug). Les colonnes de l'historique Remblai ne sont pas modifiées.
- Le moteur actuel (`resolveMaterialPrice`, supply.ts) est étendu à toutes les unités. Pas de deuxième moteur. La copie des prix dans chaque soumission est conservée.
- Import CSV avec correspondance par slug + granulométrie. Un conflit avec un prix existant est rejeté, sauf si la ligne est explicitement marquée pour remplacement.

## Ordre proposé
Lot 1 → 2 → 3 → 4 → 5. Chaque lot se termine par un rapport chiffré.
