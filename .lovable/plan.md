# Catalogue partagé Remblai → Vrac → tarification

## Constat (audit réel, lecture seule)

| Source | Lignes | Rôle actuel |
|---|---|---|
| Référentiel matériaux (`material_catalog`) | 45 | Qualification des dompes (Remblai) |
| Familles / granulométries | 35 / 12 | Classement du référentiel |
| Synonymes / alias | 7 / 97 | Recherche et interprétation |
| Liste fixe du formulaire Remblai | 13 libellés | Formulaire Remblai (non relié au référentiel) |
| Produits Vrac (`jsc_materials`) | 6 | Soumissions automatiques |
| Prix Vrac (`jsc_material_prices`) | 6 | Seule source de prix du moteur |

Aucun lien n'existe entre le référentiel et les 6 produits Vrac. Le moteur de soumission existant fige déjà les prix dans chaque soumission remise.

## Décision d'architecture

Le référentiel `material_catalog` devient le **catalogue central unique**. On ne crée pas de copie : on l'étend.

- Ajout sur `material_catalog` : `vrac_selectable` (défaut vrai pour les actifs), `vrac_exclusion_reason` (texte, visible admin).
- Ajout sur `jsc_materials` : `material_catalog_id` (lien explicite, nullable). Les 6 produits existants sont rattachés uniquement si la correspondance est exacte; les cas ambigus restent non liés et sont listés.
- Ajout sur `jsc_material_prices` (tarifs) : `material_catalog_id`, `granulometry_id`, `min_quantity`, `max_quantity`, `zone`, `valid_from`, `valid_to`, `transport_included`, `auto_quote_enabled`, `zero_price_confirmed`. Prix nullable : vide ≠ 0 $.
- Table de correspondance `material_catalog_legacy_map` pour les 13 libellés fixes Remblai → référentiel (migration relançable, sans doublon).
- Coûts et marges : lecture restreinte aux rôles admin (vue publique sans ces colonnes).

## Parcours client Vrac

- Sélecteur regroupé par famille alimenté par le référentiel (45 entrées, actifs + sélectionnables).
- Recherche insensible aux accents, casse, fractions (« 3/4 », « ¾ », « 0-3/4 ») via nom + synonymes + alias.
- Choix de granulométrie demandé si plusieurs variantes.
- Badge « Prix disponible » / « Sur demande » selon tarif valide réel.
- « Je ne trouve pas mon matériau » : description libre rattachée au dossier pour qualification.
- Identifiant, variante, quantité, unité, destination conservés dans la demande et la soumission.

## Administration des prix

Nouvel onglet « Tarifs matériaux » dans Configuration des soumissions :
- Recherche, filtres : Sans prix, Tarif expiré, À compléter, Soumission automatique active.
- Édition rapide multi-lignes : prix CAD, unité (seulement celles configurées), coût/marge (admin), fournisseur/point de chargement, transport inclus, minimum, paliers, zone, validité, activation auto.
- Prix 0 $ exige une confirmation explicite.

## Moteur de soumission (existant, raccordé)

- `resolveMaterialPrice` sélectionne par matériau central + variante + unité + quantité + zone + date de validité, puis la priorité existante (`is_preferred`, point de chargement).
- Aucun tarif, tarif expiré, égalité non départagée, conversion sans densité validée → demande enregistrée dans le CRM avec motif précis, affichage « Soumission à confirmer », aucun total.
- Copie des prix/règles déjà figée dans la soumission (inchangé).

## Préservé

Demandes de remblai, matériaux mixtes, matching, statuts, droits, dossiers historiques, SEO, géolocalisation, moteur de dompes. Migrations additives uniquement.

## Vérifications

Tests unitaires (recherche, sélection de tarif, cas manuels, conversion) + tests serveur réels avec données isolées puis nettoyées : les 8 scénarios demandés. Livraison du tableau complet de correspondances avec nombres exacts.

## Point d'attention

Aucun prix commercial ne sera saisi par moi : après livraison, la majorité des matériaux sera « Sur demande » jusqu'à la saisie de vos prix.
