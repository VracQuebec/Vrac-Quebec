# Vrac Québec — Moteur de calcul V1

Source officielle unique de tout calcul de la plateforme. Aucun prix, aucun délai
ne doit être recalculé ailleurs (site, CRM, API, IA téléphonique, mobile).

## Points d'accès

- Serveur / API / IA téléphonique : `POST /functions/v1/quote-engine`
- Application (site public + CRM) : `getQuote()` dans `src/lib/jsc/engine.ts`
- Logique pure réutilisable : `supabase/functions/_shared/quote-engine.ts`

Entrée : `{ material_id, quantity, unit: tonne|verge|m3, address | delivery{lat,lng}, carrier_id? }`

## Chaîne de calcul

```text
1. Matériau            -> densité, taxabilité, unité
2. Conversion          -> verge / m³ -> tonnes via la densité
3. Fournisseurs        -> lignes de prix actives (par lieu ou par fournisseur)
4. Lieux de chargement -> actifs, géolocalisés, offrant le matériau
5. Google Maps         -> Routes API computeRouteMatrix, un appel pour tous les lieux
6. Camions             -> tous les camions actifs de tous les transporteurs
7. Voyages             -> ceil(tonnage / capacité), tonnage du dernier voyage
8. Temps               -> premier voyage  = fixe + chargement + trajet + déchargement
                          voyages suivants = retour + chargement + trajet + déchargement
                          plancher `min_trip_minutes`, arrondi `time_rounding_minutes`
9. Transport           -> tarif applicable (camion > zone > générique, filtré par distance)
                          modes horaire / km / voyage / forfait + minimum facturable
10. Matériau           -> prix de vente x quantité (ou par voyage)
11. Surcharges         -> carburant % + surcharge de zone
12. Marge              -> `margin_percent` sur le sous-total
13. Décision           -> combinaison (fournisseur, transporteur, camion, tarif)
                          au coût total livré minimal — jamais la distance seule
```

## Paramètres administrateur obligatoires (catégorie `moteur_de_calcul`)

| Clé | Rôle |
|---|---|
| `time_rounding_minutes` | Pas d'arrondi de chaque voyage |
| `min_trip_minutes` | Durée minimale facturable d'un voyage |
| `price_rounding_decimals` | Décimales du montant final |
| `margin_percent` | Marge sur le sous-total |
| `fuel_surcharge_percent` | Surcharge carburant sur le transport |

Un paramètre manquant fait échouer le calcul avec un message explicite : aucune
valeur par défaut n'est codée dans l'application.

## Confidentialité

- Réponse **client** : matériau, tonnage, nombre de voyages, durée estimée, total avant taxes.
- Réponse **interne** (administrateurs seulement) : fournisseur, lieu de chargement,
  transporteur, camion, tarif retenu, détail des temps, coûts, marge et **tous les
  candidats évalués** — la trace complète de la décision.
