# Audit final avant publication — Vrac Québec

## 1. Données de configuration
- 6 matériaux actifs, densités 1300–1700 kg/m³, unités autorisées (tonne, m³, verge³) complètes.
- Chaque matériau rattaché à une carrière active avec coordonnées GPS valides (Lagueux, Rang du Bois-de-l'Ail, Valcartier…).
- Flotte : 10 et 12 roues actifs (capacité max 18 t, référence du mode « voyages »).
- 35 paramètres globaux de calcul renseignés, `platform_mode = production`.

## 2. Moteur de soumission
- 324 scénarios réels exécutés (6 matériaux × 6 villes × 3 quantités × 3 unités) : 0 erreur.
- Parité unités : tonnes / m³ / verges³ donnent des prix identiques à quantité équivalente (0 écart).
- Multi-voyages, arrondi 5 min et minimum 90 min appliqués correctement.

## 3. Google Maps
- Geocoding + Routes API via la passerelle serveur, cache `route_cache` actif.
- Places Autocomplete obligatoire côté client (lat/lng/place_id capturés).

## 4. Performance
- Latence moyenne 1042 ms, p95 1433 ms sur 324 requêtes.

## 5. Sécurité & confidentialité
- Les charges publiques ne contiennent ni carrière, ni coût d'achat, ni marge.
- Clé navigateur limitée aux Maps/Places ; appels serveurs via passerelle.

## 6. UX
- Parcours d'achat validé desktop et mobile (390 px) : 0 débordement horizontal.
- Boutons d'action corrigés (retour à la ligne, plus de rognage), texte de confirmation dédoublonné.

## 7. Parité courriel / page
- Le courriel client affiche désormais la quantité dans l'unité demandée, le camion recommandé et
  l'encadré « Information importante » + « Aucune facturation avant confirmation », comme la page.

## Conclusion
Plateforme prête pour la mise en production.
