# Phase 5B — Validation des 132 villes avant expansion SEO (audit lecture seule)

> Audit et décision de priorité seulement. Aucune page créée, supprimée ou modifiée; aucune URL, aucun SEO, aucune donnée, migration ou RLS modifiés; rien publié.

## 1. Résumé

- Villes analysées : **132** (villes du registre non marquées « desservies »).
- Sources lues : demandes (`submissions`, 679), demandes de transport (`transport_requests`, 11), demandes JSC (`jsc_requests`, 33), rattachement territorial (`geo_territories`), coordonnées GPS, pages locales (`seo_pages`) et résultats de la Phase 5A. Chantiers CRM (`ent_crm_projects`, 5) : aucun rattachable à une ville (pas de champ ville) — non utilisés.
- Demandes rattachées aux 132 villes : **323**.
- Classes : **A = 17** · **B = 44** · **C = 71** · **D = 0**.
- Peuvent réellement être développées (A + B) : **61**; à valider (C) : **71**; à ne pas développer (D) : **0**.
- Pages réellement pertinentes à créer (familles P1 + P2 absentes) : **156** — au lieu de 3 180. Familles P3 (à surveiller, NON recommandées maintenant) : 199 combinaisons.
- Classement global : TOP PRIORITÉ = 6 · Priorité 1 = 11 · Priorité 2 = 18 · Priorité 3 = 26 · À valider = 71 · Ne pas développer = 0.

**Constat clé.** Presque toutes les demandes de ces villes sont des demandes de **remblai** (sites qui veulent recevoir du remblai, c.-à-d. des dompes). Elles justifient fortement les familles *remblai*, *dompe*, *recherche-point-de-depot* et la page ville, mais **pas** les pages de vente de matériaux : les matériaux listés dans ces demandes sont des matériaux **acceptés** par le site receveur, pas achetés. Ils sont donc classés P3 (à surveiller), jamais P1. Les familles matériaux/livraison/courtage ne passent en P1/P2 que lorsqu'une demande de vrac, de livraison ou de transport réelle existe.

