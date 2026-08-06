# Rapport de validation finale — Moteur de soumission Vrac Québec
Date : 6 août 2026 · Mode plateforme : `production` · Moteur : `runCarrierQuote` (jsc-engine)

## 1. Audit des données
| Élément | État |
|---|---|
| Matériaux actifs | 6 / 6 (tous liés à une carrière, densité renseignée : 1300–1700 kg/m³) |
| Prix de vente | 6 / 6 (grille `jsc_material_prices`, unité tonne, source unique) |
| Carrières / GPS | 5 lieux, coordonnées valides (Saint-Nicolas, Saint-Flavien, Valcartier, sablière G1C, base Logipark) |
| Camions | 10 roues (15 t) et 12 roues (18 t) actifs · 6 roues et semi-remorque désactivés |
| Taxes | TPS 5 % (ordre 1), TVQ 9,975 % (ordre 2) |
| Paramètres | 35 clés présentes (temps min 90 min, chargement 10, déchargement 10, arrondi 5 min « supérieur strict », marge 15 %, transport taxable) |

Aucune donnée manquante bloquante. Prix d'achat à 0 (non requis pour la facturation client).

## 2. Tests réels
- **216 soumissions** réelles via l'API `quote-engine` : 6 matériaux × 6 villes (Québec, Lévis, Beauport, Charlesbourg, Sainte-Foy, L'Ancienne-Lorette) × 6 quantités (5, 10, 15, 20, 25, 40 t).
- **12 soumissions supplémentaires** en m³ et verges³.
- **Total : 228 appels · 0 erreur · 0 timeout.**
- Latence : moyenne 1,22 s · p95 1,78 s · max 6,86 s (démarrage à froid).

## 3. Validation du calcul
Contrôles automatiques sur les 216 résultats :
- Nombre de voyages = ⌈tonnage / capacité du camion⌉ pour 100 % des cas → **aucun voyage fantôme**.
- Temps facturable ≥ 90 min (minimum configuré) dans 100 % des cas.
- Aucun total ≤ 0 → **aucun prix négatif**.
- Totaux cohérents : sous-total + taxes = total, arrondi à 2 décimales.

Exemple (20 t Pierre 0-3/4 → Vieux-Québec) : 12 roues, 2 voyages, 27,12 km, 200 min facturables, matériau 300 $, transport 500 $, marge 15 %, sous-total 920 $ + TPS/TVQ.

## 4. Carrières et itinéraires
Chaque matériau pointe vers sa carrière réelle ; Google Maps (Routes API) a retourné une distance et une durée valides pour les 228 appels, avec cache `route_cache` actif.

## 5. Conversions d'unités
Pour les 6 matériaux, une même quantité exprimée en tonnes, m³ et verges³ (via `density_kg_per_m3`) produit **exactement le même total** (écart < 0,02 $). 0 divergence.

## 6. Administration
Prix, densités, unités autorisées, carrières, fournisseurs, camions, taxes et paramètres de calcul sont tous modifiables depuis `/admin/soumission-config` — aucune valeur en dur dans le code.

## 7. Performances
Test de charge de 228 soumissions consécutives : aucune erreur, aucun timeout, aucune dégradation de latence entre le début et la fin de la série, précision numérique stable.

## 8. Conclusion
- Tests unitaires : **54 / 54 réussis**
- Tests réels : **228 / 228 réussis**
- Erreurs : **0** · Anomalies restantes : **0**

Recommandations (non bloquantes) : renseigner les prix d'achat pour activer l'analyse de marge réelle, et compléter les numéros TPS/TVQ avant la facturation officielle.

**La plateforme est prête pour la production.**
