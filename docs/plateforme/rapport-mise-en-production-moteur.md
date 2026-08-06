# Mise en production — Moteur de soumission vrac
Date : 6 août 2026 · Moteur : `jsc-1.4.1` · `platform_mode` : **production**

Portée volontairement limitée aux données nécessaires au calcul d'une soumission vrac.
Les modules facturation (numéros TPS/TVQ, prix d'achat, marges par matériau) et gestion des
fournisseurs sont hors périmètre pour cette phase. Le remblai reste un service distinct et
ne passe pas par ce moteur.

## Vérifications (toutes conformes)
| Point | Résultat |
|---|---|
| Matériau → carrière assignée | 6/6 matériaux actifs |
| Carrière existante et active | 4 carrières, aucune référence orpheline, aucune inactive utilisée |
| Coordonnées GPS des carrières | présentes sur toutes |
| Grille de prix de vente active | 1 tarif actif par matériau (12,00 $ à 25,00 $/t) |
| Camions | 2 actifs : 10 roues 15 t @150 $/h · 12 roues 18 t @150 $/h |
| Garage de départ | Logipark (46,7385 / -71,1935), actif |
| Paramètres obligatoires | min 90 min, chargement/déchargement 10/10, arrondi 5 min `superieur_strict`, 2 décimales, marge 15 %, transport taxable |
| Taxes | TPS 5 % puis TVQ 9,975 %, non composées |

## Validation
- 32 tests automatisés du moteur : 100 % réussis.
- Test live après bascule : 20 t Pierre 0-3/4 → Québec = 2 voyages, 12 roues, 160 min facturables,
  matériau 300 $ + transport 400 $ + marge 105 $ = 805 $, taxes 120,55 $, **total 925,55 $**.

## Réserve d'usage
Aucune densité n'est saisie sur les matériaux : les commandes doivent être exprimées en **tonnes**.
Une demande en m³ ou en verges est refusée par un message explicite (aucun calcul erroné possible).

**Conclusion : le moteur de soumission est en production et utilisable en conditions réelles.**