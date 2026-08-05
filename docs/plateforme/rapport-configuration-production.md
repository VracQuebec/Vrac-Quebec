# Rapport de conformité — Données de configuration
Date : 5 août 2026 · Portée : vérification des données uniquement (aucune modification de logique ni de calcul)
Verdict : **NON CONFORME — `platform_mode` reste à `test`**

## Conforme (aucune action)
- 6 matériaux actifs, tous rattachés à une carrière **existante et active** — aucune référence orpheline, aucune carrière inactive utilisée.
- 4 lieux de chargement actifs + garage de base (Logipark) correctement défini et référencé par `base_location_id`.
- Grille de prix : 1 tarif actif et préféré par matériau (6/6), unité `tonne` cohérente avec l'unité du matériau.
- Camions actifs : 10 roues (15 t) et 12 roues (18 t), capacité et tarif horaire (150 $/h) renseignés. 6 roues / 35 t / semi désactivés — normal.
- Taxes : TPS 5 % puis TVQ 9,975 %, ordre 1-2, non composées.
- Paramètres de calcul obligatoires tous présents (minimum 90 min, chargement/déchargement 10 min, arrondi 5 min `superieur_strict`, 2 décimales, marge 15 %).

## À corriger avant production

### Bloquants
| # | Élément | Constat | Correction attendue |
|---|---|---|---|
| B1 | **Fournisseurs** | La table des fournisseurs est **vide (0 enregistrement)**. Les 4 carrières ont `supplier_id` vide, ainsi que les 6 grilles de prix. | Créer les fournisseurs réels, puis les rattacher à chaque carrière et à chaque tarif. |
| B2 | **Prix d'achat** | `purchase_price = 0` sur les 6 tarifs (seul le prix de vente est saisi). | Saisir le coût réel payé à la carrière — sinon aucune marge réelle ni rentabilité mesurable. |
| B3 | **Densité des matériaux** | `density_kg_per_m3` vide sur les 6 matériaux. | Renseigner la densité : sans elle, toute commande en m³ ou en verges est refusée par le moteur. |

### Importants
| # | Élément | Constat | Correction attendue |
|---|---|---|---|
| I1 | **Coordonnées GPS des carrières** | 3 décimales seulement (46.690 / -71.345, 46.490 / -71.610, 46.943 / -71.463, 46.888 / -71.165) → précision ≈ ±100 m. Le garage, lui, est à 4 décimales. | Re-géocoder à 5-6 décimales (entrée de la carrière). |
| I2 | **Adresse de la sablière** | Le champ adresse contient « G1C 5S7 » (le code postal) au lieu d'une adresse civique. | Saisir l'adresse réelle. |
| I3 | **Numéros de taxes** | `registration_number` vide pour la TPS et la TVQ. | Saisir les numéros d'inscription — obligatoires sur une facture au Québec. |
| I4 | **Tarifs par carrière** | Les 6 tarifs ont `pickup_location_id` vide : ils s'appliquent à toutes les carrières indistinctement. | Rattacher chaque tarif à sa carrière dès qu'un matériau sera offert par plus d'une source. |

### Mineurs
- `min_billable_minutes` (90) fait double emploi avec `min_trip_minutes` (90) — le moteur n'utilise que le second. À retirer pour éviter une divergence future.
- `rounding_increment` (0,05 $) n'est pas utilisé par le moteur (arrondi à 2 décimales). À retirer ou à brancher volontairement.
- Temps de chargement/déchargement à 0 sur les fiches camions : les valeurs globales (10/10 min) s'appliquent. Correct, mais à garder en tête si un camion doit avoir un temps propre.

## Conclusion
La logique du moteur est validée, mais **les données de configuration ne sont pas complètes**.
Trois points bloquent la mise en production : aucun fournisseur enregistré, prix d'achat à zéro et
densités manquantes. `platform_mode` est donc laissé à `test`.

Une fois B1, B2 et B3 saisis dans Administration → Configuration des soumissions, relancer cette
vérification : le passage en production pourra alors être effectué.
