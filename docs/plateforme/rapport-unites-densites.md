# Rapport de validation — Moteur de soumission Vrac Québec
## Unités de mesure, densités et fiabilité des calculs

Date : validation exécutée en production (mode `platform_mode = production`).
Moteur : `runCarrierQuote` (point d'entrée unique `quote-engine`).

---

## 1. Vérification complète des données

| Élément | État | Détail |
|---|---|---|
| Matériaux actifs | ✅ 6 | tous publics, actifs, non archivés |
| Prix de vente | ✅ complets | 12,00 $ à 25,00 $ / tonne |
| Carrière associée | ✅ 6/6 | chaque matériau pointe vers un lieu de chargement actif |
| Coordonnées GPS | ✅ valides | carrières + garage de départ géolocalisés |
| Camions actifs | ✅ 2 | 10 roues (15 t) et 12 roues (18 t), 150 $/h |
| Paramètres de calcul | ✅ complets | arrondi 5 min, minimum 90 min, chargement 10 min, déchargement 10 min |
| Taxes | ✅ TPS 5 % + TVQ 9,975 % | transport toujours taxable |
| Marge / frais | ✅ 15 % | frais admin, surcharge carburant et frais/voyage à 0 (configurables) |

Aucune donnée manquante ou incohérente détectée.

## 2. Matériaux du formulaire

| Slug | Matériau | Prix | Densité (kg/m³) | Unités permises |
|---|---|---|---|---|
| terre-tamisee | Terre tamisée | 12,00 $ | 1300 | t, m³, vg³ |
| sable | Sable | 16,00 $ | 1600 | t, m³, vg³ |
| sable-a-compaction | Sable à compaction | 16,50 $ | 1650 | t, m³, vg³ |
| pierre-concassee-0-3-4 | Pierre concassée 0-3/4 | 15,00 $ | 1700 | t, m³, vg³ |
| pierre-concassee-3-4-net | Pierre concassée 3/4 net | 25,00 $ | 1500 | t, m³, vg³ |
| poussiere-de-pierre | Poussière de pierre | 13,50 $ | 1600 | t, m³, vg³ |

Aucun message « Matériau non configuré ».

## 3. Validation des calculs (5 t → 60 t, Sable, livraison Québec)

| Quantité | Camion | Voyages | Minutes facturables | Matériau | Transport | Total |
|---|---|---|---|---|---|---|
| 5 t | 15 t | 1 | 110 | 80 $ | 275 $ | 469,38 $ |
| 10 t | 15 t | 1 | 110 | 160 $ | 275 $ | 575,16 $ |
| 15 t | 15 t | 1 | 110 | 240 $ | 275 $ | 680,94 $ |
| 16 t | 18 t | 1 | 110 | 256 $ | 275 $ | 702,09 $ |
| 18 t | 18 t | 1 | 110 | 288 $ | 275 $ | 744,40 $ |
| 20 t | 18 t | 2 | 200 | 320 $ | 500 $ | 1 084,21 $ |
| 25 t | 18 t | 2 | 200 | 400 $ | 500 $ | 1 189,99 $ |
| 36 t | 18 t | 2 | 200 | 576 $ | 500 $ | 1 422,70 $ |
| 40 t | 18 t | 3 | 290 | 640 $ | 725 $ | 1 804,82 $ |
| 60 t | 18 t | 4 | 380 | 960 $ | 950 $ | 2 525,43 $ |

Aucun voyage fantôme (36 t = 2 voyages exactement), aucun prix négatif, arrondis multiples de 5 min, minimum 90 min respecté.

## 4-5. Unités et densités

- Champ `density_kg_per_m3` et liste `allowed_units` configurables par matériau dans **Administration › Matériaux**.
- Conversion effectuée par le moteur : m³ → tonnes via la densité ; verges³ → m³ (× 0,764554857984) → tonnes.
- Densité absente : message clair (« Configurez la densité (kg/m³) dans Administration › Matériaux »), jamais de plantage.
- Unité non permise pour un matériau : message explicite listant les unités acceptées.
- L'interface n'affiche une unité de volume que si la densité est configurée (RPC publique `jsc_public_material_units`).

## 6. Interface

Ajout unique : sélecteur **Unité de mesure** (Tonnes / Mètres cubes / Verges cubes) à l'étape Quantité.
Aucune autre modification au design, à la navigation, aux pages, au CRM ou aux autres formulaires.

## 7. Égalité des trois unités (test en direct, 20 t équivalents)

| Matériau | Tonnes | m³ | vg³ | Total identique |
|---|---|---|---|---|
| Pierre 0-3/4 | 20 | 11,765 | 15,388 | 1 057,77 $ ✅ |
| Pierre 3/4 net | 20 | 13,333 | 17,439 | 1 322,21 $ ✅ |
| Poussière de pierre | 20 | 12,500 | 16,349 | 1 249,49 $ ✅ |
| Sable | 20 | 12,500 | 16,349 | 1 084,21 $ ✅ |
| Sable à compaction | 20 | 12,121 | 15,854 | 948,70 $ ✅ |
| Terre tamisée | 20 | 15,385 | 20,122 | 1 028,03 $ ✅ |

54 tests automatisés passent (dont 13 nouveaux : conversions, densités, balayage 5-60 t).

## 8. Confidentialité

Champs retournés au client : quantité, unité, tonnage, matériau, camion (capacité), voyages, distance, minutes facturables, montants matériau/transport, taxes, total.
Jamais transmis : carrière/lieu de chargement, prix d'achat, marge, coordonnées GPS internes, paramètres internes, candidats évalués.

## 9. Contraintes respectées

CRM, design, navigation, pages et formulaires existants inchangés — seule l'unité a été ajoutée.

## 10. Conclusion

Le moteur est prêt : données complètes, calculs déterministes et cohérents dans les trois unités, densités administrables, confidentialité assurée.
