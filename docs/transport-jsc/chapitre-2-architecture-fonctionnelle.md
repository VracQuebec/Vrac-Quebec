# Transport JSC — Chapitre 2 : Architecture fonctionnelle du système

Statut : specification. Aucun calcul n'est implemente a ce stade. Ce document definit
chaque ecran, chaque etape et chaque action du parcours complet, de l'arrivee du client
jusqu'a la facturation.

## 0. Regle d'or (prioritaire sur toute autre decision d'UX)

**Le systeme ne doit jamais demander au client une information qu'il peut calculer lui-meme.**

- Interdit : demander le type de camion, le nombre de voyages, le lieu de chargement,
  la distance, la capacite, le taux horaire, la zone tarifaire.
- Autorise : ce que seul le client sait — matiere voulue, quantite (tonnes ou verges),
  adresse de livraison, date souhaitee, contraintes d'acces au site, coordonnees.

Exemple de reference :

```text
Client  : « 28 tonnes de pierre 0-3/4, livrees au 123 rue X, mardi »
Systeme : materiau -> fournisseur -> lieu de chargement optimal -> distance Google Maps
          -> camion 12 roues -> 2 voyages -> transport + materiau + taxes
Client  : voit un prix, un delai, une date. Rien d'autre.
```

Test d'acceptation de chaque champ de formulaire : « Puis-je deduire cette valeur de la
base de configuration, de Google Maps ou d'une regle metier ? » Si oui, le champ est retire.

## 1. Module public (site vracquebec.ca)

| # | Ecran | Ce que le client fait | Ce que le systeme fait | Sortie |
|---|-------|----------------------|------------------------|--------|
| 1 | Accueil | Entre par SEO / pub | Charge les materiaux actifs et zones desservies | CTA « Obtenir un prix » |
| 2 | Choix du matériau | Choisit une famille puis un produit (pierre 0-3/4, sable, terre, remblai) | Filtre par disponibilite et zone; masque tout produit inactif ou hors zone | `material_id` |
| 3 | Calculateur | Saisit quantite OU dimensions (long x larg x epaisseur) | Convertit m3 / verges -> tonnes via la densite du materiau | `tonnage` |
| 4 | Demande de soumission | Adresse de livraison, date souhaitee, contraintes d'acces, coordonnees | Valide l'adresse (Google Places), geocode, verifie la zone, lance le moteur de calcul | `transport_request` |
| 5 | Confirmation | Voit prix estime, delai, numero de demande | Envoie courriel client + notification CRM, cree l'entree CRM | Demande dans le CRM |

Regles :
- Aucun champ technique visible (camion, voyages, fournisseur, distance).
- Estimation affichee = fourchette ou prix ferme selon le parametre admin `public_price_mode`.
- Hors zone desservie : le systeme le dit immediatement et propose un rappel, sans prix.

## 2. Module CRM (Transport JSC)

| # | Etape | Declencheur | Action systeme | Action humaine (Jonathan) |
|---|-------|-------------|----------------|---------------------------|
| 1 | Reception | Formulaire public soumis | Cree la demande, numerote, horodate, notifie | Aucune |
| 2 | Creation du client | Reception | Recherche un client existant (courriel / telephone / adresse), sinon le cree | Fusionner les doublons si besoin |
| 3 | Creation de la soumission | Reception | Genere la soumission complete a partir du moteur de calcul | Aucune |
| 4 | Validation | Soumission generee | Affiche le detail interne (couts, marge, camion, voyages) | Ajuste prix / marge / commentaire, puis valide |
| 5 | Envoi | Validation | PDF + courriel au client, statut « soumission envoyee » | Relance si silence |
| 6 | Acceptation | Reponse client (lien ou telephone) | Statut « acceptee », verrouille les prix | Confirme |
| 7 | Commande | Acceptation | Cree la commande, reserve camion et date, planifie les voyages | Repartition / dispatch |
| 8 | Facturation | Commande terminee | Genere la facture (transport + materiau + taxes), suit les paiements | Envoie et suit |

Chaque transition ecrit dans le journal d'audit (utilisateur, date, avant/apres) et rien
n'est supprime : uniquement archive.

## 3. Moteur de calcul (arriere-plan, invisible du client)

Entrees : `material_id`, `tonnage`, `delivery_address` (geocodee), `date`, `company_id`.

```text
1. Selection du materiau        -> densite, taxable oui/non, contraintes de transport
2. Selection du lieu de charge  -> tous les lieux offrant ce materiau, actifs, en stock
3. Calcul Google Maps           -> distance + duree lieu -> livraison, pour chaque candidat
4. Choix du camion              -> plus petit cout total respectant capacite et acces au site
5. Calcul des voyages           -> ceil(tonnage / capacite retenue) + gestion du dernier voyage partiel
6. Calcul du transport          -> selon le mode du tarif (horaire, au km, au voyage, a la tonne)
7. Calcul du materiau           -> prix fournisseur x tonnage, par lieu de chargement
8. Total                        -> transport + materiau + surcharges + taxes (TPS/TVQ selon materiau)
9. Generation de la soumission  -> version interne (couts, marge) + version client (total seul)
```

Regles de decision :
- Le lieu de chargement retenu est celui qui **minimise le cout total livre**, pas la distance.
- Le camion retenu est celui qui minimise le cout total, sous contrainte d'acces (rue etroite,
  hauteur, portance) declaree par le client en langage simple.
- Toute valeur (densite, capacite, taux, seuils, marge, surcharges carburant) provient des
  tables `jsc_*`. Zero valeur codee en dur.
- Chaque calcul est trace : entrees, candidats evalues, option retenue et pourquoi. Ce trace
  est visible en CRM uniquement, jamais du client.
- Un recalcul ulterieur ne modifie jamais une soumission acceptee : les prix sont figes.

## 4. Module Administration

| Module | Contenu | Confidentiel |
|--------|---------|--------------|
| Materiaux | Produits, densites, taxabilite, unites, disponibilite | Partiel |
| Fournisseurs | Fournisseurs, contacts, conditions | Oui |
| Prix materiaux | Prix par fournisseur et par lieu de chargement | Oui |
| Lieux de chargement | Adresses, materiaux offerts, horaires | Oui |
| Camions | Types, capacites, couts, contraintes | Oui |
| Tarifs de transport | Modes de tarification, taux, minimums, surcharges | Oui |
| Zones | Territoires desservis, majorations | Partiel |
| Taxes | TPS / TVQ, regles d'application | Non |
| Parametres | Marges, arrondis, delais, mode de prix public | Oui |
| Historique | Journal d'audit complet, lecture seule | Oui |
| Utilisateurs & permissions | Comptes, roles, rattachement entreprise | Oui |

Regles : administration reservee aux administrateurs, portee par entreprise (`company_id`),
archivage au lieu de suppression, export / import de la configuration complete.

## 5. Parcours de bout en bout (resume)

```text
Client                    Systeme                          Jonathan
------                    -------                          --------
Materiau + quantite  ->   conversion, validation zone
Adresse + date       ->   moteur de calcul (9 etapes)
Voit prix + delai    <-   soumission client generee   ->   validation / ajustement
Accepte              ->   commande + planification    ->   dispatch
                          facture generee             ->   envoi et suivi
```

## 6. Ce qui reste a decider avant le Chapitre 3

1. Prix ferme ou fourchette sur le site public ?
2. Acceptation en ligne (lien signe) ou uniquement par telephone ?
3. Modes de tarification transport a supporter en v1 (horaire / km / voyage / tonne).
4. Formulation des contraintes d'acces au site en langage client.