**Règles utilisées.**
- Rattachement d'une demande à une ville, dans cet ordre : territoire attribué par le système territorial (`geo_territories.seo_city_slug`); sinon nom de municipalité identique; sinon coordonnées GPS à ≤ 6 km du centre de la ville la plus proche (parmi les 188). 713 des 723 demandes ont été rattachées à une des 188 villes.
- A = ≥ 5 demandes, ou ≥ 3 demandes de ≥ 2 types différents · B = 2 à 4 demandes · C = 1 demande, ou 0 demande mais à ≤ 15 km d'une ville desservie · D = 0 demande et > 15 km de toute ville desservie.
- Priorité des familles (A et B seulement) : P1 = soutenue par ≥ 2 demandes (et page ville dès qu'il y a une demande) · P2 = 1 demande · P3 = matériau seulement accepté par un site receveur, ou transport sans demande directe.
- Priorité globale : TOP = A avec ≥ 10 demandes · P1 = autres A · P2 = B avec ≥ 3 demandes · P3 = B avec 2 demandes · À valider = C · Ne pas développer = D.
- Search Console : 0 impression sur 90 j pour les 132 villes (Phase 5A) — aucune n'est justifiée par le trafic.

## 2–3. Les 132 villes analysées et leur classe

| Ville | Région | MRC | Demandes | Pages existantes | Ville desservie la plus proche | Confiance | Classe | Priorité |
|---|---|---|---|---|---|---|---|---|
| Adstock | Québec | — | 3 | 6 | Saint-Lambert-de-Lauzon (60 km) | Moyenne | B | Priorité 2 |
| Beauceville | Québec | — | 2 | 3 | Saint-Lambert-de-Lauzon (55 km) | Moyenne | B | Priorité 3 |
| Beaumont | Québec | — | 8 | 6 | Pintendre (11 km) | Élevée | A | Priorité 1 |
| Berthierville | Québec | — | 1 | 3 | Saint-Sauveur (80 km) | Faible | C | À valider |
| Blainville | Laurentides | Thérèse-De Blainville | 1 | 3 | Saint-Sauveur (34 km) | Faible | C | À valider |
| Bois-des-Filion | Québec | — | 1 | 2 | Saint-Sauveur (39 km) | Faible | C | À valider |
| Brossard | Montérégie | Agglomération de Longueuil | 1 | 1 | Saint-Sauveur (74 km) | Faible | C | À valider |
| Bécancour | Québec | — | 3 | 2 | Portneuf (51 km) | Moyenne | B | Priorité 2 |
| Cap-Saint-Ignace | Québec | — | 4 | 6 | Saint-Ferréol-les-Neiges (35 km) | Moyenne | B | Priorité 2 |
| Chertsey | Québec | — | 1 | 3 | Saint-Sauveur (42 km) | Faible | C | À valider |
| Contrecoeur | Montérégie | Marguerite-D'Youville | 1 | 2 | Saint-Sauveur (72 km) | Faible | C | À valider |
| Cowansville | Estrie | Brome-Missisquoi | 1 | 2 | Saint-Sauveur (135 km) | Faible | C | À valider |
| Deschambault | Capitale-Nationale | Portneuf | 1 | 2 | Portneuf (7 km) | Faible | C | À valider |
| Disraeli | Québec | — | 2 | 3 | Laurier-Station (74 km) | Moyenne | B | Priorité 3 |
| East Broughton | Québec | — | 2 | 5 | Saint-Lambert-de-Lauzon (38 km) | Moyenne | B | Priorité 3 |
| Entrelacs | Québec | — | 1 | 6 | Saint-Sauveur (28 km) | Faible | C | À valider |
| Frampton | Chaudière-Appalaches | La Nouvelle-Beauce | 2 | 6 | Saint-Lambert-de-Lauzon (33 km) | Moyenne | B | Priorité 3 |
| Gore | Québec | — | 1 | 2 | Saint-Sauveur (12 km) | Faible | C | À valider |
| Grand-Saint-Esprit | Québec | — | 1 | 5 | Portneuf (75 km) | Faible | C | À valider |
| Grenville-sur-la-Rouge | Laurentides | Argenteuil | 1 | 4 | Saint-Sauveur (42 km) | Faible | C | À valider |
| Havelock | Québec | — | 1 | 6 | Saint-Sauveur (100 km) | Faible | C | À valider |
| Honfleur | Québec | — | 1 | 2 | Pintendre (21 km) | Faible | C | À valider |
| Inverness | Québec | — | 1 | 2 | Laurier-Station (31 km) | Faible | C | À valider |
| Irlande | Québec | — | 1 | 2 | Laurier-Station (57 km) | Faible | C | À valider |
| L'Islet | Québec | — | 1 | 2 | Saint-Ferréol-les-Neiges (39 km) | Faible | C | À valider |
| La Durantaye | Québec | — | 4 | 7 | Pintendre (22 km) | Moyenne | B | Priorité 2 |
| Lac-Etchemin | Québec | — | 2 | 3 | Saint-Lambert-de-Lauzon (56 km) | Moyenne | B | Priorité 3 |
| Lantier | Québec | — | 1 | 6 | Saint-Sauveur (30 km) | Faible | C | À valider |
| Laval | Québec | — | 2 | 3 | Saint-Sauveur (44 km) | Moyenne | B | Priorité 3 |
| Leclercville | Québec | — | 1 | 4 | Portneuf (20 km) | Faible | C | À valider |
| Mandeville | Québec | — | 1 | 2 | Saint-Sauveur (79 km) | Faible | C | À valider |
| Mascouche | Québec | — | 1 | 7 | Saint-Sauveur (42 km) | Faible | C | À valider |
| Mont-Tremblant | Laurentides | Les Laurentides | 1 | 1 | Saint-Sauveur (41 km) | Faible | C | À valider |
| Montmagny | Chaudière-Appalaches | Montmagny | 2 | 2 | Sainte-Anne-de-Beaupré (28 km) | Moyenne | B | Priorité 3 |
| Notre-Dame-des-Monts | Capitale-Nationale | Charlevoix-Est | 1 | 5 | Saint-Ferréol-les-Neiges (67 km) | Faible | C | À valider |
| Notre-Dame-du-Mont-Carmel | Québec | — | 2 | 5 | Portneuf (61 km) | Moyenne | B | Priorité 3 |
| Notre-Dame-du-Sacré-Coeur-d'Issoudun | Québec | — | 4 | 6 | Laurier-Station (2 km) | Moyenne | B | Priorité 2 |
| Parisville | Québec | — | 1 | 3 | Portneuf (22 km) | Faible | C | À valider |
| Prévost | Laurentides | — | 1 | 2 | Saint-Sauveur (9 km) | Faible | C | À valider |
| Racine | Québec | — | 1 | 2 | Laurier-Station (127 km) | Faible | C | À valider |
| Rawdon | Québec | — | 1 | 4 | Saint-Sauveur (29 km) | Faible | C | À valider |
| Saguenay | Québec | — | 1 | 5 | Saint-Ferréol-les-Neiges (140 km) | Faible | C | À valider |
| Saint-Agapit | Québec | — | 13 | 8 | Saint-Apollinaire (9 km) | Élevée | A | TOP PRIORITÉ |
| Saint-Alban | Capitale-Nationale | Portneuf | 1 | 2 | Portneuf (15 km) | Faible | C | À valider |
| Saint-Alfred | Québec | — | 1 | 4 | Saint-Lambert-de-Lauzon (55 km) | Faible | C | À valider |
| Saint-Alphonse-Rodriguez | Lanaudière | Matawinie | 1 | 2 | Saint-Sauveur (50 km) | Faible | C | À valider |
| Saint-Anselme | Québec | — | 2 | 2 | Pintendre (15 km) | Moyenne | B | Priorité 3 |
| Saint-Antoine-Abbé | Québec | — | 1 | 2 | Saint-Sauveur (95 km) | Faible | C | À valider |
| Saint-Antoine-de-Tilly | Québec | — | 3 | 5 | Neuville (5 km) | Moyenne | A | Priorité 1 |
| Saint-Barthélemy | Québec | — | 1 | 2 | Saint-Sauveur (86 km) | Faible | C | À valider |
| Saint-Basile | Québec | — | 2 | 7 | Portneuf (6 km) | Moyenne | B | Priorité 3 |
| Saint-Benoît-Labre | Chaudière-Appalaches | — | 3 | 3 | Saint-Lambert-de-Lauzon (60 km) | Moyenne | B | Priorité 2 |
| Saint-Calixte | Québec | — | 1 | 2 | Saint-Sauveur (23 km) | Faible | C | À valider |
| Saint-Calixte-de-Kilkenny | Québec | — | 2 | 6 | Saint-Sauveur (27 km) | Moyenne | B | Priorité 3 |
| Saint-Casimir | Québec | — | 1 | 5 | Portneuf (19 km) | Faible | C | À valider |
| Saint-Charles-de-Bellechasse | Québec | — | 9 | 8 | Pintendre (15 km) | Élevée | A | Priorité 1 |
| Saint-Chrysostome | Québec | — | 1 | 5 | Saint-Sauveur (93 km) | Faible | C | À valider |
| Saint-Colomban | Québec | — | 4 | 3 | Saint-Sauveur (16 km) | Moyenne | B | Priorité 2 |
| Saint-Cyrille-de-Lessard | Québec | — | 1 | 7 | Saint-Ferréol-les-Neiges (47 km) | Faible | C | À valider |
| Saint-Damase-de-l'Islet | Québec | — | 1 | 4 | Saint-Ferréol-les-Neiges (63 km) | Faible | C | À valider |
| Saint-Damien | Québec | — | 17 | 7 | Saint-Sauveur (69 km) | Élevée | A | TOP PRIORITÉ |
| Saint-Elzéar | Québec | — | 3 | 6 | Saint-Lambert-de-Lauzon (22 km) | Moyenne | B | Priorité 2 |
| Saint-Fabien-de-Panet | Québec | — | 1 | 3 | Sainte-Anne-de-Beaupré (76 km) | Faible | C | À valider |
| Saint-Flavien | Québec | — | 2 | 7 | Laurier-Station (9 km) | Moyenne | B | Priorité 3 |
| Saint-François-Xavier-de-Brompton | Estrie | Le Val-Saint-François | 1 | 4 | Laurier-Station (117 km) | Faible | C | À valider |
| Saint-François-de-la-Rivière-du-Sud | Québec | — | 1 | 5 | Sainte-Anne-de-Beaupré (26 km) | Faible | C | À valider |
| Saint-François-du-Lac | Centre-du-Québec | Nicolet-Yamaska | 1 | 2 | Portneuf (101 km) | Faible | C | À valider |
| Saint-Félix-de-Valois | Québec | — | 3 | 3 | Saint-Sauveur (67 km) | Moyenne | B | Priorité 2 |
| Saint-Gabriel | Québec | — | 1 | 4 | Saint-Sauveur (76 km) | Faible | C | À valider |
| Saint-Gabriel-de-Brandon | Québec | — | 1 | 2 | Saint-Sauveur (80 km) | Faible | C | À valider |
| Saint-Georges | Québec | — | 4 | 2 | Saint-Lambert-de-Lauzon (66 km) | Moyenne | A | Priorité 1 |
| Saint-Georges-de-Windsor | Estrie | Les Sources | 1 | 2 | Laurier-Station (96 km) | Faible | C | À valider |
| Saint-Gervais | Chaudière-Appalaches | Bellechasse | 3 | 3 | Pintendre (19 km) | Moyenne | B | Priorité 2 |
| Saint-Gilles | Québec | — | 11 | 8 | Saint-Lambert-de-Lauzon (14 km) | Élevée | A | TOP PRIORITÉ |
| Saint-Henri | Québec | — | 10 | 6 | Pintendre (9 km) | Élevée | A | TOP PRIORITÉ |
| Saint-Hilarion | Québec | — | 1 | 4 | Saint-Ferréol-les-Neiges (60 km) | Faible | C | À valider |
| Saint-Isidore | Québec | — | 8 | 5 | Saint-Lambert-de-Lauzon (9 km) | Élevée | A | Priorité 1 |
| Saint-Janvier-de-Joly | Québec | — | 4 | 4 | Laurier-Station (9 km) | Moyenne | B | Priorité 2 |
| Saint-Jean-de-Matha | Québec | — | 13 | 8 | Saint-Sauveur (65 km) | Élevée | A | TOP PRIORITÉ |
| Saint-Joachim | Québec | — | 1 | 4 | Sainte-Anne-de-Beaupré (5 km) | Faible | C | À valider |
| Saint-Joseph-de-Beauce | Québec | — | 9 | 8 | Saint-Lambert-de-Lauzon (40 km) | Élevée | A | Priorité 1 |
| Saint-Jules-de-Beauce | Québec | — | 1 | 6 | Saint-Lambert-de-Lauzon (45 km) | Faible | C | À valider |
| Saint-Jérôme | Québec | — | 2 | 3 | Saint-Sauveur (17 km) | Moyenne | B | Priorité 3 |
| Saint-Lazare-de-Bellechasse | Chaudière-Appalaches | Bellechasse | 2 | 2 | Pintendre (26 km) | Moyenne | B | Priorité 3 |
| Saint-Luc-de-Bellechasse | Chaudière-Appalaches | Les Etchemins | 1 | 2 | Pintendre (55 km) | Faible | C | À valider |
| Saint-Magloire | Chaudière-Appalaches | Les Etchemins | 1 | 2 | Pintendre (66 km) | Faible | C | À valider |
| Saint-Maurice | Québec | — | 2 | 2 | Portneuf (55 km) | Moyenne | B | Priorité 3 |
| Saint-Michel-de-Bellechasse | Chaudière-Appalaches | Bellechasse | 2 | 3 | Château-Richer (13 km) | Moyenne | B | Priorité 3 |
| Saint-Narcisse-de-Beaurivage | Québec | — | 1 | 5 | Saint-Lambert-de-Lauzon (12 km) | Faible | C | À valider |
| Saint-Nazaire-de-Dorchester | Chaudière-Appalaches | Bellechasse | 1 | 3 | Pintendre (40 km) | Faible | C | À valider |
| Saint-Odilon-de-Cranbourne | Chaudière-Appalaches | Beauce-Centre | 1 | 2 | Saint-Lambert-de-Lauzon (47 km) | Faible | C | À valider |
| Saint-Philibert | Québec | — | 1 | 2 | Saint-Lambert-de-Lauzon (74 km) | Faible | C | À valider |
| Saint-Philémon | Québec | — | 2 | 4 | Pintendre (54 km) | Moyenne | B | Priorité 3 |
| Saint-Pierre-de-Broughton | Québec | — | 1 | 3 | Saint-Lambert-de-Lauzon (38 km) | Faible | C | À valider |
| Saint-Placide | Québec | — | 1 | 2 | Saint-Sauveur (40 km) | Faible | C | À valider |
| Saint-Prosper-de-Champlain | Mauricie | Les Chenaux | 2 | 5 | Portneuf (32 km) | Moyenne | B | Priorité 3 |
| Saint-Raphaël | Chaudière-Appalaches | Bellechasse | 1 | 2 | Château-Richer (27 km) | Faible | C | À valider |
| Saint-René | Québec | — | 2 | 3 | Saint-Lambert-de-Lauzon (72 km) | Moyenne | B | Priorité 3 |
| Saint-Simon-les-Mines | Québec | — | 3 | 6 | Saint-Lambert-de-Lauzon (62 km) | Moyenne | B | Priorité 2 |
| Saint-Sylvestre | Québec | — | 1 | 7 | Saint-Lambert-de-Lauzon (26 km) | Faible | C | À valider |
| Saint-Théophile | Chaudière-Appalaches | — | 3 | 6 | Saint-Lambert-de-Lauzon (87 km) | Moyenne | B | Priorité 2 |
| Saint-Tite-des-Caps | Québec | — | 5 | 5 | Saint-Ferréol-les-Neiges (6 km) | Moyenne | A | Priorité 1 |
| Saint-Victor | Québec | — | 1 | 7 | Saint-Lambert-de-Lauzon (48 km) | Faible | C | À valider |
| Saint-Édouard-de-Lotbinière | Chaudière-Appalaches | — | 1 | 6 | Laurier-Station (10 km) | Faible | C | À valider |
| Saint-Étienne-des-Grès | Québec | — | 1 | 3 | Portneuf (74 km) | Faible | C | À valider |
| Sainte-Béatrix | Lanaudière | — | 1 | 2 | Saint-Sauveur (52 km) | Faible | C | À valider |
| Sainte-Christine-d'Auvergne | Capitale-Nationale | Portneuf | 2 | 3 | Portneuf (14 km) | Moyenne | B | Priorité 3 |
| Sainte-Claire | Québec | — | 1 | 2 | Pintendre (23 km) | Faible | C | À valider |
| Sainte-Croix | Chaudière-Appalaches | Lotbinière | 2 | 2 | Donnacona (6 km) | Moyenne | B | Priorité 3 |
| Sainte-Hénédine | Québec | — | 4 | 6 | Saint-Lambert-de-Lauzon (20 km) | Moyenne | A | Priorité 1 |
| Sainte-Julienne | Québec | — | 3 | 3 | Saint-Sauveur (35 km) | Moyenne | B | Priorité 2 |
| Sainte-Marguerite | Québec | — | 3 | 5 | Saint-Lambert-de-Lauzon (22 km) | Moyenne | B | Priorité 2 |
| Sainte-Marie | Québec | — | 6 | 5 | Saint-Lambert-de-Lauzon (18 km) | Moyenne | A | Priorité 1 |
| Sainte-Pétronille | Capitale-Nationale | L'Île-d'Orléans | 1 | 2 | Beauport (5 km) | Faible | C | À valider |
| Sainte-Sophie | Laurentides | La Rivière-du-Nord | 1 | 2 | Saint-Sauveur (24 km) | Faible | C | À valider |
| Sainte-Sophie-de-Lévrard | Centre-du-Québec | Bécancour | 2 | 5 | Portneuf (35 km) | Moyenne | B | Priorité 3 |
| Sainte-Thècle | Québec | — | 1 | 7 | Portneuf (46 km) | Faible | C | À valider |
| Sainte-Émélie-de-l'Énergie | Québec | — | 3 | 7 | Saint-Sauveur (62 km) | Moyenne | B | Priorité 2 |
| Saints-Anges | Québec | — | 2 | 7 | Saint-Lambert-de-Lauzon (36 km) | Moyenne | B | Priorité 3 |
| Scott | Québec | — | 5 | 4 | Saint-Lambert-de-Lauzon (12 km) | Moyenne | A | Priorité 1 |
| Shawinigan | Québec | — | 3 | 3 | Portneuf (70 km) | Moyenne | B | Priorité 2 |
| Stratford | Estrie | Le Granit | 1 | 3 | Saint-Lambert-de-Lauzon (89 km) | Faible | C | À valider |
| Thetford Mines | Québec | — | 12 | 8 | Saint-Lambert-de-Lauzon (54 km) | Élevée | A | TOP PRIORITÉ |
| Trois-Rivières | Québec | — | 4 | 4 | Portneuf (66 km) | Moyenne | A | Priorité 1 |
| Val-Alain | Québec | — | 2 | 2 | Laurier-Station (16 km) | Moyenne | B | Priorité 3 |
| Val-David | Québec | — | 2 | 2 | Saint-Sauveur (15 km) | Moyenne | B | Priorité 3 |
| Victoriaville | Centre-du-Québec | Arthabaska | 1 | 2 | Laurier-Station (60 km) | Faible | C | À valider |
| Villeroy | Québec | — | 3 | 3 | Laurier-Station (27 km) | Moyenne | B | Priorité 2 |
| Warwick | Centre-du-Québec | Arthabaska | 1 | 3 | Laurier-Station (72 km) | Faible | C | À valider |
| Weedon | Québec | — | 1 | 2 | Laurier-Station (97 km) | Faible | C | À valider |
| Wentworth-Nord | Québec | — | 2 | 2 | Saint-Sauveur (21 km) | Moyenne | B | Priorité 3 |
| Windsor | Québec | — | 1 | 2 | Laurier-Station (114 km) | Faible | C | À valider |

## 4–6. Justification locale, demandes et familles pertinentes par ville

Seules les villes A et B ont des familles pertinentes. « À créer » = familles P1/P2 absentes aujourd'hui. Rien n'est généré.

### Saint-Damien — Classe A · TOP PRIORITÉ

- Région / MRC : Québec / —
- Demandes : **17** — types : remblai 15, transport 1, demande JSC 1 — rattachement : territoire 15, GPS ≤ 6 km 2
- Chantiers : non disponibles par ville
- Pages existantes (7) : dompe, gravier, pierre, poussiere-de-pierre, remblai, sable, ville
- Matériaux acceptés par les sites receveurs (preuve faible) : sable 7, pierre 5, gravier-0-3-4 4, pierre-concassee 4, gravier 3, poussiere-de-pierre 2, roche 1
- P1 : remblai (existe), dompe (existe), recherche-point-de-depot, transport-vrac, ville (existe)
- P2 : livraison-terre
- P3 : sable (existe), gravier-0-3-4, pierre (existe), pierre-concassee, gravier (existe), poussiere-de-pierre (existe), roche
- **À créer (P1/P2) : 3** — recherche-point-de-depot, transport-vrac, livraison-terre
- Prudence cannibalisation : ville vs livraison, transport vs livraison, dompe vs point de dépôt
- Justification : 17 demandes réelles rattachées, plusieurs types; familles limitées à ce que ces demandes prouvent.

### Saint-Agapit — Classe A · TOP PRIORITÉ

- Région / MRC : Québec / —
- Demandes : **13** — types : remblai 11, vrac 2 — rattachement : territoire 13
- Chantiers : non disponibles par ville
- Pages existantes (8) : asphalte, beton, dompe, gravier, poussiere-de-pierre, remblai, sable, ville
- Matériaux acceptés par les sites receveurs (preuve faible) : sable 7, gravier 5, pierre 3, poussiere-de-pierre 3, beton 2, gravier-0-3-4 2, pierre-concassee 2, asphalte 2, roche 1
- P1 : remblai (existe), dompe (existe), recherche-point-de-depot, transport-vrac, courtage-materiaux, ville (existe)
- P2 : pierre-concassee, roche, livraison-sable, sable (existe)
- P3 : gravier (existe), pierre, poussiere-de-pierre (existe), beton (existe), gravier-0-3-4, asphalte (existe)
- **À créer (P1/P2) : 6** — recherche-point-de-depot, transport-vrac, courtage-materiaux, pierre-concassee, roche, livraison-sable
- Prudence cannibalisation : ville vs livraison, transport vs livraison, matériau vs livraison (sable), dompe vs point de dépôt
- Justification : 13 demandes réelles rattachées, plusieurs types; familles limitées à ce que ces demandes prouvent.

### Saint-Jean-de-Matha — Classe A · TOP PRIORITÉ

- Région / MRC : Québec / —
- Demandes : **13** — types : remblai 13 — rattachement : territoire 13
- Chantiers : non disponibles par ville
- Pages existantes (8) : asphalte, dompe, gravier, poussiere-de-pierre, remblai, sable, terre-tamisee, ville
- Matériaux acceptés par les sites receveurs (preuve faible) : sable 4, gravier-0-3-4 3, pierre 3, pierre-concassee 3, gravier 2, poussiere-de-pierre 1, roche 1, asphalte 1
- P1 : remblai (existe), dompe (existe), recherche-point-de-depot, ville (existe)
- P3 : transport-vrac, sable (existe), gravier-0-3-4, pierre, pierre-concassee, gravier (existe), poussiere-de-pierre (existe), roche, asphalte (existe)
- **À créer (P1/P2) : 1** — recherche-point-de-depot
- Prudence cannibalisation : dompe vs point de dépôt
- Justification : 13 demandes réelles rattachées, toutes du même type; familles limitées à ce que ces demandes prouvent.

### Thetford Mines — Classe A · TOP PRIORITÉ

- Région / MRC : Québec / —
- Demandes : **12** — types : remblai 12 — rattachement : territoire 12
- Chantiers : non disponibles par ville
- Pages existantes (8) : asphalte, beton, dompe, gravier, poussiere-de-pierre, remblai, sable, ville
- Matériaux acceptés par les sites receveurs (preuve faible) : sable 9, gravier-0-3-4 9, pierre 9, pierre-concassee 9, gravier 7, poussiere-de-pierre 6, roche 3, beton 3, asphalte 3
- P1 : remblai (existe), dompe (existe), recherche-point-de-depot, ville (existe)
- P3 : transport-vrac, sable (existe), gravier (existe), gravier-0-3-4, pierre, pierre-concassee, poussiere-de-pierre (existe), roche, beton (existe), asphalte (existe)
- **À créer (P1/P2) : 1** — recherche-point-de-depot
- Prudence cannibalisation : dompe vs point de dépôt
- Justification : 12 demandes réelles rattachées, toutes du même type; familles limitées à ce que ces demandes prouvent.

### Saint-Gilles — Classe A · TOP PRIORITÉ

- Région / MRC : Québec / —
- Demandes : **11** — types : remblai 10, livraison 1 — rattachement : territoire 11
- Chantiers : non disponibles par ville
- Pages existantes (8) : asphalte, beton, dompe, gravier, poussiere-de-pierre, remblai, sable, ville
- Matériaux acceptés par les sites receveurs (preuve faible) : sable 6, gravier 5, gravier-0-3-4 5, pierre 5, pierre-concassee 5, poussiere-de-pierre 4, roche 3, asphalte 3, beton 3
- P1 : remblai (existe), dompe (existe), recherche-point-de-depot, ville (existe)
- P2 : transport-vrac, courtage-materiaux, pierre-concassee, roche
- P3 : sable (existe), gravier (existe), gravier-0-3-4, pierre, asphalte (existe), poussiere-de-pierre (existe), beton (existe)
- **À créer (P1/P2) : 5** — recherche-point-de-depot, transport-vrac, courtage-materiaux, pierre-concassee, roche
- Prudence cannibalisation : dompe vs point de dépôt
- Justification : 11 demandes réelles rattachées, plusieurs types; familles limitées à ce que ces demandes prouvent.

### Saint-Henri — Classe A · TOP PRIORITÉ

- Région / MRC : Québec / —
- Demandes : **10** — types : remblai 10 — rattachement : territoire 10
- Chantiers : non disponibles par ville
- Pages existantes (6) : asphalte, dompe, gravier, poussiere-de-pierre, sable, ville
- Matériaux acceptés par les sites receveurs (preuve faible) : sable 3, pierre-concassee 2, roche 1, remblai 1, gravier 1, gravier-0-3-4 1, pierre 1, poussiere-de-pierre 1, asphalte 1
- P1 : remblai, dompe (existe), recherche-point-de-depot, ville (existe)
- P3 : transport-vrac, sable (existe), pierre-concassee, roche, gravier (existe), gravier-0-3-4, pierre, poussiere-de-pierre (existe), asphalte (existe)
- **À créer (P1/P2) : 2** — remblai, recherche-point-de-depot
- Prudence cannibalisation : dompe vs point de dépôt
- Justification : 10 demandes réelles rattachées, toutes du même type; familles limitées à ce que ces demandes prouvent.

### Saint-Charles-de-Bellechasse — Classe A · Priorité 1

- Région / MRC : Québec / —
- Demandes : **9** — types : remblai 9 — rattachement : territoire 9
- Chantiers : non disponibles par ville
- Pages existantes (8) : asphalte, beton, dompe, gravier, poussiere-de-pierre, remblai, sable, ville
- Matériaux acceptés par les sites receveurs (preuve faible) : gravier 4, gravier-0-3-4 2, pierre 2, pierre-concassee 2, poussiere-de-pierre 2, sable 2, roche 1, beton 1, asphalte 1
- P1 : remblai (existe), dompe (existe), recherche-point-de-depot, ville (existe)
- P3 : transport-vrac, gravier (existe), gravier-0-3-4, pierre, pierre-concassee, poussiere-de-pierre (existe), sable (existe), roche, beton (existe), asphalte (existe)
- **À créer (P1/P2) : 1** — recherche-point-de-depot
- Prudence cannibalisation : dompe vs point de dépôt
- Justification : 9 demandes réelles rattachées, toutes du même type; familles limitées à ce que ces demandes prouvent.

### Saint-Joseph-de-Beauce — Classe A · Priorité 1

- Région / MRC : Québec / —
- Demandes : **9** — types : remblai 9 — rattachement : territoire 9
- Chantiers : non disponibles par ville
- Pages existantes (8) : asphalte, beton, dompe, gravier, poussiere-de-pierre, remblai, sable, ville
- Matériaux acceptés par les sites receveurs (preuve faible) : sable 4, gravier 3, gravier-0-3-4 3, pierre 3, pierre-concassee 3, poussiere-de-pierre 2, beton 1, asphalte 1
- P1 : remblai (existe), dompe (existe), recherche-point-de-depot, ville (existe)
- P3 : transport-vrac, sable (existe), gravier (existe), gravier-0-3-4, pierre, pierre-concassee, poussiere-de-pierre (existe), beton (existe), asphalte (existe)
- **À créer (P1/P2) : 1** — recherche-point-de-depot
- Prudence cannibalisation : dompe vs point de dépôt
- Justification : 9 demandes réelles rattachées, toutes du même type; familles limitées à ce que ces demandes prouvent.

### Beaumont — Classe A · Priorité 1

- Région / MRC : Québec / —
- Demandes : **8** — types : remblai 8 — rattachement : territoire 8
- Chantiers : non disponibles par ville
- Pages existantes (6) : beton, dompe, gravier, poussiere-de-pierre, sable, ville
- Matériaux acceptés par les sites receveurs (preuve faible) : pierre-concassee 5, sable 5, roche 4, gravier 1, gravier-0-3-4 1, pierre 1, poussiere-de-pierre 1, beton 1
- P1 : remblai, dompe (existe), recherche-point-de-depot, ville (existe)
- P3 : transport-vrac, pierre-concassee, roche, sable (existe), gravier (existe), gravier-0-3-4, pierre, poussiere-de-pierre (existe), beton (existe)
- **À créer (P1/P2) : 2** — remblai, recherche-point-de-depot
- Prudence cannibalisation : dompe vs point de dépôt
- Justification : 8 demandes réelles rattachées, toutes du même type; familles limitées à ce que ces demandes prouvent.

### Saint-Isidore — Classe A · Priorité 1

- Région / MRC : Québec / —
- Demandes : **8** — types : remblai 7, vrac 1 — rattachement : territoire 8
- Chantiers : non disponibles par ville
- Pages existantes (5) : asphalte, dompe, gravier, sable, ville
- Matériaux acceptés par les sites receveurs (preuve faible) : sable 2, asphalte 1, gravier 1, gravier-0-3-4 1, pierre 1, pierre-concassee 1
- P1 : remblai, dompe (existe), recherche-point-de-depot, ville (existe)
- P2 : transport-vrac, courtage-materiaux, livraison-terre
- P3 : asphalte (existe), gravier (existe), gravier-0-3-4, pierre, pierre-concassee, sable (existe)
- **À créer (P1/P2) : 5** — remblai, recherche-point-de-depot, transport-vrac, courtage-materiaux, livraison-terre
- Prudence cannibalisation : ville vs livraison, transport vs livraison, dompe vs point de dépôt
- Justification : 8 demandes réelles rattachées, plusieurs types; familles limitées à ce que ces demandes prouvent.

### Sainte-Marie — Classe A · Priorité 1

- Région / MRC : Québec / —
- Demandes : **6** — types : remblai 6 — rattachement : territoire 6
- Chantiers : non disponibles par ville
- Pages existantes (5) : dompe, gravier, poussiere-de-pierre, sable, ville
- Matériaux acceptés par les sites receveurs (preuve faible) : sable 3, gravier 3, gravier-0-3-4 3, pierre 3, pierre-concassee 3, poussiere-de-pierre 3, roche 2
- P1 : remblai, dompe (existe), recherche-point-de-depot, ville (existe)
- P3 : transport-vrac, sable (existe), gravier (existe), gravier-0-3-4, pierre, pierre-concassee, poussiere-de-pierre (existe), roche
- **À créer (P1/P2) : 2** — remblai, recherche-point-de-depot
- Prudence cannibalisation : dompe vs point de dépôt
- Justification : 6 demandes réelles rattachées, toutes du même type; familles limitées à ce que ces demandes prouvent.

### Saint-Tite-des-Caps — Classe A · Priorité 1

- Région / MRC : Québec / —
- Demandes : **5** — types : remblai 5 — rattachement : territoire 5
- Chantiers : non disponibles par ville
- Pages existantes (5) : dompe, gravier, poussiere-de-pierre, sable, ville
- Matériaux acceptés par les sites receveurs (preuve faible) : sable 4, gravier 2, pierre-concassee 2, roche 2, gravier-0-3-4 1, pierre 1, poussiere-de-pierre 1
- P1 : remblai, dompe (existe), recherche-point-de-depot, ville (existe)
- P3 : transport-vrac, sable (existe), gravier (existe), gravier-0-3-4, pierre, pierre-concassee, poussiere-de-pierre (existe), roche
- **À créer (P1/P2) : 2** — remblai, recherche-point-de-depot
- Prudence cannibalisation : dompe vs point de dépôt
- Justification : 5 demandes réelles rattachées, toutes du même type; familles limitées à ce que ces demandes prouvent.

### Scott — Classe A · Priorité 1

- Région / MRC : Québec / —
- Demandes : **5** — types : remblai 5 — rattachement : territoire 5
- Chantiers : non disponibles par ville
- Pages existantes (4) : beton, dompe, sable, ville
- Matériaux acceptés par les sites receveurs (preuve faible) : sable 2, roche 2, beton 1, pierre-concassee 1
- P1 : remblai, dompe (existe), recherche-point-de-depot, ville (existe)
- P3 : transport-vrac, sable (existe), roche, beton (existe), pierre-concassee
- **À créer (P1/P2) : 2** — remblai, recherche-point-de-depot
- Prudence cannibalisation : dompe vs point de dépôt
- Justification : 5 demandes réelles rattachées, toutes du même type; familles limitées à ce que ces demandes prouvent.

### Cap-Saint-Ignace — Classe B · Priorité 2

- Région / MRC : Québec / —
- Demandes : **4** — types : remblai 4 — rattachement : territoire 4
- Chantiers : non disponibles par ville
- Pages existantes (6) : asphalte, dompe, gravier, poussiere-de-pierre, sable, ville
- Matériaux acceptés par les sites receveurs (preuve faible) : sable 3, gravier 3, gravier-0-3-4 3, pierre 3, pierre-concassee 3, roche 2, poussiere-de-pierre 2, asphalte 1
- P1 : remblai, dompe (existe), recherche-point-de-depot, ville (existe)
- P3 : transport-vrac, sable (existe), gravier (existe), gravier-0-3-4, pierre, pierre-concassee, roche, poussiere-de-pierre (existe), asphalte (existe)
- **À créer (P1/P2) : 2** — remblai, recherche-point-de-depot
- Prudence cannibalisation : dompe vs point de dépôt
- Justification : 4 demandes réelles rattachées, toutes du même type; familles limitées à ce que ces demandes prouvent.

### La Durantaye — Classe B · Priorité 2

- Région / MRC : Québec / —
- Demandes : **4** — types : remblai 4 — rattachement : territoire 4
- Chantiers : non disponibles par ville
- Pages existantes (7) : asphalte, beton, dompe, gravier, poussiere-de-pierre, sable, ville
- Matériaux acceptés par les sites receveurs (preuve faible) : pierre-concassee 4, sable 3, gravier 3, gravier-0-3-4 3, pierre 3, poussiere-de-pierre 3, roche 3, beton 1, asphalte 1
- P1 : remblai, dompe (existe), recherche-point-de-depot, ville (existe)
- P3 : transport-vrac, sable (existe), gravier (existe), gravier-0-3-4, pierre, pierre-concassee, poussiere-de-pierre (existe), roche, beton (existe), asphalte (existe)
- **À créer (P1/P2) : 2** — remblai, recherche-point-de-depot
- Prudence cannibalisation : dompe vs point de dépôt
- Justification : 4 demandes réelles rattachées, toutes du même type; familles limitées à ce que ces demandes prouvent.

### Notre-Dame-du-Sacré-Coeur-d'Issoudun — Classe B · Priorité 2

- Région / MRC : Québec / —
- Demandes : **4** — types : remblai 4 — rattachement : territoire 4
- Chantiers : non disponibles par ville
- Pages existantes (6) : asphalte, dompe, gravier, poussiere-de-pierre, sable, ville
- Matériaux acceptés par les sites receveurs (preuve faible) : sable 3, pierre-concassee 3, asphalte 2, gravier 2, gravier-0-3-4 2, pierre 2, poussiere-de-pierre 2, roche 1
- P1 : remblai, dompe (existe), recherche-point-de-depot, ville (existe)
- P3 : transport-vrac, sable (existe), pierre-concassee, roche, asphalte (existe), gravier (existe), gravier-0-3-4, pierre, poussiere-de-pierre (existe)
- **À créer (P1/P2) : 2** — remblai, recherche-point-de-depot
- Prudence cannibalisation : dompe vs point de dépôt
- Justification : 4 demandes réelles rattachées, toutes du même type; familles limitées à ce que ces demandes prouvent.

### Saint-Colomban — Classe B · Priorité 2

- Région / MRC : Québec / —
- Demandes : **4** — types : remblai 4 — rattachement : territoire 4
- Chantiers : non disponibles par ville
- Pages existantes (3) : dompe, sable, ville
- Matériaux acceptés par les sites receveurs (preuve faible) : sable 1
- P1 : remblai, dompe (existe), recherche-point-de-depot, ville (existe)
- P3 : transport-vrac, sable (existe)
- **À créer (P1/P2) : 2** — remblai, recherche-point-de-depot
- Prudence cannibalisation : dompe vs point de dépôt
- Justification : 4 demandes réelles rattachées, toutes du même type; familles limitées à ce que ces demandes prouvent.

### Saint-Georges — Classe A · Priorité 1

- Région / MRC : Québec / —
- Demandes : **4** — types : remblai 2, vrac 1, demande JSC 1 — rattachement : territoire 3, municipalité 1
- Chantiers : non disponibles par ville
- Pages existantes (2) : dompe, ville
- Matériaux acceptés par les sites receveurs (preuve faible) : gravier-0-3-4 1, pierre 1, pierre-concassee 1
- P1 : remblai, dompe (existe), recherche-point-de-depot, transport-vrac, ville (existe)
- P2 : courtage-materiaux, livraison-pierre, gravier-0-3-4, pierre, pierre-concassee
- **À créer (P1/P2) : 8** — remblai, recherche-point-de-depot, transport-vrac, courtage-materiaux, livraison-pierre, gravier-0-3-4, pierre, pierre-concassee
- Prudence cannibalisation : ville vs livraison, transport vs livraison, matériau vs livraison (pierre), dompe vs point de dépôt
- Justification : 4 demandes réelles rattachées, plusieurs types; familles limitées à ce que ces demandes prouvent.

### Saint-Janvier-de-Joly — Classe B · Priorité 2

- Région / MRC : Québec / —
- Demandes : **4** — types : remblai 4 — rattachement : territoire 4
- Chantiers : non disponibles par ville
- Pages existantes (4) : dompe, gravier, sable, ville
- Matériaux acceptés par les sites receveurs (preuve faible) : sable 2, pierre-concassee 2, gravier 1, gravier-0-3-4 1, pierre 1, roche 1
- P1 : remblai, dompe (existe), recherche-point-de-depot, ville (existe)
- P3 : transport-vrac, sable (existe), gravier (existe), gravier-0-3-4, pierre, pierre-concassee, roche
- **À créer (P1/P2) : 2** — remblai, recherche-point-de-depot
- Prudence cannibalisation : dompe vs point de dépôt
- Justification : 4 demandes réelles rattachées, toutes du même type; familles limitées à ce que ces demandes prouvent.

### Sainte-Hénédine — Classe A · Priorité 1

- Région / MRC : Québec / —
- Demandes : **4** — types : remblai 3, vrac 1 — rattachement : territoire 4
- Chantiers : non disponibles par ville
- Pages existantes (6) : beton, dompe, gravier, poussiere-de-pierre, sable, ville
- Matériaux acceptés par les sites receveurs (preuve faible) : sable 3, gravier 3, gravier-0-3-4 2, pierre 2, pierre-concassee 2, remblai 1, poussiere-de-pierre 1, roche 1, beton 1
- P1 : remblai, dompe (existe), recherche-point-de-depot, ville (existe)
- P2 : transport-vrac, courtage-materiaux, livraison-sable, sable (existe)
- P3 : gravier (existe), gravier-0-3-4, pierre, pierre-concassee, poussiere-de-pierre (existe), roche, beton (existe)
- **À créer (P1/P2) : 5** — remblai, recherche-point-de-depot, transport-vrac, courtage-materiaux, livraison-sable
- Prudence cannibalisation : ville vs livraison, transport vs livraison, matériau vs livraison (sable), dompe vs point de dépôt
- Justification : 4 demandes réelles rattachées, plusieurs types; familles limitées à ce que ces demandes prouvent.

### Trois-Rivières — Classe A · Priorité 1

- Région / MRC : Québec / —
- Demandes : **4** — types : remblai 3, demande JSC 1 — rattachement : territoire 3, municipalité 1
- Chantiers : non disponibles par ville
- Pages existantes (4) : dompe, gravier, terre-tamisee, ville
- Matériaux acceptés par les sites receveurs (preuve faible) : terre-tamisee 1, gravier 1, gravier-0-3-4 1, pierre 1, pierre-concassee 1
- P1 : remblai, dompe (existe), recherche-point-de-depot, transport-vrac, ville (existe)
- P2 : courtage-materiaux, livraison-terre
- P3 : terre-tamisee (existe), gravier (existe), gravier-0-3-4, pierre, pierre-concassee
- **À créer (P1/P2) : 5** — remblai, recherche-point-de-depot, transport-vrac, courtage-materiaux, livraison-terre
- Prudence cannibalisation : ville vs livraison, transport vs livraison, dompe vs point de dépôt
- Justification : 4 demandes réelles rattachées, plusieurs types; familles limitées à ce que ces demandes prouvent.

### Adstock — Classe B · Priorité 2

- Région / MRC : Québec / —
- Demandes : **3** — types : remblai 3 — rattachement : territoire 3
- Chantiers : non disponibles par ville
- Pages existantes (6) : asphalte, dompe, gravier, poussiere-de-pierre, sable, ville
- Matériaux acceptés par les sites receveurs (preuve faible) : gravier-0-3-4 3, pierre 3, pierre-concassee 3, sable 2, gravier 2, poussiere-de-pierre 2, roche 2, asphalte 1
- P1 : remblai, dompe (existe), recherche-point-de-depot, ville (existe)
- P3 : transport-vrac, sable (existe), gravier (existe), gravier-0-3-4, pierre, pierre-concassee, poussiere-de-pierre (existe), roche, asphalte (existe)
- **À créer (P1/P2) : 2** — remblai, recherche-point-de-depot
- Prudence cannibalisation : dompe vs point de dépôt
- Justification : 3 demandes réelles rattachées, toutes du même type; familles limitées à ce que ces demandes prouvent.

### Bécancour — Classe B · Priorité 2

- Région / MRC : Québec / —
- Demandes : **3** — types : remblai 3 — rattachement : territoire 3
- Chantiers : non disponibles par ville
- Pages existantes (2) : recherche-point-de-depot, ville
- P1 : remblai, dompe, recherche-point-de-depot (existe), transport-vrac, ville (existe)
- **À créer (P1/P2) : 3** — remblai, dompe, transport-vrac
- Prudence cannibalisation : dompe vs point de dépôt
- Justification : 3 demandes réelles rattachées, toutes du même type; familles limitées à ce que ces demandes prouvent.

### Saint-Antoine-de-Tilly — Classe A · Priorité 1

- Région / MRC : Québec / —
- Demandes : **3** — types : remblai 2, vrac 1 — rattachement : territoire 3
- Chantiers : non disponibles par ville
- Pages existantes (5) : dompe, gravier, poussiere-de-pierre, sable, ville
- Matériaux acceptés par les sites receveurs (preuve faible) : sable 2, gravier 2, gravier-0-3-4 2, pierre 2, pierre-concassee 2, poussiere-de-pierre 2
- P1 : remblai, dompe (existe), recherche-point-de-depot, ville (existe)
- P2 : transport-vrac, courtage-materiaux, livraison-terre
- P3 : sable (existe), gravier (existe), gravier-0-3-4, pierre, pierre-concassee, poussiere-de-pierre (existe)
- **À créer (P1/P2) : 5** — remblai, recherche-point-de-depot, transport-vrac, courtage-materiaux, livraison-terre
- Prudence cannibalisation : ville vs livraison, transport vs livraison, dompe vs point de dépôt
- Justification : 3 demandes réelles rattachées, plusieurs types; familles limitées à ce que ces demandes prouvent.

### Saint-Benoît-Labre — Classe B · Priorité 2

- Région / MRC : Chaudière-Appalaches / —
- Demandes : **3** — types : remblai 3 — rattachement : territoire 3
- Chantiers : non disponibles par ville
- Pages existantes (3) : asphalte, dompe, ville
- Matériaux acceptés par les sites receveurs (preuve faible) : asphalte 1, gravier-0-3-4 1, pierre 1, pierre-concassee 1
- P1 : remblai, dompe (existe), recherche-point-de-depot, ville (existe)
- P3 : transport-vrac, asphalte (existe), gravier-0-3-4, pierre, pierre-concassee
- **À créer (P1/P2) : 2** — remblai, recherche-point-de-depot
- Prudence cannibalisation : dompe vs point de dépôt
- Justification : 3 demandes réelles rattachées, toutes du même type; familles limitées à ce que ces demandes prouvent.

### Saint-Elzéar — Classe B · Priorité 2

- Région / MRC : Québec / —
- Demandes : **3** — types : remblai 3 — rattachement : territoire 3
- Chantiers : non disponibles par ville
- Pages existantes (6) : asphalte, dompe, gravier, poussiere-de-pierre, sable, ville
- Matériaux acceptés par les sites receveurs (preuve faible) : gravier 1, sable 1, gravier-0-3-4 1, pierre 1, pierre-concassee 1, poussiere-de-pierre 1, asphalte 1
- P1 : remblai, dompe (existe), recherche-point-de-depot, ville (existe)
- P3 : transport-vrac, gravier (existe), sable (existe), gravier-0-3-4, pierre, pierre-concassee, poussiere-de-pierre (existe), asphalte (existe)
- **À créer (P1/P2) : 2** — remblai, recherche-point-de-depot
- Prudence cannibalisation : dompe vs point de dépôt
- Justification : 3 demandes réelles rattachées, toutes du même type; familles limitées à ce que ces demandes prouvent.

### Saint-Félix-de-Valois — Classe B · Priorité 2

- Région / MRC : Québec / —
- Demandes : **3** — types : remblai 3 — rattachement : territoire 3
- Chantiers : non disponibles par ville
- Pages existantes (3) : dompe, sable, ville
- Matériaux acceptés par les sites receveurs (preuve faible) : sable 1, pierre-concassee 1, roche 1
- P1 : remblai, dompe (existe), recherche-point-de-depot, ville (existe)
- P3 : transport-vrac, sable (existe), pierre-concassee, roche
- **À créer (P1/P2) : 2** — remblai, recherche-point-de-depot
- Prudence cannibalisation : dompe vs point de dépôt
- Justification : 3 demandes réelles rattachées, toutes du même type; familles limitées à ce que ces demandes prouvent.

### Saint-Gervais — Classe B · Priorité 2

- Région / MRC : Chaudière-Appalaches / Bellechasse
- Demandes : **3** — types : remblai 3 — rattachement : territoire 3
- Chantiers : non disponibles par ville
- Pages existantes (3) : dompe, sable, ville
- Matériaux acceptés par les sites receveurs (preuve faible) : sable 3, pierre-concassee 1, roche 1
- P1 : remblai, dompe (existe), recherche-point-de-depot, ville (existe)
- P3 : transport-vrac, sable (existe), pierre-concassee, roche
- **À créer (P1/P2) : 2** — remblai, recherche-point-de-depot
- Prudence cannibalisation : dompe vs point de dépôt
- Justification : 3 demandes réelles rattachées, toutes du même type; familles limitées à ce que ces demandes prouvent.

### Saint-Simon-les-Mines — Classe B · Priorité 2

- Région / MRC : Québec / —
- Demandes : **3** — types : remblai 3 — rattachement : territoire 3
- Chantiers : non disponibles par ville
- Pages existantes (6) : asphalte, dompe, gravier, poussiere-de-pierre, sable, ville
- Matériaux acceptés par les sites receveurs (preuve faible) : gravier 2, gravier-0-3-4 2, pierre 2, pierre-concassee 2, sable 1, poussiere-de-pierre 1, asphalte 1
- P1 : remblai, dompe (existe), recherche-point-de-depot, ville (existe)
- P3 : transport-vrac, sable (existe), gravier (existe), gravier-0-3-4, pierre, pierre-concassee, poussiere-de-pierre (existe), asphalte (existe)
- **À créer (P1/P2) : 2** — remblai, recherche-point-de-depot
- Prudence cannibalisation : dompe vs point de dépôt
- Justification : 3 demandes réelles rattachées, toutes du même type; familles limitées à ce que ces demandes prouvent.

### Saint-Théophile — Classe B · Priorité 2

- Région / MRC : Chaudière-Appalaches / —
- Demandes : **3** — types : remblai 3 — rattachement : territoire 3
- Chantiers : non disponibles par ville
- Pages existantes (6) : beton, dompe, gravier, poussiere-de-pierre, sable, ville
- Matériaux acceptés par les sites receveurs (preuve faible) : pierre-concassee 2, roche 1, sable 1, gravier 1, gravier-0-3-4 1, pierre 1, poussiere-de-pierre 1, beton 1
- P1 : remblai, dompe (existe), recherche-point-de-depot, ville (existe)
- P3 : transport-vrac, pierre-concassee, roche, sable (existe), gravier (existe), gravier-0-3-4, pierre, poussiere-de-pierre (existe), beton (existe)
- **À créer (P1/P2) : 2** — remblai, recherche-point-de-depot
- Prudence cannibalisation : dompe vs point de dépôt
- Justification : 3 demandes réelles rattachées, toutes du même type; familles limitées à ce que ces demandes prouvent.

### Sainte-Julienne — Classe B · Priorité 2

- Région / MRC : Québec / —
- Demandes : **3** — types : remblai 3 — rattachement : territoire 3
- Chantiers : non disponibles par ville
- Pages existantes (3) : dompe, sable, ville
- Matériaux acceptés par les sites receveurs (preuve faible) : sable 1
- P1 : remblai, dompe (existe), recherche-point-de-depot, ville (existe)
- P3 : transport-vrac, sable (existe)
- **À créer (P1/P2) : 2** — remblai, recherche-point-de-depot
- Prudence cannibalisation : dompe vs point de dépôt
- Justification : 3 demandes réelles rattachées, toutes du même type; familles limitées à ce que ces demandes prouvent.

### Sainte-Marguerite — Classe B · Priorité 2

- Région / MRC : Québec / —
- Demandes : **3** — types : remblai 3 — rattachement : territoire 3
- Chantiers : non disponibles par ville
- Pages existantes (5) : dompe, gravier, poussiere-de-pierre, sable, ville
- Matériaux acceptés par les sites receveurs (preuve faible) : sable 2, gravier 1, gravier-0-3-4 1, pierre 1, pierre-concassee 1, poussiere-de-pierre 1
- P1 : remblai, dompe (existe), recherche-point-de-depot, ville (existe)
- P3 : transport-vrac, sable (existe), gravier (existe), gravier-0-3-4, pierre, pierre-concassee, poussiere-de-pierre (existe)
- **À créer (P1/P2) : 2** — remblai, recherche-point-de-depot
- Prudence cannibalisation : dompe vs point de dépôt
- Justification : 3 demandes réelles rattachées, toutes du même type; familles limitées à ce que ces demandes prouvent.

### Sainte-Émélie-de-l'Énergie — Classe B · Priorité 2

- Région / MRC : Québec / —
- Demandes : **3** — types : remblai 3 — rattachement : territoire 3
- Chantiers : non disponibles par ville
- Pages existantes (7) : asphalte, beton, dompe, gravier, poussiere-de-pierre, sable, ville
- Matériaux acceptés par les sites receveurs (preuve faible) : sable 3, gravier 3, gravier-0-3-4 3, pierre 3, pierre-concassee 3, roche 3, poussiere-de-pierre 2, beton 1, asphalte 1
- P1 : remblai, dompe (existe), recherche-point-de-depot, ville (existe)
- P3 : transport-vrac, sable (existe), gravier (existe), gravier-0-3-4, pierre, pierre-concassee, roche, poussiere-de-pierre (existe), beton (existe), asphalte (existe)
- **À créer (P1/P2) : 2** — remblai, recherche-point-de-depot
- Prudence cannibalisation : dompe vs point de dépôt
- Justification : 3 demandes réelles rattachées, toutes du même type; familles limitées à ce que ces demandes prouvent.

### Shawinigan — Classe B · Priorité 2

- Région / MRC : Québec / —
- Demandes : **3** — types : remblai 3 — rattachement : territoire 3
- Chantiers : non disponibles par ville
- Pages existantes (3) : dompe, sable, ville
- Matériaux acceptés par les sites receveurs (preuve faible) : gravier-0-3-4 1, pierre 1, pierre-concassee 1, sable 1
- P1 : remblai, dompe (existe), recherche-point-de-depot, ville (existe)
- P3 : transport-vrac, gravier-0-3-4, pierre, pierre-concassee, sable (existe)
- **À créer (P1/P2) : 2** — remblai, recherche-point-de-depot
- Prudence cannibalisation : dompe vs point de dépôt
- Justification : 3 demandes réelles rattachées, toutes du même type; familles limitées à ce que ces demandes prouvent.

### Villeroy — Classe B · Priorité 2

- Région / MRC : Québec / —
- Demandes : **3** — types : remblai 3 — rattachement : territoire 3
- Chantiers : non disponibles par ville
- Pages existantes (3) : dompe, sable, ville
- Matériaux acceptés par les sites receveurs (preuve faible) : pierre-concassee 2, gravier-0-3-4 1, pierre 1, sable 1, roche 1
- P1 : remblai, dompe (existe), recherche-point-de-depot, ville (existe)
- P3 : transport-vrac, gravier-0-3-4, pierre, pierre-concassee, sable (existe), roche
- **À créer (P1/P2) : 2** — remblai, recherche-point-de-depot
- Prudence cannibalisation : dompe vs point de dépôt
- Justification : 3 demandes réelles rattachées, toutes du même type; familles limitées à ce que ces demandes prouvent.

### Beauceville — Classe B · Priorité 3

- Région / MRC : Québec / —
- Demandes : **2** — types : remblai 2 — rattachement : territoire 2
- Chantiers : non disponibles par ville
- Pages existantes (3) : dompe, sable, ville
- Matériaux acceptés par les sites receveurs (preuve faible) : sable 1
- P1 : remblai, dompe (existe), recherche-point-de-depot, ville (existe)
- P3 : transport-vrac, sable (existe)
- **À créer (P1/P2) : 2** — remblai, recherche-point-de-depot
- Prudence cannibalisation : dompe vs point de dépôt
- Justification : 2 demandes réelles rattachées, toutes du même type; familles limitées à ce que ces demandes prouvent.

### Disraeli — Classe B · Priorité 3

- Région / MRC : Québec / —
- Demandes : **2** — types : remblai 2 — rattachement : territoire 2
- Chantiers : non disponibles par ville
- Pages existantes (3) : dompe, sable, ville
- Matériaux acceptés par les sites receveurs (preuve faible) : sable 1, pierre-concassee 1, roche 1
- P1 : remblai, dompe (existe), recherche-point-de-depot, ville (existe)
- P3 : transport-vrac, sable (existe), pierre-concassee, roche
- **À créer (P1/P2) : 2** — remblai, recherche-point-de-depot
- Prudence cannibalisation : dompe vs point de dépôt
- Justification : 2 demandes réelles rattachées, toutes du même type; familles limitées à ce que ces demandes prouvent.

### East Broughton — Classe B · Priorité 3

- Région / MRC : Québec / —
- Demandes : **2** — types : remblai 2 — rattachement : territoire 2
- Chantiers : non disponibles par ville
- Pages existantes (5) : dompe, gravier, poussiere-de-pierre, sable, ville
- Matériaux acceptés par les sites receveurs (preuve faible) : sable 2, gravier 2, gravier-0-3-4 2, pierre 2, pierre-concassee 2, poussiere-de-pierre 2, roche 2
- P1 : remblai, dompe (existe), recherche-point-de-depot, ville (existe)
- P3 : transport-vrac, sable (existe), gravier (existe), gravier-0-3-4, pierre, pierre-concassee, poussiere-de-pierre (existe), roche
- **À créer (P1/P2) : 2** — remblai, recherche-point-de-depot
- Prudence cannibalisation : dompe vs point de dépôt
- Justification : 2 demandes réelles rattachées, toutes du même type; familles limitées à ce que ces demandes prouvent.

### Frampton — Classe B · Priorité 3

- Région / MRC : Chaudière-Appalaches / La Nouvelle-Beauce
- Demandes : **2** — types : remblai 2 — rattachement : territoire 2
- Chantiers : non disponibles par ville
- Pages existantes (6) : beton, dompe, gravier, poussiere-de-pierre, sable, ville
- Matériaux acceptés par les sites receveurs (preuve faible) : sable 1, gravier 1, gravier-0-3-4 1, pierre 1, pierre-concassee 1, poussiere-de-pierre 1, roche 1, beton 1
- P1 : remblai, dompe (existe), recherche-point-de-depot, ville (existe)
- P3 : transport-vrac, sable (existe), gravier (existe), gravier-0-3-4, pierre, pierre-concassee, poussiere-de-pierre (existe), roche, beton (existe)
- **À créer (P1/P2) : 2** — remblai, recherche-point-de-depot
- Prudence cannibalisation : dompe vs point de dépôt
- Justification : 2 demandes réelles rattachées, toutes du même type; familles limitées à ce que ces demandes prouvent.

### Lac-Etchemin — Classe B · Priorité 3

- Région / MRC : Québec / —
- Demandes : **2** — types : remblai 2 — rattachement : territoire 2
- Chantiers : non disponibles par ville
- Pages existantes (3) : dompe, poussiere-de-pierre, ville
- Matériaux acceptés par les sites receveurs (preuve faible) : pierre 1, poussiere-de-pierre 1
- P1 : remblai, dompe (existe), recherche-point-de-depot, ville (existe)
- P3 : transport-vrac, pierre, poussiere-de-pierre (existe)
- **À créer (P1/P2) : 2** — remblai, recherche-point-de-depot
- Prudence cannibalisation : dompe vs point de dépôt
- Justification : 2 demandes réelles rattachées, toutes du même type; familles limitées à ce que ces demandes prouvent.

### Laval — Classe B · Priorité 3

- Région / MRC : Québec / —
- Demandes : **2** — types : remblai 2 — rattachement : territoire 2
- Chantiers : non disponibles par ville
- Pages existantes (3) : dompe, recherche-point-de-depot, ville
- P1 : remblai, dompe (existe), recherche-point-de-depot (existe), ville (existe)
- P2 : transport-vrac
- **À créer (P1/P2) : 2** — remblai, transport-vrac
- Prudence cannibalisation : dompe vs point de dépôt
- Justification : 2 demandes réelles rattachées, toutes du même type; familles limitées à ce que ces demandes prouvent.

### Montmagny — Classe B · Priorité 3

- Région / MRC : Chaudière-Appalaches / Montmagny
- Demandes : **2** — types : remblai 2 — rattachement : territoire 2
- Chantiers : non disponibles par ville
- Pages existantes (2) : dompe, ville
- P1 : remblai, dompe (existe), recherche-point-de-depot, ville (existe)
- P3 : transport-vrac
- **À créer (P1/P2) : 2** — remblai, recherche-point-de-depot
- Prudence cannibalisation : dompe vs point de dépôt
- Justification : 2 demandes réelles rattachées, toutes du même type; familles limitées à ce que ces demandes prouvent.

### Notre-Dame-du-Mont-Carmel — Classe B · Priorité 3

- Région / MRC : Québec / —
- Demandes : **2** — types : remblai 1, vrac 1 — rattachement : territoire 2
- Chantiers : non disponibles par ville
- Pages existantes (5) : dompe, gravier, poussiere-de-pierre, sable, ville
- Matériaux acceptés par les sites receveurs (preuve faible) : sable 1, gravier 1, gravier-0-3-4 1, pierre 1, pierre-concassee 1, poussiere-de-pierre 1, roche 1
- P1 : ville (existe)
- P2 : remblai, dompe (existe), recherche-point-de-depot, transport-vrac, courtage-materiaux, livraison-pierre, gravier-0-3-4, pierre, pierre-concassee
- P3 : sable (existe), gravier (existe), poussiere-de-pierre (existe), roche
- **À créer (P1/P2) : 8** — remblai, recherche-point-de-depot, transport-vrac, courtage-materiaux, livraison-pierre, gravier-0-3-4, pierre, pierre-concassee
- Prudence cannibalisation : ville vs livraison, transport vs livraison, matériau vs livraison (pierre), dompe vs point de dépôt
- Justification : 2 demandes réelles rattachées, plusieurs types; familles limitées à ce que ces demandes prouvent.

### Saint-Anselme — Classe B · Priorité 3

- Région / MRC : Québec / —
- Demandes : **2** — types : remblai 2 — rattachement : territoire 2
- Chantiers : non disponibles par ville
- Pages existantes (2) : dompe, ville
- P1 : remblai, dompe (existe), recherche-point-de-depot, ville (existe)
- P3 : transport-vrac
- **À créer (P1/P2) : 2** — remblai, recherche-point-de-depot
- Prudence cannibalisation : dompe vs point de dépôt
- Justification : 2 demandes réelles rattachées, toutes du même type; familles limitées à ce que ces demandes prouvent.

### Saint-Basile — Classe B · Priorité 3

- Région / MRC : Québec / —
- Demandes : **2** — types : remblai 2 — rattachement : territoire 2
- Chantiers : non disponibles par ville
- Pages existantes (7) : asphalte, beton, dompe, gravier, poussiere-de-pierre, sable, ville
- Matériaux acceptés par les sites receveurs (preuve faible) : sable 2, pierre-concassee 2, roche 2, gravier 1, gravier-0-3-4 1, pierre 1, poussiere-de-pierre 1, beton 1, asphalte 1
- P1 : remblai, dompe (existe), recherche-point-de-depot, ville (existe)
- P3 : transport-vrac, sable (existe), gravier (existe), gravier-0-3-4, pierre, pierre-concassee, poussiere-de-pierre (existe), roche, beton (existe), asphalte (existe)
- **À créer (P1/P2) : 2** — remblai, recherche-point-de-depot
- Prudence cannibalisation : dompe vs point de dépôt
- Justification : 2 demandes réelles rattachées, toutes du même type; familles limitées à ce que ces demandes prouvent.

### Saint-Calixte-de-Kilkenny — Classe B · Priorité 3

- Région / MRC : Québec / —
- Demandes : **2** — types : remblai 2 — rattachement : territoire 2
- Chantiers : non disponibles par ville
- Pages existantes (6) : beton, dompe, gravier, poussiere-de-pierre, sable, ville
- Matériaux acceptés par les sites receveurs (preuve faible) : sable 1, gravier 1, gravier-0-3-4 1, pierre 1, pierre-concassee 1, poussiere-de-pierre 1, roche 1, beton 1
- P1 : remblai, dompe (existe), recherche-point-de-depot, ville (existe)
- P3 : transport-vrac, sable (existe), gravier (existe), gravier-0-3-4, pierre, pierre-concassee, poussiere-de-pierre (existe), roche, beton (existe)
- **À créer (P1/P2) : 2** — remblai, recherche-point-de-depot
- Prudence cannibalisation : dompe vs point de dépôt
- Justification : 2 demandes réelles rattachées, toutes du même type; familles limitées à ce que ces demandes prouvent.

### Saint-Flavien — Classe B · Priorité 3

- Région / MRC : Québec / —
- Demandes : **2** — types : remblai 2 — rattachement : territoire 2
- Chantiers : non disponibles par ville
- Pages existantes (7) : asphalte, beton, dompe, gravier, poussiere-de-pierre, sable, ville
- Matériaux acceptés par les sites receveurs (preuve faible) : sable 2, gravier 2, gravier-0-3-4 2, pierre 2, pierre-concassee 2, poussiere-de-pierre 2, beton 1, roche 1, asphalte 1
- P1 : remblai, dompe (existe), recherche-point-de-depot, ville (existe)
- P3 : transport-vrac, sable (existe), gravier (existe), gravier-0-3-4, pierre, pierre-concassee, poussiere-de-pierre (existe), beton (existe), roche, asphalte (existe)
- **À créer (P1/P2) : 2** — remblai, recherche-point-de-depot
- Prudence cannibalisation : dompe vs point de dépôt
- Justification : 2 demandes réelles rattachées, toutes du même type; familles limitées à ce que ces demandes prouvent.

### Saint-Jérôme — Classe B · Priorité 3

- Région / MRC : Québec / —
- Demandes : **2** — types : remblai 2 — rattachement : territoire 2
- Chantiers : non disponibles par ville
- Pages existantes (3) : dompe, sable, ville
- Matériaux acceptés par les sites receveurs (preuve faible) : sable 1
- P1 : remblai, dompe (existe), recherche-point-de-depot, ville (existe)
- P2 : transport-vrac
- P3 : sable (existe)
- **À créer (P1/P2) : 3** — remblai, recherche-point-de-depot, transport-vrac
- Prudence cannibalisation : dompe vs point de dépôt
- Justification : 2 demandes réelles rattachées, toutes du même type; familles limitées à ce que ces demandes prouvent.

### Saint-Lazare-de-Bellechasse — Classe B · Priorité 3

- Région / MRC : Chaudière-Appalaches / Bellechasse
- Demandes : **2** — types : remblai 2 — rattachement : territoire 2
- Chantiers : non disponibles par ville
- Pages existantes (2) : dompe, ville
- P1 : remblai, dompe (existe), recherche-point-de-depot, ville (existe)
- P3 : transport-vrac
- **À créer (P1/P2) : 2** — remblai, recherche-point-de-depot
- Prudence cannibalisation : dompe vs point de dépôt
- Justification : 2 demandes réelles rattachées, toutes du même type; familles limitées à ce que ces demandes prouvent.

### Saint-Maurice — Classe B · Priorité 3

- Région / MRC : Québec / —
- Demandes : **2** — types : remblai 2 — rattachement : territoire 2
- Chantiers : non disponibles par ville
- Pages existantes (2) : dompe, ville
- Matériaux acceptés par les sites receveurs (preuve faible) : gravier-0-3-4 1, pierre 1, pierre-concassee 1
- P1 : remblai, dompe (existe), recherche-point-de-depot, ville (existe)
- P3 : transport-vrac, gravier-0-3-4, pierre, pierre-concassee
- **À créer (P1/P2) : 2** — remblai, recherche-point-de-depot
- Prudence cannibalisation : dompe vs point de dépôt
- Justification : 2 demandes réelles rattachées, toutes du même type; familles limitées à ce que ces demandes prouvent.

### Saint-Michel-de-Bellechasse — Classe B · Priorité 3

- Région / MRC : Chaudière-Appalaches / Bellechasse
- Demandes : **2** — types : remblai 2 — rattachement : territoire 2
- Chantiers : non disponibles par ville
- Pages existantes (3) : dompe, sable, ville
- Matériaux acceptés par les sites receveurs (preuve faible) : sable 1, roche 1
- P1 : remblai, dompe (existe), recherche-point-de-depot, ville (existe)
- P3 : transport-vrac, sable (existe), roche
- **À créer (P1/P2) : 2** — remblai, recherche-point-de-depot
- Prudence cannibalisation : dompe vs point de dépôt
- Justification : 2 demandes réelles rattachées, toutes du même type; familles limitées à ce que ces demandes prouvent.

### Saint-Philémon — Classe B · Priorité 3

- Région / MRC : Québec / —
- Demandes : **2** — types : remblai 2 — rattachement : territoire 2
- Chantiers : non disponibles par ville
- Pages existantes (4) : dompe, gravier, sable, ville
- Matériaux acceptés par les sites receveurs (preuve faible) : pierre-concassee 2, sable 1, roche 1, gravier 1, gravier-0-3-4 1, pierre 1
- P1 : remblai, dompe (existe), recherche-point-de-depot, ville (existe)
- P3 : transport-vrac, sable (existe), pierre-concassee, roche, gravier (existe), gravier-0-3-4, pierre
- **À créer (P1/P2) : 2** — remblai, recherche-point-de-depot
- Prudence cannibalisation : dompe vs point de dépôt
- Justification : 2 demandes réelles rattachées, toutes du même type; familles limitées à ce que ces demandes prouvent.

### Saint-Prosper-de-Champlain — Classe B · Priorité 3

- Région / MRC : Mauricie / Les Chenaux
- Demandes : **2** — types : remblai 2 — rattachement : territoire 2
- Chantiers : non disponibles par ville
- Pages existantes (5) : asphalte, gravier, poussiere-de-pierre, sable, ville
- Matériaux acceptés par les sites receveurs (preuve faible) : gravier-0-3-4 2, pierre 2, pierre-concassee 2, sable 1, gravier 1, poussiere-de-pierre 1, asphalte 1
- P1 : remblai, dompe, recherche-point-de-depot, ville (existe)
- P3 : transport-vrac, gravier-0-3-4, pierre, pierre-concassee, sable (existe), gravier (existe), poussiere-de-pierre (existe), asphalte (existe)
- **À créer (P1/P2) : 3** — remblai, dompe, recherche-point-de-depot
- Prudence cannibalisation : dompe vs point de dépôt
- Justification : 2 demandes réelles rattachées, toutes du même type; familles limitées à ce que ces demandes prouvent.

### Saint-René — Classe B · Priorité 3

- Région / MRC : Québec / —
- Demandes : **2** — types : remblai 2 — rattachement : territoire 2
- Chantiers : non disponibles par ville
- Pages existantes (3) : dompe, sable, ville
- Matériaux acceptés par les sites receveurs (preuve faible) : gravier-0-3-4 2, pierre 2, pierre-concassee 2, sable 1
- P1 : remblai, dompe (existe), recherche-point-de-depot, ville (existe)
- P3 : transport-vrac, sable (existe), gravier-0-3-4, pierre, pierre-concassee
- **À créer (P1/P2) : 2** — remblai, recherche-point-de-depot
- Prudence cannibalisation : dompe vs point de dépôt
- Justification : 2 demandes réelles rattachées, toutes du même type; familles limitées à ce que ces demandes prouvent.

### Sainte-Christine-d'Auvergne — Classe B · Priorité 3

- Région / MRC : Capitale-Nationale / Portneuf
- Demandes : **2** — types : remblai 2 — rattachement : territoire 2
- Chantiers : non disponibles par ville
- Pages existantes (3) : dompe, sable, ville
- Matériaux acceptés par les sites receveurs (preuve faible) : sable 2, pierre-concassee 1, roche 1
- P1 : remblai, dompe (existe), recherche-point-de-depot, ville (existe)
- P3 : transport-vrac, sable (existe), pierre-concassee, roche
- **À créer (P1/P2) : 2** — remblai, recherche-point-de-depot
- Prudence cannibalisation : dompe vs point de dépôt
- Justification : 2 demandes réelles rattachées, toutes du même type; familles limitées à ce que ces demandes prouvent.

### Sainte-Croix — Classe B · Priorité 3

- Région / MRC : Chaudière-Appalaches / Lotbinière
- Demandes : **2** — types : vrac 2 — rattachement : territoire 2
- Chantiers : non disponibles par ville
- Pages existantes (2) : sable, ville
- P1 : transport-vrac, courtage-materiaux, ville (existe)
- P2 : livraison-sable, sable (existe), livraison-terre, remblai
- **À créer (P1/P2) : 5** — transport-vrac, courtage-materiaux, livraison-sable, livraison-terre, remblai
- Prudence cannibalisation : ville vs livraison, transport vs livraison, matériau vs livraison (sable)
- Justification : 2 demandes réelles rattachées, toutes du même type; familles limitées à ce que ces demandes prouvent.

### Sainte-Sophie-de-Lévrard — Classe B · Priorité 3

- Région / MRC : Centre-du-Québec / Bécancour
- Demandes : **2** — types : remblai 2 — rattachement : territoire 2
- Chantiers : non disponibles par ville
- Pages existantes (5) : dompe, gravier, pierre, sable, ville
- Matériaux acceptés par les sites receveurs (preuve faible) : sable 1, gravier 1, pierre 1
- P1 : remblai, dompe (existe), recherche-point-de-depot, ville (existe)
- P3 : transport-vrac, sable (existe), gravier (existe), pierre (existe)
- **À créer (P1/P2) : 2** — remblai, recherche-point-de-depot
- Prudence cannibalisation : dompe vs point de dépôt
- Justification : 2 demandes réelles rattachées, toutes du même type; familles limitées à ce que ces demandes prouvent.

### Saints-Anges — Classe B · Priorité 3

- Région / MRC : Québec / —
- Demandes : **2** — types : remblai 2 — rattachement : territoire 2
- Chantiers : non disponibles par ville
- Pages existantes (7) : asphalte, beton, dompe, gravier, poussiere-de-pierre, sable, ville
- Matériaux acceptés par les sites receveurs (preuve faible) : sable 2, gravier 2, gravier-0-3-4 2, pierre 2, pierre-concassee 2, poussiere-de-pierre 2, roche 2, beton 2, asphalte 2
- P1 : remblai, dompe (existe), recherche-point-de-depot, ville (existe)
- P3 : transport-vrac, sable (existe), gravier (existe), gravier-0-3-4, pierre, pierre-concassee, poussiere-de-pierre (existe), roche, beton (existe), asphalte (existe)
- **À créer (P1/P2) : 2** — remblai, recherche-point-de-depot
- Prudence cannibalisation : dompe vs point de dépôt
- Justification : 2 demandes réelles rattachées, toutes du même type; familles limitées à ce que ces demandes prouvent.

### Val-Alain — Classe B · Priorité 3

- Région / MRC : Québec / —
- Demandes : **2** — types : remblai 2 — rattachement : territoire 2
- Chantiers : non disponibles par ville
- Pages existantes (2) : dompe, ville
- Matériaux acceptés par les sites receveurs (preuve faible) : gravier-0-3-4 1, pierre 1, pierre-concassee 1
- P1 : remblai, dompe (existe), recherche-point-de-depot, ville (existe)
- P3 : transport-vrac, gravier-0-3-4, pierre, pierre-concassee
- **À créer (P1/P2) : 2** — remblai, recherche-point-de-depot
- Prudence cannibalisation : dompe vs point de dépôt
- Justification : 2 demandes réelles rattachées, toutes du même type; familles limitées à ce que ces demandes prouvent.

### Val-David — Classe B · Priorité 3

- Région / MRC : Québec / —
- Demandes : **2** — types : remblai 2 — rattachement : territoire 2
- Chantiers : non disponibles par ville
- Pages existantes (2) : dompe, ville
- P1 : remblai, dompe (existe), recherche-point-de-depot, ville (existe)
- P3 : transport-vrac
- **À créer (P1/P2) : 2** — remblai, recherche-point-de-depot
- Prudence cannibalisation : dompe vs point de dépôt
- Justification : 2 demandes réelles rattachées, toutes du même type; familles limitées à ce que ces demandes prouvent.

### Wentworth-Nord — Classe B · Priorité 3

- Région / MRC : Québec / —
- Demandes : **2** — types : remblai 2 — rattachement : territoire 2
- Chantiers : non disponibles par ville
- Pages existantes (2) : dompe, ville
- P1 : remblai, dompe (existe), recherche-point-de-depot, ville (existe)
- P3 : transport-vrac
- **À créer (P1/P2) : 2** — remblai, recherche-point-de-depot
- Prudence cannibalisation : dompe vs point de dépôt
- Justification : 2 demandes réelles rattachées, toutes du même type; familles limitées à ce que ces demandes prouvent.

### Villes C — À valider (aucune famille justifiée pour l'instant)

| Ville | Demandes | Motif |
|---|---|---|
| Berthierville | 1 | 1 seule demande |
| Blainville | 1 | 1 seule demande |
| Bois-des-Filion | 1 | 1 seule demande |
| Brossard | 1 | 1 seule demande |
| Chertsey | 1 | 1 seule demande |
| Contrecoeur | 1 | 1 seule demande |
| Cowansville | 1 | 1 seule demande |
| Deschambault | 1 | 1 seule demande |
| Entrelacs | 1 | 1 seule demande |
| Gore | 1 | 1 seule demande |
| Grand-Saint-Esprit | 1 | 1 seule demande |
| Grenville-sur-la-Rouge | 1 | 1 seule demande |
| Havelock | 1 | 1 seule demande |
| Honfleur | 1 | 1 seule demande |
| Inverness | 1 | 1 seule demande |
| Irlande | 1 | 1 seule demande |
| L'Islet | 1 | 1 seule demande |
| Lantier | 1 | 1 seule demande |
| Leclercville | 1 | 1 seule demande |
| Mandeville | 1 | 1 seule demande |
| Mascouche | 1 | 1 seule demande |
| Mont-Tremblant | 1 | 1 seule demande |
| Notre-Dame-des-Monts | 1 | 1 seule demande |
| Parisville | 1 | 1 seule demande |
| Prévost | 1 | 1 seule demande |
| Racine | 1 | 1 seule demande |
| Rawdon | 1 | 1 seule demande |
| Saguenay | 1 | 1 seule demande |
| Saint-Alban | 1 | 1 seule demande |
| Saint-Alfred | 1 | 1 seule demande |
| Saint-Alphonse-Rodriguez | 1 | 1 seule demande |
| Saint-Antoine-Abbé | 1 | 1 seule demande |
| Saint-Barthélemy | 1 | 1 seule demande |
| Saint-Calixte | 1 | 1 seule demande |
| Saint-Casimir | 1 | 1 seule demande |
| Saint-Chrysostome | 1 | 1 seule demande |
| Saint-Cyrille-de-Lessard | 1 | 1 seule demande |
| Saint-Damase-de-l'Islet | 1 | 1 seule demande |
| Saint-Fabien-de-Panet | 1 | 1 seule demande |
| Saint-François-Xavier-de-Brompton | 1 | 1 seule demande |
| Saint-François-de-la-Rivière-du-Sud | 1 | 1 seule demande |
| Saint-François-du-Lac | 1 | 1 seule demande |
| Saint-Gabriel | 1 | 1 seule demande |
| Saint-Gabriel-de-Brandon | 1 | 1 seule demande |
| Saint-Georges-de-Windsor | 1 | 1 seule demande |
| Saint-Hilarion | 1 | 1 seule demande |
| Saint-Joachim | 1 | 1 seule demande |
| Saint-Jules-de-Beauce | 1 | 1 seule demande |
| Saint-Luc-de-Bellechasse | 1 | 1 seule demande |
| Saint-Magloire | 1 | 1 seule demande |
| Saint-Narcisse-de-Beaurivage | 1 | 1 seule demande |
| Saint-Nazaire-de-Dorchester | 1 | 1 seule demande |
| Saint-Odilon-de-Cranbourne | 1 | 1 seule demande |
| Saint-Philibert | 1 | 1 seule demande |
| Saint-Pierre-de-Broughton | 1 | 1 seule demande |
| Saint-Placide | 1 | 1 seule demande |
| Saint-Raphaël | 1 | 1 seule demande |
| Saint-Sylvestre | 1 | 1 seule demande |
| Saint-Victor | 1 | 1 seule demande |
| Saint-Édouard-de-Lotbinière | 1 | 1 seule demande |
| Saint-Étienne-des-Grès | 1 | 1 seule demande |
| Sainte-Béatrix | 1 | 1 seule demande |
| Sainte-Claire | 1 | 1 seule demande |
| Sainte-Pétronille | 1 | 1 seule demande |
| Sainte-Sophie | 1 | 1 seule demande |
| Sainte-Thècle | 1 | 1 seule demande |
| Stratford | 1 | 1 seule demande |
| Victoriaville | 1 | 1 seule demande |
| Warwick | 1 | 1 seule demande |
| Weedon | 1 | 1 seule demande |
| Windsor | 1 | 1 seule demande |

### Villes D — Ne pas développer pour le moment

Aucune : toutes les villes sans demande sont à ≤ 15 km d'une ville desservie et restent donc « À valider » (C), jamais à développer automatiquement.

## 7. Priorités

- **TOP PRIORITÉ (6)** : Saint-Damien (17), Saint-Agapit (13), Saint-Jean-de-Matha (13), Thetford Mines (12), Saint-Gilles (11), Saint-Henri (10)
- **Priorité 1 (11)** : Saint-Charles-de-Bellechasse (9), Saint-Joseph-de-Beauce (9), Beaumont (8), Saint-Isidore (8), Sainte-Marie (6), Saint-Tite-des-Caps (5), Scott (5), Saint-Georges (4), Sainte-Hénédine (4), Trois-Rivières (4), Saint-Antoine-de-Tilly (3)
- **Priorité 2 (18)** : Cap-Saint-Ignace (4), La Durantaye (4), Notre-Dame-du-Sacré-Coeur-d'Issoudun (4), Saint-Colomban (4), Saint-Janvier-de-Joly (4), Adstock (3), Bécancour (3), Saint-Benoît-Labre (3), Saint-Elzéar (3), Saint-Félix-de-Valois (3), Saint-Gervais (3), Saint-Simon-les-Mines (3), Saint-Théophile (3), Sainte-Julienne (3), Sainte-Marguerite (3), Sainte-Émélie-de-l'Énergie (3), Shawinigan (3), Villeroy (3)
- **Priorité 3 (26)** : Beauceville (2), Disraeli (2), East Broughton (2), Frampton (2), Lac-Etchemin (2), Laval (2), Montmagny (2), Notre-Dame-du-Mont-Carmel (2), Saint-Anselme (2), Saint-Basile (2), Saint-Calixte-de-Kilkenny (2), Saint-Flavien (2), Saint-Jérôme (2), Saint-Lazare-de-Bellechasse (2), Saint-Maurice (2), Saint-Michel-de-Bellechasse (2), Saint-Philémon (2), Saint-Prosper-de-Champlain (2), Saint-René (2), Sainte-Christine-d'Auvergne (2), Sainte-Croix (2), Sainte-Sophie-de-Lévrard (2), Saints-Anges (2), Val-Alain (2), Val-David (2), Wentworth-Nord (2)
- **À valider (71)** : Berthierville (1), Blainville (1), Bois-des-Filion (1), Brossard (1), Chertsey (1), Contrecoeur (1), Cowansville (1), Deschambault (1), Entrelacs (1), Gore (1), Grand-Saint-Esprit (1), Grenville-sur-la-Rouge (1), Havelock (1), Honfleur (1), Inverness (1), Irlande (1), L'Islet (1), Lantier (1), Leclercville (1), Mandeville (1), Mascouche (1), Mont-Tremblant (1), Notre-Dame-des-Monts (1), Parisville (1), Prévost (1), Racine (1), Rawdon (1), Saguenay (1), Saint-Alban (1), Saint-Alfred (1), Saint-Alphonse-Rodriguez (1), Saint-Antoine-Abbé (1), Saint-Barthélemy (1), Saint-Calixte (1), Saint-Casimir (1), Saint-Chrysostome (1), Saint-Cyrille-de-Lessard (1), Saint-Damase-de-l'Islet (1), Saint-Fabien-de-Panet (1), Saint-François-Xavier-de-Brompton (1), Saint-François-de-la-Rivière-du-Sud (1), Saint-François-du-Lac (1), Saint-Gabriel (1), Saint-Gabriel-de-Brandon (1), Saint-Georges-de-Windsor (1), Saint-Hilarion (1), Saint-Joachim (1), Saint-Jules-de-Beauce (1), Saint-Luc-de-Bellechasse (1), Saint-Magloire (1), Saint-Narcisse-de-Beaurivage (1), Saint-Nazaire-de-Dorchester (1), Saint-Odilon-de-Cranbourne (1), Saint-Philibert (1), Saint-Pierre-de-Broughton (1), Saint-Placide (1), Saint-Raphaël (1), Saint-Sylvestre (1), Saint-Victor (1), Saint-Édouard-de-Lotbinière (1), Saint-Étienne-des-Grès (1), Sainte-Béatrix (1), Sainte-Claire (1), Sainte-Pétronille (1), Sainte-Sophie (1), Sainte-Thècle (1), Stratford (1), Victoriaville (1), Warwick (1), Weedon (1), Windsor (1)
- **Ne pas développer (0)** : —

## 8. Pages existantes à protéger

Les **144 pages PROTÉGER** de la Phase 5A (section 7 de `phase5a-matrice-couverture-seo.md`) restent PROTÉGER : contenu, URL et SEO intouchables, jamais de remplacement automatique. Elles sont **toutes** dans les 56 villes desservies : **aucune** des 132 villes n'a de page protégée (0 impression). Les pages existantes des 132 villes ne sont ni supprimées ni régénérées par cette phase.

## 9. Risques de cannibalisation

Les **98 risques** de la Phase 5A sont conservés tels quels (tous dans les villes desservies, tous potentiels). Pour les villes A/B, les paires à traiter avec prudence sont listées ville par ville en section 4–6. Résumé :
- dompe vs point de dépôt : 60 villes
- ville vs livraison : 9 villes
- transport vs livraison : 9 villes
- matériau vs livraison : 5 villes

Le plus fréquent est **dompe vs point de dépôt** : ces deux familles seront les plus créées; leur intention doit être nettement distincte (dompe = site qui reçoit du remblai; point de dépôt = recherche d'un endroit où déposer). Aucune suppression, fusion ni redirection.

## 10. Nombre réaliste de pages potentielles

- Pages pertinentes à créer (P1+P2) : **156** dans 61 villes (moyenne 2.6 par ville).
  - dont TOP + Priorité 1 (villes A) : 56
  - dont Priorité 2 + 3 (villes B) : 100
- Combinaisons P3 à surveiller (non recommandées) : 199.
- Villes C : 0 page recommandée tant qu'elles ne sont pas validées.
- Par famille : recherche-point-de-depot 58, remblai 54, transport-vrac 13, courtage-materiaux 9, livraison-terre 5, pierre-concassee 4, livraison-sable 3, dompe 2, livraison-pierre 2, gravier-0-3-4 2, pierre 2, roche 2

Écart avec l'objectif théorique : 156 pages pertinentes contre 3 180 combinaisons manquantes (−3024).

## 11. Top 20 des villes à développer en premier

| # | Ville | Classe | Demandes | Pages à créer (P1/P2) |
|---|---|---|---|---|
| 1 | Saint-Damien | A | 17 | recherche-point-de-depot, transport-vrac, livraison-terre |
| 2 | Saint-Agapit | A | 13 | recherche-point-de-depot, transport-vrac, courtage-materiaux, pierre-concassee, roche, livraison-sable |
| 3 | Saint-Jean-de-Matha | A | 13 | recherche-point-de-depot |
| 4 | Thetford Mines | A | 12 | recherche-point-de-depot |
| 5 | Saint-Gilles | A | 11 | recherche-point-de-depot, transport-vrac, courtage-materiaux, pierre-concassee, roche |
| 6 | Saint-Henri | A | 10 | remblai, recherche-point-de-depot |
| 7 | Saint-Charles-de-Bellechasse | A | 9 | recherche-point-de-depot |
| 8 | Saint-Joseph-de-Beauce | A | 9 | recherche-point-de-depot |
| 9 | Beaumont | A | 8 | remblai, recherche-point-de-depot |
| 10 | Saint-Isidore | A | 8 | remblai, recherche-point-de-depot, transport-vrac, courtage-materiaux, livraison-terre |
| 11 | Sainte-Marie | A | 6 | remblai, recherche-point-de-depot |
| 12 | Saint-Tite-des-Caps | A | 5 | remblai, recherche-point-de-depot |
| 13 | Scott | A | 5 | remblai, recherche-point-de-depot |
| 14 | Cap-Saint-Ignace | B | 4 | remblai, recherche-point-de-depot |
| 15 | La Durantaye | B | 4 | remblai, recherche-point-de-depot |
| 16 | Notre-Dame-du-Sacré-Coeur-d'Issoudun | B | 4 | remblai, recherche-point-de-depot |
| 17 | Saint-Colomban | B | 4 | remblai, recherche-point-de-depot |
| 18 | Saint-Georges | A | 4 | remblai, recherche-point-de-depot, transport-vrac, courtage-materiaux, livraison-pierre, gravier-0-3-4, pierre, pierre-concassee |
| 19 | Saint-Janvier-de-Joly | B | 4 | remblai, recherche-point-de-depot |
| 20 | Sainte-Hénédine | A | 4 | remblai, recherche-point-de-depot, transport-vrac, courtage-materiaux, livraison-sable |

## 12. Recommandation pour la Phase 5C

1. Faire valider par l'équipe la desserte réelle des villes TOP et Priorité 1 (Vrac Québec / Transport JSC y opèrent-ils vraiment ?) avant toute génération; ce rapport mesure la demande, pas la capacité de servir.
2. Générer d'abord uniquement les pages P1 des villes TOP PRIORITÉ, en commençant par *remblai*, *dompe* et la page ville; publier par petits lots et mesurer l'indexation et les impressions 4–8 semaines.
3. Pour *dompe* et *recherche-point-de-depot*, rédiger des intentions clairement distinctes avant de créer les deux dans une même ville.
4. Ne pas créer de pages matériaux/livraison/courtage là où seuls des matériaux acceptés par un site receveur existent (P3).
5. Villes B Priorité 3 et villes C : attendre de nouvelles demandes; réévaluer chaque trimestre avec la même méthode.
6. Ne jamais toucher aux 144 pages PROTÉGER ni aux pages existantes des 132 villes.

---
Données modifiées : NON · Pages créées : NON · Pages supprimées : NON · URLs modifiées : NON · SEO modifié : NON · Publication : NON · Migration : NON · RLS : NON
