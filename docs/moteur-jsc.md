# Moteur de soumission — Transport JSC

Référence officielle des règles reproduites par le moteur de calcul.
Toutes les valeurs proviennent du module **Administration → Configuration des soumissions**
(`/admin/configuration-soumissions`). Aucune valeur n'est codée dans l'application.

## 1. Sources de données

| Donnée | Source administrable |
|---|---|
| Matériaux, prix à la tonne, carrière associée | Section 1 — Matériaux |
| Carrières (adresse, GPS) | Section 2 — Carrières |
| Camions (capacité, tarif horaire) | Section 3 — Camions |
| TPS / TVQ | Section 4 — Taxes |
| Temps minimum facturable, chargement, déchargement, tampon, arrondis | Section 5 — Paramètres généraux |

Un paramètre manquant ne produit jamais de valeur par défaut : le moteur retourne une erreur explicite.

## 2. Ordre de calcul officiel

1. Identifier le matériau choisi (prix à la tonne, taxable ou non).
2. Trouver la carrière associée au matériau (champ « Carrière d'approvisionnement »).
3. Calculer la distance et la durée routières carrière → livraison (Google Maps, Routes API).
4. Temps aller = durée routière calculée.
5. Temps retour = même durée (trajet identique au retour).
6. Ajouter automatiquement, à chaque voyage : chargement + déchargement + temps tampon.
7. Temps total d'un voyage = aller + retour + chargement + déchargement + tampon.
8. Appliquer le temps minimum facturable (plancher), puis l'arrondi configuré.
9. Choisir le camion recommandé selon la quantité.
10. Nombre de voyages = quantité ÷ capacité du camion, **toujours arrondi au supérieur**.
11. Prix du matériau = tonnage × prix à la tonne.
12. Prix du transport = heures facturables totales × tarif horaire du camion retenu.
13. Sous-total = matériau + transport.
14. Taxes appliquées dans l'ordre configuré (TPS puis TVQ), taxes composées supportées.
15. Total livré estimé = sous-total + taxes.

## 3. Règles précises

**Temps facturable**
- Le plancher (« temps minimum facturable ») s'applique **par voyage**, avant l'arrondi.
- L'arrondi utilise le pas configuré (`Pas d'arrondissement du temps`) et la méthode configurée
  (au supérieur, à l'inférieur, ou au plus proche).
- Le temps facturé total = temps facturable d'un voyage × nombre de voyages.
- Une carrière peut définir son propre temps de chargement ; il remplace alors le paramètre général.

**Choix du camion**
- Le moteur retient le **plus petit camion capable de livrer la quantité en un seul voyage**.
- Si aucun camion ne suffit (grosse quantité), il retient le **plus gros camion actif**
  et répartit la commande en plusieurs voyages.
- Un camion sans capacité ou sans tarif horaire est ignoré.

**Voyages multiples**
- Nombre de voyages = `plafond(tonnage ÷ capacité)`.
- Chaque voyage est facturé au même temps facturable (aller + retour complets).
- Le dernier voyage partiel est facturé comme un voyage complet en temps ;
  le matériau, lui, reste facturé au tonnage réel.

**Matériau**
- Facturé au tonnage réel demandé (aucun arrondi à la capacité du camion).
- Les quantités saisies en volume (m³, verges) sont converties en tonnes avec la densité du matériau.

**Taxes**
- Appliquées uniquement si le matériau est marqué taxable.
- Ordre et taux entièrement administrables.

## 4. Résultat affiché au client

Matériau · Carrière sélectionnée · Distance calculée · Temps facturable · Camion recommandé ·
Nombre de voyages · Prix du matériau · Prix du transport · Sous-total · TPS · TVQ · Total livré estimé.

Aucune information stratégique (coût d'achat, marge, fournisseur, options écartées) n'est exposée :
elle reste dans le bloc technique réservé aux administrateurs.

## 5. Évolutivité multi-transporteurs

Le moteur est isolé derrière `runCarrierQuote(input, config, distance, profil)`
(`supabase/functions/_shared/vqos/jsc-engine.ts`). Un seul profil est actif : `transport_jsc`.
L'ajout d'autres transporteurs consistera à enregistrer leurs paramètres et à sélectionner
le profil correspondant — sans modifier les règles de Transport JSC.
