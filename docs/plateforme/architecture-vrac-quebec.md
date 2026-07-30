# Vrac Québec — Architecture de plateforme (référence)

Statut : specification directrice. Remplace toute lecture « projet centre sur Transport JSC ».

## 1. Vision

Vrac Québec est **la plateforme**. Elle met en relation trois familles d'acteurs :

- **Clients** : demandent un materiau livre a une adresse, a une date.
- **Fournisseurs** : carrieres, sablieres, sites de materiaux.
- **Transporteurs** : entreprises de camionnage. Transport JSC est le **premier transporteur integre**, pas le proprietaire du systeme.

La plateforme recoit les demandes, calcule les estimations, choisit le fournisseur, choisit le
transporteur, centralise soumissions, commandes, CRM et administration.

## 2. Regle de relation client

Le client ne traite jamais directement avec un transporteur. Il traite avec Vrac Québec.
Le choix du transporteur est une **decision interne** : jamais affichee, jamais demandee.
Cette regle etend la regle d'or du Chapitre 2 (« ne jamais demander une information calculable »).

## 3. Multi-transporteur

Un transporteur est un enregistrement de configuration, pas une branche de code. Ajouter
Transport ABC ou Transport XYZ ne modifie aucune architecture.

Chaque transporteur possede :

| Dimension | Support |
|---|---|
| Coordonnees, statut, zone d'operation | fiche transporteur |
| Camions (types, capacites, couts, contraintes) | rattaches au transporteur |
| Tarifs (horaire, km, voyage, forfait, minimums) | rattaches au transporteur |
| Disponibilites (calendrier, capacite quotidienne) | rattachees au transporteur |
| Parametres (marge, surcharges, delais) | rattaches au transporteur |

Implementation actuelle : la table de cloisonnement `jsc_companies` (colonne `company_id`
presente sur tous les modules) **devient la table des transporteurs**. Les camions, tarifs et
parametres y sont deja rattaches — le multi-transporteur est donc structurellement acquis.

## 4. Multi-fournisseur

Chaque fournisseur possede ses materiaux, ses prix d'achat, ses lieux de chargement, ses
coordonnees et ses disponibilites (`jsc_suppliers`, `jsc_material_prices`, `jsc_pickup_locations`).
Un meme materiau peut provenir de plusieurs fournisseurs : le moteur compare et choisit.

## 5. Moteur de calcul — extension multi-acteurs

Aux 9 etapes du Chapitre 2, deux etapes deviennent des mises en concurrence :

```text
2'. Candidats fournisseurs   -> tous les fournisseurs offrant le materiau, actifs, en stock
4'. Candidats transporteurs  -> tous les transporteurs actifs, disponibles a la date,
                                couvrant la zone, avec un camion apte a l'acces au site
Choix retenu = couple (fournisseur, transporteur, camion) qui minimise le cout total livre,
sous contrainte de disponibilite et d'acces. Chaque candidat evalue est trace en CRM.
```

Regles : zero valeur codee en dur, prix figes des la soumission acceptee, trace complete du
choix (candidats evalues + raison du gagnant), visible en CRM uniquement.

## 6. Administration

La console d'administration est celle de **Vrac Québec**, pas d'un transporteur. Elle couvre :
transporteurs, fournisseurs, materiaux, prix, lieux de chargement, camions, tarifs, zones,
taxes, parametres, journal d'audit, utilisateurs. Portee par transporteur via `company_id`.

## 7. Objectif d'echelle

Absorber des milliers de demandes sans dependance a un transporteur unique. Toute evolution
future doit passer le test : « ce comportement reste-t-il vrai avec 10 transporteurs ? »
