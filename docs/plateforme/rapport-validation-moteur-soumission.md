# Rapport de validation — Moteur de soumission vrac
Date : 5 août 2026 · Moteur : `jsc-1.4.1` · Portée : fiabilisation uniquement (aucune nouvelle fonctionnalité)

## 1. Périmètre audité
Chaîne complète `quote-engine` : sélection carrière/fournisseur → tonnage → camion → voyages →
distances Google Maps → temps → temps facturable → minimum → transport → matériau → frais/marge →
taxes → total. Source unique : `supabase/functions/_shared/vqos/` (aucune copie côté frontend).

## 2. Paramètres réels utilisés (jsc_settings)
| Paramètre | Valeur |
|---|---|
| min_trip_minutes | 90 |
| loading / unloading / buffer | 10 / 10 / 0 min |
| time_rounding_minutes / méthode | 5 / `superieur_strict` |
| price_rounding_decimals | 2 |
| margin_percent | 15 % |
| frais (carburant, km, voyage, admin, environnement) | 0 |
| taxes | TPS 5 % puis TVQ 9,975 %, non composées |
| flotte active | 10 roues 15 t @150 $/h · 12 roues 18 t @150 $/h |
| garage | Logipark (46.7385, -71.1935) |

## 3. Scénarios testés (32 tests automatisés, 100 % réussis)
| # | Scénario | Résultat |
|---|---|---|
| S1 | 5 t, trajet court | 1 voyage, 10 roues, minimum 90 min appliqué, 396,66 $ (live) |
| S2 | 15 t (voyage plein) | 1 voyage — aucun voyage fantôme |
| S3 | 40 t | 3 voyages, 1er cycle garage→carrière→client→garage (115 min), suivants carrière→client→carrière (85 min) |
| S4 | Adresse éloignée (120 km / 95 min) | 2 voyages, transport cohérent avec les minutes facturables |
| S5 | 500 t | dépassement de flotte → plus gros camion (18 t), 28 voyages |
| S6 | 9,375 m³ → 15,000000000000002 t | 1 voyage (tolérance flottant) |
| S7 | Taxes | TPS puis TVQ, non composées, sur le sous-total |
| S8 | Arrondis | tous les montants strictement à 2 décimales |
| Flotte | Sélection camion | plus petit camion couvrant la quantité, sinon le plus gros |
| Erreurs | 9 cas | carrière absente, GPS manquant, garage non configuré, prix manquant, tarif horaire manquant, quantité 0/NaN/négative, adresse invalide, densité manquante, route introuvable → messages explicites, jamais de valeur par défaut silencieuse |

Tests live sur la fonction déployée (Pierre 0-3/4, Terre tamisée, Poussière) : résultats conformes,
adresse invalide et quantité négative correctement rejetées.

## 4. Corrections apportées
1. **Voyage fantôme sur conversion de volume** — `9,375 m³ × 1600 kg` donnait `15,000000000000002 t`,
   déclenchant un 2ᵉ voyage et un camion plus gros. Ajout d'une tolérance de 1 kg (`computeTrips`,
   `pickTruck`). *Impact : surfacturation évitée sur toutes les commandes en verges/m³.*
2. **Perte de cents sur le transport** — le montant était calculé sur des heures arrondies à
   3 décimales (200 min → 499,95 $ au lieu de 500,00 $). Calcul désormais fait sur les minutes exactes.
3. **Transport non taxé sur matériau exonéré** — le paramètre `transport_is_taxable` n'était pas
   utilisé : un matériau non taxable annulait aussi les taxes sur le transport, les frais et la marge.
   Conforme désormais à la règle du Québec (désactivable par paramètre).
4. **Priorité des prix matériau** — la grille respecte maintenant l'ordre documenté :
   tarif préféré → tarif rattaché à la carrière assignée → premier tarif actif.
5. **Validation de quantité renforcée** — `NaN`/`Infinity`/valeurs négatives rejetés avant tout calcul.
6. **Coût Google Maps** — l'appel « client → carrière » n'est plus émis lorsqu'un seul voyage est requis
   (≈25 % d'appels Routes en moins sur les petites commandes).

## 5. Points vérifiés et jugés conformes (sans modification)
- Carrière = celle assignée au matériau, jamais de recherche « moins cher ».
- Cycle officiel JSC (1er voyage avec retour garage, suivants en navette carrière↔client).
- Arrondi `superieur_strict` : 15→20, 23→25, 58→60 (toujours le palier suivant).
- Minimum facturable de 90 min appliqué sur le **total**, pas par voyage.
- Aucune valeur métier codée en dur : tout paramètre manquant lève une erreur explicite.
- Garde-fou `jsc_production_guard` avant toute estimation officielle.
- Cache partagé `route_cache` + reprise automatique sur 429/5xx de Google.

## 6. Éléments à améliorer (non bloquants)
- **Fournisseurs non renseignés** : aucune carrière ni grille de prix n'a de `supplier_id`. La
  « sélection du fournisseur » fonctionne techniquement mais retourne `null`. À compléter dans
  Configuration des soumissions pour la traçabilité d'achat.
- **Coordonnées de carrières à 3 décimales** (~±100 m) : à re-géocoder pour une précision au bâtiment.
- **Paramètres inutilisés** : `min_billable_minutes` (doublon de `min_trip_minutes`) et
  `rounding_increment` (0,05 $) — à supprimer ou à brancher volontairement.
- **Prix d'achat / marge par matériau** : le moteur applique une marge globale de 15 %; une marge par
  matériau ou par zone reste possible si le besoin apparaît.

## 7. Conclusion
Le moteur de soumission est **prêt pour la production**. Les trois anomalies de calcul détectées
(voyage fantôme, cents perdus, taxes sur transport) sont corrigées, couvertes par 32 tests
automatisés et vérifiées en conditions réelles sur les fonctions déployées. Les points restants
relèvent de la qualité des données de configuration (fournisseurs, coordonnées), pas de la logique
de calcul. Recommandation : renseigner les fournisseurs, puis basculer `platform_mode` de `test`
à production.
