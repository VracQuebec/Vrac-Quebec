# Phase 5A — Matrice de couverture SEO par ville (audit lecture seule)

Date : 2026-10-08. Sources : `seo_cities`, `seo_pages`, `seo_gsc_metrics` (période 90 jours, extraction du 2026-10-07). Aucune page créée, modifiée, supprimée ni publiée.

## 1. Résumé

- Villes avec au moins une page locale : **188** (registre `seo_cities` : 188 villes, toutes actives; 56 marquées « desservies »). Le chiffre « environ 167 » ne correspond pas au registre : 188 villes ont des pages.
- Familles analysées : **28** (page ville + 10 services + 17 matériaux), slugs réels du projet (`mg-20`, `mg-56` en minuscules).
- Pages locales existantes : **2084** (toutes `published`, aucune `noindex`); hors des 28 familles ou en double : 0.
- Moyenne : **11.1** pages par ville.
- Ville la plus complète : **Beauport** (28/28); la moins complète : **Brossard** (1/28).
- Pages manquantes pour une couverture uniforme 28/28 : **3180**, dont **3180** dans des villes à valider (E) — donc **0** dans des villes avec preuve de pertinence.
- Pages à PROTÉGER : **144**. Risques de cannibalisation : **98** (0 confirmés par une requête commune, 98 potentiels).
- Classement : A=56, B=0, C=0, D=0, E=132.
- Indexation déclarée : 338 « indexed », 1746 « unknown » (non vérifiée — pas une preuve de non-indexation).

**Règles utilisées.** Classes : A = 28/28; B ≥ 80 %; C 40–79 %; D < 40 %; E = ville incomplète sans preuve de pertinence (non desservie ET 0 impression Search Console sur 90 j). PROTÉGER = ≥ 1 clic, ou ≥ 100 impressions, ou position ≤ 10 avec ≥ 20 impressions (90 j). Cannibalisation CONFIRMÉE = deux pages de la même ville reçoivent des impressions sur la même requête; POTENTIELLE = paire sensible où les deux pages ont des impressions sans requête commune visible. Deux URL aux mots semblables ne sont jamais considérées équivalentes.

## 2. Liste des villes

| Ville | Slug | Statut | Desservie | Page ville | Pages locales | Couverture | Classe |
|---|---|---|---|---|---|---|---|
| Adstock | `adstock` | active | non | oui | 6 | 6/28 (21.4 %) | E |
| Beauceville | `beauceville` | active | non | oui | 3 | 3/28 (10.7 %) | E |
| Beaumont | `beaumont` | active | non | oui | 6 | 6/28 (21.4 %) | E |
| Beauport | `beauport` | active | oui | oui | 28 | 28/28 (100.0 %) | A |
| Beaupré | `beaupre` | active | oui | oui | 28 | 28/28 (100.0 %) | A |
| Berthierville | `berthierville` | active | non | oui | 3 | 3/28 (10.7 %) | E |
| Blainville | `blainville` | active | non | oui | 3 | 3/28 (10.7 %) | E |
| Bois-des-Filion | `bois-des-filion` | active | non | oui | 2 | 2/28 (7.1 %) | E |
| Boischatel | `boischatel` | active | oui | oui | 28 | 28/28 (100.0 %) | A |
| Breakeyville | `breakeyville` | active | oui | oui | 28 | 28/28 (100.0 %) | A |
| Brossard | `brossard` | active | non | oui | 1 | 1/28 (3.6 %) | E |
| Bécancour | `becancour` | active | non | oui | 2 | 2/28 (7.1 %) | E |
| Cap-Rouge | `cap-rouge` | active | oui | oui | 28 | 28/28 (100.0 %) | A |
| Cap-Saint-Ignace | `cap-saint-ignace` | active | non | oui | 6 | 6/28 (21.4 %) | E |
| Cap-Santé | `cap-sante` | active | oui | oui | 28 | 28/28 (100.0 %) | A |
| Charlesbourg | `charlesbourg` | active | oui | oui | 28 | 28/28 (100.0 %) | A |
| Charny | `charny` | active | oui | oui | 28 | 28/28 (100.0 %) | A |
| Chertsey | `chertsey` | active | non | oui | 3 | 3/28 (10.7 %) | E |
| Château-Richer | `chateau-richer` | active | oui | oui | 28 | 28/28 (100.0 %) | A |
| Contrecoeur | `contrecoeur` | active | non | oui | 2 | 2/28 (7.1 %) | E |
| Cowansville | `cowansville` | active | non | oui | 2 | 2/28 (7.1 %) | E |
| Deschambault | `deschambault` | active | non | oui | 2 | 2/28 (7.1 %) | E |
| Disraeli | `disraeli` | active | non | oui | 3 | 3/28 (10.7 %) | E |
| Donnacona | `donnacona` | active | oui | oui | 28 | 28/28 (100.0 %) | A |
| Duberger | `duberger` | active | oui | oui | 28 | 28/28 (100.0 %) | A |
| East Broughton | `east-broughton` | active | non | oui | 5 | 5/28 (17.9 %) | E |
| Entrelacs | `entrelacs` | active | non | oui | 6 | 6/28 (21.4 %) | E |
| Fossambault-sur-le-Lac | `fossambault-sur-le-lac` | active | oui | oui | 28 | 28/28 (100.0 %) | A |
| Frampton | `frampton` | active | non | oui | 6 | 6/28 (21.4 %) | E |
| Gore | `gore` | active | non | oui | 2 | 2/28 (7.1 %) | E |
| Grand-Saint-Esprit | `grand-saint-esprit` | active | non | oui | 5 | 5/28 (17.9 %) | E |
| Grenville-sur-la-Rouge | `grenville-sur-la-rouge` | active | non | oui | 4 | 4/28 (14.3 %) | E |
| Havelock | `havelock` | active | non | oui | 6 | 6/28 (21.4 %) | E |
| Honfleur | `honfleur` | active | non | oui | 2 | 2/28 (7.1 %) | E |
| Inverness | `inverness` | active | non | oui | 2 | 2/28 (7.1 %) | E |
| Irlande | `irlande` | active | non | oui | 2 | 2/28 (7.1 %) | E |
| L'Ancienne-Lorette | `l-ancienne-lorette` | active | oui | oui | 28 | 28/28 (100.0 %) | A |
| L'Ange-Gardien | `l-ange-gardien` | active | oui | oui | 28 | 28/28 (100.0 %) | A |
| L'Islet | `l-islet` | active | non | oui | 2 | 2/28 (7.1 %) | E |
| La Cité-Limoilou | `la-cite-limoilou` | active | oui | oui | 28 | 28/28 (100.0 %) | A |
| La Durantaye | `la-durantaye` | active | non | oui | 7 | 7/28 (25.0 %) | E |
| La Haute-Saint-Charles | `la-haute-saint-charles` | active | oui | oui | 28 | 28/28 (100.0 %) | A |
| Lac-Beauport | `lac-beauport` | active | oui | oui | 28 | 28/28 (100.0 %) | A |
| Lac-Delage | `lac-delage` | active | oui | oui | 28 | 28/28 (100.0 %) | A |
| Lac-Etchemin | `lac-etchemin` | active | non | oui | 3 | 3/28 (10.7 %) | E |
| Lac-Saint-Charles | `lac-saint-charles` | active | oui | oui | 28 | 28/28 (100.0 %) | A |
| Lac-Saint-Joseph | `lac-saint-joseph` | active | oui | oui | 28 | 28/28 (100.0 %) | A |
| Lantier | `lantier` | active | non | oui | 6 | 6/28 (21.4 %) | E |
| Laurier-Station | `laurier-station` | active | oui | oui | 28 | 28/28 (100.0 %) | A |
| Lauzon | `lauzon` | active | oui | oui | 28 | 28/28 (100.0 %) | A |
| Laval | `laval` | active | non | oui | 3 | 3/28 (10.7 %) | E |
| Leclercville | `leclercville` | active | non | oui | 4 | 4/28 (14.3 %) | E |
| Les Rivières | `les-rivieres` | active | oui | oui | 28 | 28/28 (100.0 %) | A |
| Limoilou | `limoilou` | active | oui | oui | 28 | 28/28 (100.0 %) | A |
| Loretteville | `loretteville` | active | oui | oui | 28 | 28/28 (100.0 %) | A |
| Lévis | `levis` | active | oui | oui | 28 | 28/28 (100.0 %) | A |
| Mandeville | `mandeville` | active | non | oui | 2 | 2/28 (7.1 %) | E |
| Mascouche | `mascouche` | active | non | oui | 7 | 7/28 (25.0 %) | E |
| Mont-Tremblant | `mont-tremblant` | active | non | oui | 1 | 1/28 (3.6 %) | E |
| Montcalm | `montcalm` | active | oui | oui | 28 | 28/28 (100.0 %) | A |
| Montmagny | `montmagny` | active | non | oui | 2 | 2/28 (7.1 %) | E |
| Neufchâtel | `neufchatel` | active | oui | oui | 28 | 28/28 (100.0 %) | A |
| Neuville | `neuville` | active | oui | oui | 28 | 28/28 (100.0 %) | A |
| Notre-Dame-des-Monts | `notre-dame-des-monts` | active | non | oui | 5 | 5/28 (17.9 %) | E |
| Notre-Dame-du-Mont-Carmel | `notre-dame-du-mont-carmel` | active | non | oui | 5 | 5/28 (17.9 %) | E |
| Notre-Dame-du-Sacré-Coeur-d'Issoudun | `notre-dame-du-sacre-coeur-d-issoudun` | active | non | oui | 6 | 6/28 (21.4 %) | E |
| Parisville | `parisville` | active | non | oui | 3 | 3/28 (10.7 %) | E |
| Pintendre | `pintendre` | active | oui | oui | 28 | 28/28 (100.0 %) | A |
| Pont-Rouge | `pont-rouge` | active | oui | oui | 28 | 28/28 (100.0 %) | A |
| Portneuf | `portneuf` | active | oui | oui | 28 | 28/28 (100.0 %) | A |
| Prévost | `prevost` | active | non | oui | 2 | 2/28 (7.1 %) | E |
| Québec | `quebec` | active | oui | oui | 28 | 28/28 (100.0 %) | A |
| Racine | `racine` | active | non | oui | 2 | 2/28 (7.1 %) | E |
| Rawdon | `rawdon` | active | non | oui | 4 | 4/28 (14.3 %) | E |
| Saguenay | `saguenay` | active | non | oui | 5 | 5/28 (17.9 %) | E |
| Saint-Agapit | `saint-agapit` | active | non | oui | 8 | 8/28 (28.6 %) | E |
| Saint-Alban | `saint-alban` | active | non | oui | 2 | 2/28 (7.1 %) | E |
| Saint-Alfred | `saint-alfred` | active | non | oui | 4 | 4/28 (14.3 %) | E |
| Saint-Alphonse-Rodriguez | `saint-alphonse-rodriguez` | active | non | oui | 2 | 2/28 (7.1 %) | E |
| Saint-Anselme | `saint-anselme` | active | non | oui | 2 | 2/28 (7.1 %) | E |
| Saint-Antoine-Abbé | `saint-antoine-abbe` | active | non | oui | 2 | 2/28 (7.1 %) | E |
| Saint-Antoine-de-Tilly | `saint-antoine-de-tilly` | active | non | oui | 5 | 5/28 (17.9 %) | E |
| Saint-Apollinaire | `saint-apollinaire` | active | oui | oui | 28 | 28/28 (100.0 %) | A |
| Saint-Augustin-de-Desmaures | `saint-augustin-de-desmaures` | active | oui | oui | 28 | 28/28 (100.0 %) | A |
| Saint-Barthélemy | `saint-barthelemy` | active | non | oui | 2 | 2/28 (7.1 %) | E |
| Saint-Basile | `saint-basile` | active | non | oui | 7 | 7/28 (25.0 %) | E |
| Saint-Benoît-Labre | `saint-benoit-labre` | active | non | oui | 3 | 3/28 (10.7 %) | E |
| Saint-Calixte | `saint-calixte` | active | non | oui | 2 | 2/28 (7.1 %) | E |
| Saint-Calixte-de-Kilkenny | `saint-calixte-de-kilkenny` | active | non | oui | 6 | 6/28 (21.4 %) | E |
| Saint-Casimir | `saint-casimir` | active | non | oui | 5 | 5/28 (17.9 %) | E |
| Saint-Charles-de-Bellechasse | `saint-charles-de-bellechasse` | active | non | oui | 8 | 8/28 (28.6 %) | E |
| Saint-Chrysostome | `saint-chrysostome` | active | non | oui | 5 | 5/28 (17.9 %) | E |
| Saint-Colomban | `saint-colomban` | active | non | oui | 3 | 3/28 (10.7 %) | E |
| Saint-Cyrille-de-Lessard | `saint-cyrille-de-lessard` | active | non | oui | 7 | 7/28 (25.0 %) | E |
| Saint-Damase-de-l'Islet | `saint-damase-de-l-islet` | active | non | oui | 4 | 4/28 (14.3 %) | E |
| Saint-Damien | `saint-damien` | active | non | oui | 7 | 7/28 (25.0 %) | E |
| Saint-Elzéar | `saint-elzear` | active | non | oui | 6 | 6/28 (21.4 %) | E |
| Saint-Fabien-de-Panet | `saint-fabien-de-panet` | active | non | oui | 3 | 3/28 (10.7 %) | E |
| Saint-Ferréol-les-Neiges | `saint-ferreol-les-neiges` | active | oui | oui | 28 | 28/28 (100.0 %) | A |
| Saint-Flavien | `saint-flavien` | active | non | oui | 7 | 7/28 (25.0 %) | E |
| Saint-François-Xavier-de-Brompton | `saint-francois-xavier-de-brompton` | active | non | oui | 4 | 4/28 (14.3 %) | E |
| Saint-François-de-la-Rivière-du-Sud | `saint-francois-de-la-riviere-du-sud` | active | non | oui | 5 | 5/28 (17.9 %) | E |
| Saint-François-du-Lac | `saint-francois-du-lac` | active | non | oui | 2 | 2/28 (7.1 %) | E |
| Saint-Félix-de-Valois | `saint-felix-de-valois` | active | non | oui | 3 | 3/28 (10.7 %) | E |
| Saint-Gabriel | `saint-gabriel` | active | non | oui | 4 | 4/28 (14.3 %) | E |
| Saint-Gabriel-de-Brandon | `saint-gabriel-de-brandon` | active | non | oui | 2 | 2/28 (7.1 %) | E |
| Saint-Gabriel-de-Valcartier | `saint-gabriel-de-valcartier` | active | oui | oui | 28 | 28/28 (100.0 %) | A |
| Saint-Georges | `saint-georges` | active | non | oui | 2 | 2/28 (7.1 %) | E |
| Saint-Georges-de-Windsor | `saint-georges-de-windsor` | active | non | oui | 2 | 2/28 (7.1 %) | E |
| Saint-Gervais | `saint-gervais` | active | non | oui | 3 | 3/28 (10.7 %) | E |
| Saint-Gilles | `saint-gilles` | active | non | oui | 8 | 8/28 (28.6 %) | E |
| Saint-Henri | `saint-henri` | active | non | oui | 6 | 6/28 (21.4 %) | E |
| Saint-Hilarion | `saint-hilarion` | active | non | oui | 4 | 4/28 (14.3 %) | E |
| Saint-Isidore | `saint-isidore` | active | non | oui | 5 | 5/28 (17.9 %) | E |
| Saint-Janvier-de-Joly | `saint-janvier-de-joly` | active | non | oui | 4 | 4/28 (14.3 %) | E |
| Saint-Jean-Chrysostome | `saint-jean-chrysostome` | active | oui | oui | 28 | 28/28 (100.0 %) | A |
| Saint-Jean-de-Matha | `saint-jean-de-matha` | active | non | oui | 8 | 8/28 (28.6 %) | E |
| Saint-Joachim | `saint-joachim` | active | non | oui | 4 | 4/28 (14.3 %) | E |
| Saint-Joseph-de-Beauce | `saint-joseph-de-beauce` | active | non | oui | 8 | 8/28 (28.6 %) | E |
| Saint-Jules-de-Beauce | `saint-jules-de-beauce` | active | non | oui | 6 | 6/28 (21.4 %) | E |
| Saint-Jérôme | `saint-jerome` | active | non | oui | 3 | 3/28 (10.7 %) | E |
| Saint-Lambert-de-Lauzon | `saint-lambert-de-lauzon` | active | oui | oui | 28 | 28/28 (100.0 %) | A |
| Saint-Lazare-de-Bellechasse | `saint-lazare-de-bellechasse` | active | non | oui | 2 | 2/28 (7.1 %) | E |
| Saint-Luc-de-Bellechasse | `saint-luc-de-bellechasse` | active | non | oui | 2 | 2/28 (7.1 %) | E |
| Saint-Magloire | `saint-magloire` | active | non | oui | 2 | 2/28 (7.1 %) | E |
| Saint-Maurice | `saint-maurice` | active | non | oui | 2 | 2/28 (7.1 %) | E |
| Saint-Michel-de-Bellechasse | `saint-michel-de-bellechasse` | active | non | oui | 3 | 3/28 (10.7 %) | E |
| Saint-Narcisse-de-Beaurivage | `saint-narcisse-de-beaurivage` | active | non | oui | 5 | 5/28 (17.9 %) | E |
| Saint-Nazaire-de-Dorchester | `saint-nazaire-de-dorchester` | active | non | oui | 3 | 3/28 (10.7 %) | E |
| Saint-Nicolas | `saint-nicolas` | active | oui | oui | 28 | 28/28 (100.0 %) | A |
| Saint-Odilon-de-Cranbourne | `saint-odilon-de-cranbourne` | active | non | oui | 2 | 2/28 (7.1 %) | E |
| Saint-Philibert | `saint-philibert` | active | non | oui | 2 | 2/28 (7.1 %) | E |
| Saint-Philémon | `saint-philemon` | active | non | oui | 4 | 4/28 (14.3 %) | E |
| Saint-Pierre-de-Broughton | `saint-pierre-de-broughton` | active | non | oui | 3 | 3/28 (10.7 %) | E |
| Saint-Placide | `saint-placide` | active | non | oui | 2 | 2/28 (7.1 %) | E |
| Saint-Prosper-de-Champlain | `saint-prosper-de-champlain` | active | non | oui | 5 | 5/28 (17.9 %) | E |
| Saint-Raphaël | `saint-raphael` | active | non | oui | 2 | 2/28 (7.1 %) | E |
| Saint-Raymond | `saint-raymond` | active | oui | oui | 28 | 28/28 (100.0 %) | A |
| Saint-René | `saint-rene` | active | non | oui | 3 | 3/28 (10.7 %) | E |
| Saint-Romuald | `saint-romuald` | active | oui | oui | 28 | 28/28 (100.0 %) | A |
| Saint-Sauveur | `saint-sauveur` | active | oui | oui | 28 | 28/28 (100.0 %) | A |
| Saint-Simon-les-Mines | `saint-simon-les-mines` | active | non | oui | 6 | 6/28 (21.4 %) | E |
| Saint-Sylvestre | `saint-sylvestre` | active | non | oui | 7 | 7/28 (25.0 %) | E |
| Saint-Théophile | `saint-theophile` | active | non | oui | 6 | 6/28 (21.4 %) | E |
| Saint-Tite-des-Caps | `saint-tite-des-caps` | active | non | oui | 5 | 5/28 (17.9 %) | E |
| Saint-Victor | `saint-victor` | active | non | oui | 7 | 7/28 (25.0 %) | E |
| Saint-Édouard-de-Lotbinière | `saint-edouard-de-lotbiniere` | active | non | oui | 6 | 6/28 (21.4 %) | E |
| Saint-Émile | `saint-emile` | active | oui | oui | 28 | 28/28 (100.0 %) | A |
| Saint-Étienne-de-Lauzon | `saint-etienne-de-lauzon` | active | oui | oui | 28 | 28/28 (100.0 %) | A |
| Saint-Étienne-des-Grès | `saint-etienne-des-gres` | active | non | oui | 3 | 3/28 (10.7 %) | E |
| Sainte-Anne-de-Beaupré | `sainte-anne-de-beaupre` | active | oui | oui | 28 | 28/28 (100.0 %) | A |
| Sainte-Brigitte-de-Laval | `sainte-brigitte-de-laval` | active | oui | oui | 28 | 28/28 (100.0 %) | A |
| Sainte-Béatrix | `sainte-beatrix` | active | non | oui | 2 | 2/28 (7.1 %) | E |
| Sainte-Catherine-de-la-Jacques-Cartier | `sainte-catherine-de-la-jacques-cartier` | active | oui | oui | 28 | 28/28 (100.0 %) | A |
| Sainte-Christine-d'Auvergne | `sainte-christine-d-auvergne` | active | non | oui | 3 | 3/28 (10.7 %) | E |
| Sainte-Claire | `sainte-claire` | active | non | oui | 2 | 2/28 (7.1 %) | E |
| Sainte-Croix | `sainte-croix` | active | non | oui | 2 | 2/28 (7.1 %) | E |
| Sainte-Foy | `sainte-foy` | active | oui | oui | 28 | 28/28 (100.0 %) | A |
| Sainte-Foy–Sillery–Cap-Rouge | `sainte-foy-sillery-cap-rouge` | active | oui | oui | 28 | 28/28 (100.0 %) | A |
| Sainte-Hénédine | `sainte-henedine` | active | non | oui | 6 | 6/28 (21.4 %) | E |
| Sainte-Julienne | `sainte-julienne` | active | non | oui | 3 | 3/28 (10.7 %) | E |
| Sainte-Marguerite | `sainte-marguerite` | active | non | oui | 5 | 5/28 (17.9 %) | E |
| Sainte-Marie | `sainte-marie` | active | non | oui | 5 | 5/28 (17.9 %) | E |
| Sainte-Pétronille | `sainte-petronille` | active | non | oui | 2 | 2/28 (7.1 %) | E |
| Sainte-Sophie | `sainte-sophie` | active | non | oui | 2 | 2/28 (7.1 %) | E |
| Sainte-Sophie-de-Lévrard | `sainte-sophie-de-levrard` | active | non | oui | 5 | 5/28 (17.9 %) | E |
| Sainte-Thècle | `sainte-thecle` | active | non | oui | 7 | 7/28 (25.0 %) | E |
| Sainte-Émélie-de-l'Énergie | `sainte-emelie-de-l-energie` | active | non | oui | 7 | 7/28 (25.0 %) | E |
| Saints-Anges | `saints-anges` | active | non | oui | 7 | 7/28 (25.0 %) | E |
| Scott | `scott` | active | non | oui | 4 | 4/28 (14.3 %) | E |
| Shannon | `shannon` | active | oui | oui | 28 | 28/28 (100.0 %) | A |
| Shawinigan | `shawinigan` | active | non | oui | 3 | 3/28 (10.7 %) | E |
| Sillery | `sillery` | active | oui | oui | 28 | 28/28 (100.0 %) | A |
| Stoneham-et-Tewkesbury | `stoneham-et-tewkesbury` | active | oui | oui | 28 | 28/28 (100.0 %) | A |
| Stratford | `stratford` | active | non | oui | 3 | 3/28 (10.7 %) | E |
| Thetford Mines | `thetford-mines` | active | non | oui | 8 | 8/28 (28.6 %) | E |
| Trois-Rivières | `trois-rivieres` | active | non | oui | 4 | 4/28 (14.3 %) | E |
| Val-Alain | `val-alain` | active | non | oui | 2 | 2/28 (7.1 %) | E |
| Val-Bélair | `val-belair` | active | oui | oui | 28 | 28/28 (100.0 %) | A |
| Val-David | `val-david` | active | non | oui | 2 | 2/28 (7.1 %) | E |
| Vanier | `vanier` | active | oui | oui | 28 | 28/28 (100.0 %) | A |
| Victoriaville | `victoriaville` | active | non | oui | 2 | 2/28 (7.1 %) | E |
| Villeroy | `villeroy` | active | non | oui | 3 | 3/28 (10.7 %) | E |
| Warwick | `warwick` | active | non | oui | 3 | 3/28 (10.7 %) | E |
| Weedon | `weedon` | active | non | oui | 2 | 2/28 (7.1 %) | E |
| Wendake | `wendake` | active | oui | oui | 28 | 28/28 (100.0 %) | A |
| Wentworth-Nord | `wentworth-nord` | active | non | oui | 2 | 2/28 (7.1 %) | E |
| Windsor | `windsor` | active | non | oui | 2 | 2/28 (7.1 %) | E |

## 3. Matrice complète ville × famille

Légende : URL `/<slug>`; Idx = `noindex` absent (toutes indexables); Pub = publiée; GSC 90 j = impressions/clics/position; Risque : PROTÉGER, CANNIB. Les familles manquantes sont listées « À créer ? » à la section 6.


### Beauport — 28/28

| Famille | URL | Idx | Pub | Google | Impr. | Clics | Pos. | Risque |
|---|---|---|---|---|---|---|---|---|
| ville | `/beauport` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| transport-vrac | `/transport-vrac-beauport` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| livraison-terre | `/livraison-terre-beauport` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| livraison-sable | `/livraison-sable-beauport` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| livraison-gravier | `/livraison-gravier-beauport` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| livraison-pierre | `/livraison-pierre-beauport` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| excavation | `/excavation-beauport` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| nivellement | `/nivellement-beauport` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| dompe | `/dompe-beauport` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| recherche-point-de-depot | `/recherche-point-de-depot-beauport` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| courtage-materiaux | `/courtage-materiaux-beauport` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| terre-tamisee | `/terre-tamisee-beauport` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| terre-contaminee | `/terre-contaminee-beauport` | oui | oui | indexed | 14 | 0 | 7.6 |  |
| sable | `/sable-beauport` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| gravier | `/gravier-beauport` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| gravier-0-3-4 | `/gravier-0-3-4-beauport` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| mg-20 | `/mg-20-beauport` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| mg-56 | `/mg-56-beauport` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| pierre | `/pierre-beauport` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| pierre-concassee | `/pierre-concassee-beauport` | oui | oui | indexed | 251 | 7 | 10.9 | PROTÉGER |
| pierre-nette | `/pierre-nette-beauport` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| poussiere-de-pierre | `/poussiere-de-pierre-beauport` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| roche | `/roche-beauport` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| remblai | `/remblai-beauport` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| beton | `/beton-beauport` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| asphalte | `/asphalte-beauport` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| brique | `/brique-beauport` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| neige | `/neige-beauport` | oui | oui | unknown | 0 | 0 | 0.0 |  |

### Beaupré — 28/28

| Famille | URL | Idx | Pub | Google | Impr. | Clics | Pos. | Risque |
|---|---|---|---|---|---|---|---|---|
| ville | `/beaupre` | oui | oui | indexed | 0 | 0 | 0.0 |  |
| transport-vrac | `/transport-vrac-beaupre` | oui | oui | indexed | 49 | 0 | 76.5 | CANNIB. |
| livraison-terre | `/livraison-terre-beaupre` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| livraison-sable | `/livraison-sable-beaupre` | oui | oui | indexed | 14 | 0 | 35.6 | CANNIB. |
| livraison-gravier | `/livraison-gravier-beaupre` | oui | oui | indexed | 17 | 2 | 6.1 | CANNIB., PROTÉGER |
| livraison-pierre | `/livraison-pierre-beaupre` | oui | oui | indexed | 7 | 1 | 26.7 | CANNIB., PROTÉGER |
| excavation | `/excavation-beaupre` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| nivellement | `/nivellement-beaupre` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| dompe | `/dompe-beaupre` | oui | oui | indexed | 5 | 0 | 10.4 | CANNIB. |
| recherche-point-de-depot | `/recherche-point-de-depot-beaupre` | oui | oui | indexed | 4 | 0 | 7.2 | CANNIB. |
| courtage-materiaux | `/courtage-materiaux-beaupre` | oui | oui | indexed | 1 | 0 | 4.0 |  |
| terre-tamisee | `/terre-tamisee-beaupre` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| terre-contaminee | `/terre-contaminee-beaupre` | oui | oui | indexed | 2 | 0 | 5.0 |  |
| sable | `/sable-beaupre` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| gravier | `/gravier-beaupre` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| gravier-0-3-4 | `/gravier-0-3-4-beaupre` | oui | oui | indexed | 152 | 4 | 11.2 | PROTÉGER |
| mg-20 | `/mg-20-beaupre` | oui | oui | indexed | 20 | 0 | 6.0 | PROTÉGER |
| mg-56 | `/mg-56-beaupre` | oui | oui | indexed | 11 | 0 | 6.5 |  |
| pierre | `/pierre-beaupre` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| pierre-concassee | `/pierre-concassee-beaupre` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| pierre-nette | `/pierre-nette-beaupre` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| poussiere-de-pierre | `/poussiere-de-pierre-beaupre` | oui | oui | indexed | 29 | 0 | 27.0 |  |
| roche | `/roche-beaupre` | oui | oui | unknown | 1 | 0 | 10.0 |  |
| remblai | `/remblai-beaupre` | oui | oui | indexed | 4 | 0 | 6.8 |  |
| beton | `/beton-beaupre` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| asphalte | `/asphalte-beaupre` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| brique | `/brique-beaupre` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| neige | `/neige-beaupre` | oui | oui | unknown | 0 | 0 | 0.0 |  |

### Boischatel — 28/28

| Famille | URL | Idx | Pub | Google | Impr. | Clics | Pos. | Risque |
|---|---|---|---|---|---|---|---|---|
| ville | `/boischatel` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| transport-vrac | `/transport-vrac-boischatel` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| livraison-terre | `/livraison-terre-boischatel` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| livraison-sable | `/livraison-sable-boischatel` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| livraison-gravier | `/livraison-gravier-boischatel` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| livraison-pierre | `/livraison-pierre-boischatel` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| excavation | `/excavation-boischatel` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| nivellement | `/nivellement-boischatel` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| dompe | `/dompe-boischatel` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| recherche-point-de-depot | `/recherche-point-de-depot-boischatel` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| courtage-materiaux | `/courtage-materiaux-boischatel` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| terre-tamisee | `/terre-tamisee-boischatel` | oui | oui | indexed | 14 | 4 | 6.1 | PROTÉGER |
| terre-contaminee | `/terre-contaminee-boischatel` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| sable | `/sable-boischatel` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| gravier | `/gravier-boischatel` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| gravier-0-3-4 | `/gravier-0-3-4-boischatel` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| mg-20 | `/mg-20-boischatel` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| mg-56 | `/mg-56-boischatel` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| pierre | `/pierre-boischatel` | oui | oui | indexed | 3 | 2 | 1.7 | PROTÉGER |
| pierre-concassee | `/pierre-concassee-boischatel` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| pierre-nette | `/pierre-nette-boischatel` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| poussiere-de-pierre | `/poussiere-de-pierre-boischatel` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| roche | `/roche-boischatel` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| remblai | `/remblai-boischatel` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| beton | `/beton-boischatel` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| asphalte | `/asphalte-boischatel` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| brique | `/brique-boischatel` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| neige | `/neige-boischatel` | oui | oui | unknown | 1 | 0 | 10.0 |  |

### Breakeyville — 28/28

| Famille | URL | Idx | Pub | Google | Impr. | Clics | Pos. | Risque |
|---|---|---|---|---|---|---|---|---|
| ville | `/breakeyville` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| transport-vrac | `/transport-vrac-breakeyville` | oui | oui | indexed | 9 | 1 | 23.4 | PROTÉGER |
| livraison-terre | `/livraison-terre-breakeyville` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| livraison-sable | `/livraison-sable-breakeyville` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| livraison-gravier | `/livraison-gravier-breakeyville` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| livraison-pierre | `/livraison-pierre-breakeyville` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| excavation | `/excavation-breakeyville` | oui | oui | indexed | 0 | 0 |  |  |
| nivellement | `/nivellement-breakeyville` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| dompe | `/dompe-breakeyville` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| recherche-point-de-depot | `/recherche-point-de-depot-breakeyville` | oui | oui | unknown | 10 | 0 | 49.3 |  |
| courtage-materiaux | `/courtage-materiaux-breakeyville` | oui | oui | indexed | 8 | 0 | 37.1 |  |
| terre-tamisee | `/terre-tamisee-breakeyville` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| terre-contaminee | `/terre-contaminee-breakeyville` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| sable | `/sable-breakeyville` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| gravier | `/gravier-breakeyville` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| gravier-0-3-4 | `/gravier-0-3-4-breakeyville` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| mg-20 | `/mg-20-breakeyville` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| mg-56 | `/mg-56-breakeyville` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| pierre | `/pierre-breakeyville` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| pierre-concassee | `/pierre-concassee-breakeyville` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| pierre-nette | `/pierre-nette-breakeyville` | oui | oui | indexed | 10 | 2 | 16.7 | PROTÉGER |
| poussiere-de-pierre | `/poussiere-de-pierre-breakeyville` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| roche | `/roche-breakeyville` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| remblai | `/remblai-breakeyville` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| beton | `/beton-breakeyville` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| asphalte | `/asphalte-breakeyville` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| brique | `/brique-breakeyville` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| neige | `/neige-breakeyville` | oui | oui | unknown | 0 | 0 | 0.0 |  |

### Cap-Rouge — 28/28

| Famille | URL | Idx | Pub | Google | Impr. | Clics | Pos. | Risque |
|---|---|---|---|---|---|---|---|---|
| ville | `/cap-rouge` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| transport-vrac | `/transport-vrac-cap-rouge` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| livraison-terre | `/livraison-terre-cap-rouge` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| livraison-sable | `/livraison-sable-cap-rouge` | oui | oui | indexed | 0 | 0 | 0.0 |  |
| livraison-gravier | `/livraison-gravier-cap-rouge` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| livraison-pierre | `/livraison-pierre-cap-rouge` | oui | oui | indexed | 20 | 3 | 9.0 | PROTÉGER |
| excavation | `/excavation-cap-rouge` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| nivellement | `/nivellement-cap-rouge` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| dompe | `/dompe-cap-rouge` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| recherche-point-de-depot | `/recherche-point-de-depot-cap-rouge` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| courtage-materiaux | `/courtage-materiaux-cap-rouge` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| terre-tamisee | `/terre-tamisee-cap-rouge` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| terre-contaminee | `/terre-contaminee-cap-rouge` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| sable | `/sable-cap-rouge` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| gravier | `/gravier-cap-rouge` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| gravier-0-3-4 | `/gravier-0-3-4-cap-rouge` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| mg-20 | `/mg-20-cap-rouge` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| mg-56 | `/mg-56-cap-rouge` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| pierre | `/pierre-cap-rouge` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| pierre-concassee | `/pierre-concassee-cap-rouge` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| pierre-nette | `/pierre-nette-cap-rouge` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| poussiere-de-pierre | `/poussiere-de-pierre-cap-rouge` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| roche | `/roche-cap-rouge` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| remblai | `/remblai-cap-rouge` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| beton | `/beton-cap-rouge` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| asphalte | `/asphalte-cap-rouge` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| brique | `/brique-cap-rouge` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| neige | `/neige-cap-rouge` | oui | oui | unknown | 0 | 0 | 0.0 |  |

### Cap-Santé — 28/28

| Famille | URL | Idx | Pub | Google | Impr. | Clics | Pos. | Risque |
|---|---|---|---|---|---|---|---|---|
| ville | `/cap-sante` | oui | oui | indexed | 3 | 0 | 4.7 | CANNIB. |
| transport-vrac | `/transport-vrac-cap-sante` | oui | oui | unknown | 19 | 1 | 67.4 | CANNIB., PROTÉGER |
| livraison-terre | `/livraison-terre-cap-sante` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| livraison-sable | `/livraison-sable-cap-sante` | oui | oui | indexed | 2 | 0 | 52.5 | CANNIB. |
| livraison-gravier | `/livraison-gravier-cap-sante` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| livraison-pierre | `/livraison-pierre-cap-sante` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| excavation | `/excavation-cap-sante` | oui | oui | indexed | 12 | 1 | 8.5 | PROTÉGER |
| nivellement | `/nivellement-cap-sante` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| dompe | `/dompe-cap-sante` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| recherche-point-de-depot | `/recherche-point-de-depot-cap-sante` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| courtage-materiaux | `/courtage-materiaux-cap-sante` | oui | oui | unknown | 2 | 0 | 4.5 |  |
| terre-tamisee | `/terre-tamisee-cap-sante` | oui | oui | indexed | 3 | 1 | 1.7 | PROTÉGER |
| terre-contaminee | `/terre-contaminee-cap-sante` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| sable | `/sable-cap-sante` | oui | oui | indexed | 4 | 0 | 26.5 | CANNIB. |
| gravier | `/gravier-cap-sante` | oui | oui | indexed | 4 | 0 | 3.5 |  |
| gravier-0-3-4 | `/gravier-0-3-4-cap-sante` | oui | oui | indexed | 1 | 0 | 4.0 |  |
| mg-20 | `/mg-20-cap-sante` | oui | oui | indexed | 46 | 0 | 8.7 | PROTÉGER |
| mg-56 | `/mg-56-cap-sante` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| pierre | `/pierre-cap-sante` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| pierre-concassee | `/pierre-concassee-cap-sante` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| pierre-nette | `/pierre-nette-cap-sante` | oui | oui | unknown | 6 | 0 | 12.2 |  |
| poussiere-de-pierre | `/poussiere-de-pierre-cap-sante` | oui | oui | indexed | 7 | 1 | 5.4 | PROTÉGER |
| roche | `/roche-cap-sante` | oui | oui | indexed | 2 | 0 | 7.5 |  |
| remblai | `/remblai-cap-sante` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| beton | `/beton-cap-sante` | oui | oui | unknown | 1 | 0 | 4.0 |  |
| asphalte | `/asphalte-cap-sante` | oui | oui | indexed | 5 | 0 | 13.4 |  |
| brique | `/brique-cap-sante` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| neige | `/neige-cap-sante` | oui | oui | unknown | 0 | 0 | 0.0 |  |

### Charlesbourg — 28/28

| Famille | URL | Idx | Pub | Google | Impr. | Clics | Pos. | Risque |
|---|---|---|---|---|---|---|---|---|
| ville | `/charlesbourg` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| transport-vrac | `/transport-vrac-charlesbourg` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| livraison-terre | `/livraison-terre-charlesbourg` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| livraison-sable | `/livraison-sable-charlesbourg` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| livraison-gravier | `/livraison-gravier-charlesbourg` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| livraison-pierre | `/livraison-pierre-charlesbourg` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| excavation | `/excavation-charlesbourg` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| nivellement | `/nivellement-charlesbourg` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| dompe | `/dompe-charlesbourg` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| recherche-point-de-depot | `/recherche-point-de-depot-charlesbourg` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| courtage-materiaux | `/courtage-materiaux-charlesbourg` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| terre-tamisee | `/terre-tamisee-charlesbourg` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| terre-contaminee | `/terre-contaminee-charlesbourg` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| sable | `/sable-charlesbourg` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| gravier | `/gravier-charlesbourg` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| gravier-0-3-4 | `/gravier-0-3-4-charlesbourg` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| mg-20 | `/mg-20-charlesbourg` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| mg-56 | `/mg-56-charlesbourg` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| pierre | `/pierre-charlesbourg` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| pierre-concassee | `/pierre-concassee-charlesbourg` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| pierre-nette | `/pierre-nette-charlesbourg` | oui | oui | indexed | 16 | 2 | 4.0 | PROTÉGER |
| poussiere-de-pierre | `/poussiere-de-pierre-charlesbourg` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| roche | `/roche-charlesbourg` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| remblai | `/remblai-charlesbourg` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| beton | `/beton-charlesbourg` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| asphalte | `/asphalte-charlesbourg` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| brique | `/brique-charlesbourg` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| neige | `/neige-charlesbourg` | oui | oui | unknown | 0 | 0 | 0.0 |  |

### Charny — 28/28

| Famille | URL | Idx | Pub | Google | Impr. | Clics | Pos. | Risque |
|---|---|---|---|---|---|---|---|---|
| ville | `/charny` | oui | oui | indexed | 12 | 0 | 17.2 |  |
| transport-vrac | `/transport-vrac-charny` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| livraison-terre | `/livraison-terre-charny` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| livraison-sable | `/livraison-sable-charny` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| livraison-gravier | `/livraison-gravier-charny` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| livraison-pierre | `/livraison-pierre-charny` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| excavation | `/excavation-charny` | oui | oui | indexed | 13 | 0 | 44.6 | CANNIB. |
| nivellement | `/nivellement-charny` | oui | oui | unknown | 1 | 0 | 6.0 | CANNIB. |
| dompe | `/dompe-charny` | oui | oui | indexed | 2 | 0 | 5.5 |  |
| recherche-point-de-depot | `/recherche-point-de-depot-charny` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| courtage-materiaux | `/courtage-materiaux-charny` | oui | oui | indexed | 4 | 1 | 8.5 | PROTÉGER |
| terre-tamisee | `/terre-tamisee-charny` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| terre-contaminee | `/terre-contaminee-charny` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| sable | `/sable-charny` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| gravier | `/gravier-charny` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| gravier-0-3-4 | `/gravier-0-3-4-charny` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| mg-20 | `/mg-20-charny` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| mg-56 | `/mg-56-charny` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| pierre | `/pierre-charny` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| pierre-concassee | `/pierre-concassee-charny` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| pierre-nette | `/pierre-nette-charny` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| poussiere-de-pierre | `/poussiere-de-pierre-charny` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| roche | `/roche-charny` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| remblai | `/remblai-charny` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| beton | `/beton-charny` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| asphalte | `/asphalte-charny` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| brique | `/brique-charny` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| neige | `/neige-charny` | oui | oui | unknown | 0 | 0 | 0.0 |  |

### Château-Richer — 28/28

| Famille | URL | Idx | Pub | Google | Impr. | Clics | Pos. | Risque |
|---|---|---|---|---|---|---|---|---|
| ville | `/chateau-richer` | oui | oui | indexed | 29 | 4 | 12.6 | PROTÉGER |
| transport-vrac | `/transport-vrac-chateau-richer` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| livraison-terre | `/livraison-terre-chateau-richer` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| livraison-sable | `/livraison-sable-chateau-richer` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| livraison-gravier | `/livraison-gravier-chateau-richer` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| livraison-pierre | `/livraison-pierre-chateau-richer` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| excavation | `/excavation-chateau-richer` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| nivellement | `/nivellement-chateau-richer` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| dompe | `/dompe-chateau-richer` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| recherche-point-de-depot | `/recherche-point-de-depot-chateau-richer` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| courtage-materiaux | `/courtage-materiaux-chateau-richer` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| terre-tamisee | `/terre-tamisee-chateau-richer` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| terre-contaminee | `/terre-contaminee-chateau-richer` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| sable | `/sable-chateau-richer` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| gravier | `/gravier-chateau-richer` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| gravier-0-3-4 | `/gravier-0-3-4-chateau-richer` | oui | oui | indexed | 6 | 0 | 45.3 |  |
| mg-20 | `/mg-20-chateau-richer` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| mg-56 | `/mg-56-chateau-richer` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| pierre | `/pierre-chateau-richer` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| pierre-concassee | `/pierre-concassee-chateau-richer` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| pierre-nette | `/pierre-nette-chateau-richer` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| poussiere-de-pierre | `/poussiere-de-pierre-chateau-richer` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| roche | `/roche-chateau-richer` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| remblai | `/remblai-chateau-richer` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| beton | `/beton-chateau-richer` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| asphalte | `/asphalte-chateau-richer` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| brique | `/brique-chateau-richer` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| neige | `/neige-chateau-richer` | oui | oui | unknown | 0 | 0 | 0.0 |  |

### Donnacona — 28/28

| Famille | URL | Idx | Pub | Google | Impr. | Clics | Pos. | Risque |
|---|---|---|---|---|---|---|---|---|
| ville | `/donnacona` | oui | oui | indexed | 25 | 6 | 10.6 | CANNIB., PROTÉGER |
| transport-vrac | `/transport-vrac-donnacona` | oui | oui | unknown | 16 | 1 | 60.0 | CANNIB., PROTÉGER |
| livraison-terre | `/livraison-terre-donnacona` | oui | oui | indexed | 1 | 0 | 3.0 | CANNIB. |
| livraison-sable | `/livraison-sable-donnacona` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| livraison-gravier | `/livraison-gravier-donnacona` | oui | oui | indexed | 10 | 2 | 3.1 | CANNIB., PROTÉGER |
| livraison-pierre | `/livraison-pierre-donnacona` | oui | oui | indexed | 5 | 0 | 6.8 | CANNIB. |
| excavation | `/excavation-donnacona` | oui | oui | indexed | 1 | 0 | 5.0 | CANNIB. |
| nivellement | `/nivellement-donnacona` | oui | oui | indexed | 8 | 0 | 6.4 | CANNIB. |
| dompe | `/dompe-donnacona` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| recherche-point-de-depot | `/recherche-point-de-depot-donnacona` | oui | oui | indexed | 3 | 0 | 6.3 |  |
| courtage-materiaux | `/courtage-materiaux-donnacona` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| terre-tamisee | `/terre-tamisee-donnacona` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| terre-contaminee | `/terre-contaminee-donnacona` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| sable | `/sable-donnacona` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| gravier | `/gravier-donnacona` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| gravier-0-3-4 | `/gravier-0-3-4-donnacona` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| mg-20 | `/mg-20-donnacona` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| mg-56 | `/mg-56-donnacona` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| pierre | `/pierre-donnacona` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| pierre-concassee | `/pierre-concassee-donnacona` | oui | oui | — | 0 | 0 |  |  |
| pierre-nette | `/pierre-nette-donnacona` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| poussiere-de-pierre | `/poussiere-de-pierre-donnacona` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| roche | `/roche-donnacona` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| remblai | `/remblai-donnacona` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| beton | `/beton-donnacona` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| asphalte | `/asphalte-donnacona` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| brique | `/brique-donnacona` | oui | oui | indexed | 0 | 0 |  |  |
| neige | `/neige-donnacona` | oui | oui | unknown | 0 | 0 | 0.0 |  |

### Duberger — 28/28

| Famille | URL | Idx | Pub | Google | Impr. | Clics | Pos. | Risque |
|---|---|---|---|---|---|---|---|---|
| ville | `/duberger` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| transport-vrac | `/transport-vrac-duberger` | oui | oui | indexed | 16 | 0 | 63.6 | CANNIB. |
| livraison-terre | `/livraison-terre-duberger` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| livraison-sable | `/livraison-sable-duberger` | oui | oui | indexed | 17 | 0 | 32.4 | CANNIB. |
| livraison-gravier | `/livraison-gravier-duberger` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| livraison-pierre | `/livraison-pierre-duberger` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| excavation | `/excavation-duberger` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| nivellement | `/nivellement-duberger` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| dompe | `/dompe-duberger` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| recherche-point-de-depot | `/recherche-point-de-depot-duberger` | oui | oui | unknown | 19 | 0 | 20.4 |  |
| courtage-materiaux | `/courtage-materiaux-duberger` | oui | oui | unknown | 1 | 0 | 4.0 |  |
| terre-tamisee | `/terre-tamisee-duberger` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| terre-contaminee | `/terre-contaminee-duberger` | oui | oui | unknown | 1 | 0 | 7.0 |  |
| sable | `/sable-duberger` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| gravier | `/gravier-duberger` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| gravier-0-3-4 | `/gravier-0-3-4-duberger` | oui | oui | indexed | 10 | 1 | 4.6 | PROTÉGER |
| mg-20 | `/mg-20-duberger` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| mg-56 | `/mg-56-duberger` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| pierre | `/pierre-duberger` | oui | oui | unknown | 9 | 0 | 50.3 |  |
| pierre-concassee | `/pierre-concassee-duberger` | oui | oui | unknown | 28 | 0 | 57.1 |  |
| pierre-nette | `/pierre-nette-duberger` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| poussiere-de-pierre | `/poussiere-de-pierre-duberger` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| roche | `/roche-duberger` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| remblai | `/remblai-duberger` | oui | oui | indexed | 135 | 2 | 29.5 | PROTÉGER |
| beton | `/beton-duberger` | oui | oui | indexed | 25 | 0 | 11.6 |  |
| asphalte | `/asphalte-duberger` | oui | oui | — | 0 | 0 |  |  |
| brique | `/brique-duberger` | oui | oui | unknown | 0 | 0 |  |  |
| neige | `/neige-duberger` | oui | oui | unknown | 0 | 0 | 0.0 |  |

### Fossambault-sur-le-Lac — 28/28

| Famille | URL | Idx | Pub | Google | Impr. | Clics | Pos. | Risque |
|---|---|---|---|---|---|---|---|---|
| ville | `/fossambault-sur-le-lac` | oui | oui | indexed | 1 | 0 | 8.0 | CANNIB. |
| transport-vrac | `/transport-vrac-fossambault-sur-le-lac` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| livraison-terre | `/livraison-terre-fossambault-sur-le-lac` | oui | oui | indexed | 2 | 1 | 3.0 | CANNIB., PROTÉGER |
| livraison-sable | `/livraison-sable-fossambault-sur-le-lac` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| livraison-gravier | `/livraison-gravier-fossambault-sur-le-lac` | oui | oui | indexed | 15 | 0 | 6.1 | CANNIB. |
| livraison-pierre | `/livraison-pierre-fossambault-sur-le-lac` | oui | oui | unknown | 1 | 0 | 6.0 | CANNIB. |
| excavation | `/excavation-fossambault-sur-le-lac` | oui | oui | indexed | 9 | 0 | 2.9 | CANNIB. |
| nivellement | `/nivellement-fossambault-sur-le-lac` | oui | oui | unknown | 4 | 0 | 64.2 | CANNIB. |
| dompe | `/dompe-fossambault-sur-le-lac` | oui | oui | indexed | 7 | 0 | 8.6 | CANNIB. |
| recherche-point-de-depot | `/recherche-point-de-depot-fossambault-sur-le-lac` | oui | oui | unknown | 2 | 0 | 10.5 | CANNIB. |
| courtage-materiaux | `/courtage-materiaux-fossambault-sur-le-lac` | oui | oui | unknown | 16 | 0 | 57.7 |  |
| terre-tamisee | `/terre-tamisee-fossambault-sur-le-lac` | oui | oui | unknown | 1 | 0 | 4.0 | CANNIB. |
| terre-contaminee | `/terre-contaminee-fossambault-sur-le-lac` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| sable | `/sable-fossambault-sur-le-lac` | oui | oui | indexed | 10 | 1 | 49.6 | PROTÉGER |
| gravier | `/gravier-fossambault-sur-le-lac` | oui | oui | unknown | 0 | 0 |  |  |
| gravier-0-3-4 | `/gravier-0-3-4-fossambault-sur-le-lac` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| mg-20 | `/mg-20-fossambault-sur-le-lac` | oui | oui | indexed | 17 | 0 | 6.5 |  |
| mg-56 | `/mg-56-fossambault-sur-le-lac` | oui | oui | indexed | 73 | 1 | 4.8 | PROTÉGER |
| pierre | `/pierre-fossambault-sur-le-lac` | oui | oui | indexed | 1 | 0 | 6.0 | CANNIB. |
| pierre-concassee | `/pierre-concassee-fossambault-sur-le-lac` | oui | oui | unknown | 13 | 0 | 85.0 |  |
| pierre-nette | `/pierre-nette-fossambault-sur-le-lac` | oui | oui | indexed | 6 | 0 | 9.8 |  |
| poussiere-de-pierre | `/poussiere-de-pierre-fossambault-sur-le-lac` | oui | oui | indexed | 3 | 0 | 6.7 |  |
| roche | `/roche-fossambault-sur-le-lac` | oui | oui | indexed | 7 | 2 | 6.0 | PROTÉGER |
| remblai | `/remblai-fossambault-sur-le-lac` | oui | oui | unknown | 13 | 0 | 78.9 |  |
| beton | `/beton-fossambault-sur-le-lac` | oui | oui | unknown | 7 | 0 | 25.9 |  |
| asphalte | `/asphalte-fossambault-sur-le-lac` | oui | oui | indexed | 5 | 1 | 8.2 | PROTÉGER |
| brique | `/brique-fossambault-sur-le-lac` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| neige | `/neige-fossambault-sur-le-lac` | oui | oui | unknown | 6 | 0 | 3.2 |  |

### L'Ancienne-Lorette — 28/28

| Famille | URL | Idx | Pub | Google | Impr. | Clics | Pos. | Risque |
|---|---|---|---|---|---|---|---|---|
| ville | `/l-ancienne-lorette` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| transport-vrac | `/transport-vrac-l-ancienne-lorette` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| livraison-terre | `/livraison-terre-l-ancienne-lorette` | oui | oui | indexed | 37 | 3 | 4.8 | PROTÉGER |
| livraison-sable | `/livraison-sable-l-ancienne-lorette` | oui | oui | unknown | 4 | 0 | 46.5 |  |
| livraison-gravier | `/livraison-gravier-l-ancienne-lorette` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| livraison-pierre | `/livraison-pierre-l-ancienne-lorette` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| excavation | `/excavation-l-ancienne-lorette` | oui | oui | indexed | 442 | 0 | 14.5 | PROTÉGER |
| nivellement | `/nivellement-l-ancienne-lorette` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| dompe | `/dompe-l-ancienne-lorette` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| recherche-point-de-depot | `/recherche-point-de-depot-l-ancienne-lorette` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| courtage-materiaux | `/courtage-materiaux-l-ancienne-lorette` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| terre-tamisee | `/terre-tamisee-l-ancienne-lorette` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| terre-contaminee | `/terre-contaminee-l-ancienne-lorette` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| sable | `/sable-l-ancienne-lorette` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| gravier | `/gravier-l-ancienne-lorette` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| gravier-0-3-4 | `/gravier-0-3-4-l-ancienne-lorette` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| mg-20 | `/mg-20-l-ancienne-lorette` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| mg-56 | `/mg-56-l-ancienne-lorette` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| pierre | `/pierre-l-ancienne-lorette` | oui | oui | indexed | 28 | 1 | 19.9 | PROTÉGER |
| pierre-concassee | `/pierre-concassee-l-ancienne-lorette` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| pierre-nette | `/pierre-nette-l-ancienne-lorette` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| poussiere-de-pierre | `/poussiere-de-pierre-l-ancienne-lorette` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| roche | `/roche-l-ancienne-lorette` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| remblai | `/remblai-l-ancienne-lorette` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| beton | `/beton-l-ancienne-lorette` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| asphalte | `/asphalte-l-ancienne-lorette` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| brique | `/brique-l-ancienne-lorette` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| neige | `/neige-l-ancienne-lorette` | oui | oui | unknown | 0 | 0 | 0.0 |  |

### L'Ange-Gardien — 28/28

| Famille | URL | Idx | Pub | Google | Impr. | Clics | Pos. | Risque |
|---|---|---|---|---|---|---|---|---|
| ville | `/l-ange-gardien` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| transport-vrac | `/transport-vrac-l-ange-gardien` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| livraison-terre | `/livraison-terre-l-ange-gardien` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| livraison-sable | `/livraison-sable-l-ange-gardien` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| livraison-gravier | `/livraison-gravier-l-ange-gardien` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| livraison-pierre | `/livraison-pierre-l-ange-gardien` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| excavation | `/excavation-l-ange-gardien` | oui | oui | indexed | 12 | 0 | 20.5 |  |
| nivellement | `/nivellement-l-ange-gardien` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| dompe | `/dompe-l-ange-gardien` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| recherche-point-de-depot | `/recherche-point-de-depot-l-ange-gardien` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| courtage-materiaux | `/courtage-materiaux-l-ange-gardien` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| terre-tamisee | `/terre-tamisee-l-ange-gardien` | oui | oui | indexed | 6 | 1 | 11.5 | PROTÉGER |
| terre-contaminee | `/terre-contaminee-l-ange-gardien` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| sable | `/sable-l-ange-gardien` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| gravier | `/gravier-l-ange-gardien` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| gravier-0-3-4 | `/gravier-0-3-4-l-ange-gardien` | oui | oui | indexed | 41 | 0 | 10.3 |  |
| mg-20 | `/mg-20-l-ange-gardien` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| mg-56 | `/mg-56-l-ange-gardien` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| pierre | `/pierre-l-ange-gardien` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| pierre-concassee | `/pierre-concassee-l-ange-gardien` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| pierre-nette | `/pierre-nette-l-ange-gardien` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| poussiere-de-pierre | `/poussiere-de-pierre-l-ange-gardien` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| roche | `/roche-l-ange-gardien` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| remblai | `/remblai-l-ange-gardien` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| beton | `/beton-l-ange-gardien` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| asphalte | `/asphalte-l-ange-gardien` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| brique | `/brique-l-ange-gardien` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| neige | `/neige-l-ange-gardien` | oui | oui | unknown | 0 | 0 | 0.0 |  |

### La Cité-Limoilou — 28/28

| Famille | URL | Idx | Pub | Google | Impr. | Clics | Pos. | Risque |
|---|---|---|---|---|---|---|---|---|
| ville | `/la-cite-limoilou` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| transport-vrac | `/transport-vrac-la-cite-limoilou` | oui | oui | indexed | 37 | 0 | 21.5 | CANNIB. |
| livraison-terre | `/livraison-terre-la-cite-limoilou` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| livraison-sable | `/livraison-sable-la-cite-limoilou` | oui | oui | indexed | 57 | 0 | 21.6 | CANNIB. |
| livraison-gravier | `/livraison-gravier-la-cite-limoilou` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| livraison-pierre | `/livraison-pierre-la-cite-limoilou` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| excavation | `/excavation-la-cite-limoilou` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| nivellement | `/nivellement-la-cite-limoilou` | oui | oui | indexed | 968 | 0 | 10.3 | PROTÉGER |
| dompe | `/dompe-la-cite-limoilou` | oui | oui | indexed | 26 | 1 | 26.3 | PROTÉGER |
| recherche-point-de-depot | `/recherche-point-de-depot-la-cite-limoilou` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| courtage-materiaux | `/courtage-materiaux-la-cite-limoilou` | oui | oui | indexed | 35 | 0 | 28.3 |  |
| terre-tamisee | `/terre-tamisee-la-cite-limoilou` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| terre-contaminee | `/terre-contaminee-la-cite-limoilou` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| sable | `/sable-la-cite-limoilou` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| gravier | `/gravier-la-cite-limoilou` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| gravier-0-3-4 | `/gravier-0-3-4-la-cite-limoilou` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| mg-20 | `/mg-20-la-cite-limoilou` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| mg-56 | `/mg-56-la-cite-limoilou` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| pierre | `/pierre-la-cite-limoilou` | oui | oui | unknown | 0 | 0 |  |  |
| pierre-concassee | `/pierre-concassee-la-cite-limoilou` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| pierre-nette | `/pierre-nette-la-cite-limoilou` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| poussiere-de-pierre | `/poussiere-de-pierre-la-cite-limoilou` | oui | oui | indexed | 13 | 2 | 8.8 | PROTÉGER |
| roche | `/roche-la-cite-limoilou` | oui | oui | unknown | 0 | 0 |  |  |
| remblai | `/remblai-la-cite-limoilou` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| beton | `/beton-la-cite-limoilou` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| asphalte | `/asphalte-la-cite-limoilou` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| brique | `/brique-la-cite-limoilou` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| neige | `/neige-la-cite-limoilou` | oui | oui | unknown | 0 | 0 | 0.0 |  |

### La Haute-Saint-Charles — 28/28

| Famille | URL | Idx | Pub | Google | Impr. | Clics | Pos. | Risque |
|---|---|---|---|---|---|---|---|---|
| ville | `/la-haute-saint-charles` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| transport-vrac | `/transport-vrac-la-haute-saint-charles` | oui | oui | unknown | 45 | 0 | 71.2 | CANNIB. |
| livraison-terre | `/livraison-terre-la-haute-saint-charles` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| livraison-sable | `/livraison-sable-la-haute-saint-charles` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| livraison-gravier | `/livraison-gravier-la-haute-saint-charles` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| livraison-pierre | `/livraison-pierre-la-haute-saint-charles` | oui | oui | indexed | 3 | 0 | 52.7 | CANNIB. |
| excavation | `/excavation-la-haute-saint-charles` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| nivellement | `/nivellement-la-haute-saint-charles` | oui | oui | unknown | 5 | 0 | 42.2 |  |
| dompe | `/dompe-la-haute-saint-charles` | oui | oui | indexed | 25 | 0 | 7.2 | CANNIB., PROTÉGER |
| recherche-point-de-depot | `/recherche-point-de-depot-la-haute-saint-charles` | oui | oui | unknown | 12 | 0 | 14.9 | CANNIB. |
| courtage-materiaux | `/courtage-materiaux-la-haute-saint-charles` | oui | oui | unknown | 5 | 0 | 81.4 |  |
| terre-tamisee | `/terre-tamisee-la-haute-saint-charles` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| terre-contaminee | `/terre-contaminee-la-haute-saint-charles` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| sable | `/sable-la-haute-saint-charles` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| gravier | `/gravier-la-haute-saint-charles` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| gravier-0-3-4 | `/gravier-0-3-4-la-haute-saint-charles` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| mg-20 | `/mg-20-la-haute-saint-charles` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| mg-56 | `/mg-56-la-haute-saint-charles` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| pierre | `/pierre-la-haute-saint-charles` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| pierre-concassee | `/pierre-concassee-la-haute-saint-charles` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| pierre-nette | `/pierre-nette-la-haute-saint-charles` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| poussiere-de-pierre | `/poussiere-de-pierre-la-haute-saint-charles` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| roche | `/roche-la-haute-saint-charles` | oui | oui | indexed | 12 | 0 | 7.7 |  |
| remblai | `/remblai-la-haute-saint-charles` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| beton | `/beton-la-haute-saint-charles` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| asphalte | `/asphalte-la-haute-saint-charles` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| brique | `/brique-la-haute-saint-charles` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| neige | `/neige-la-haute-saint-charles` | oui | oui | unknown | 0 | 0 | 0.0 |  |

### Lac-Beauport — 28/28

| Famille | URL | Idx | Pub | Google | Impr. | Clics | Pos. | Risque |
|---|---|---|---|---|---|---|---|---|
| ville | `/lac-beauport` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| transport-vrac | `/transport-vrac-lac-beauport` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| livraison-terre | `/livraison-terre-lac-beauport` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| livraison-sable | `/livraison-sable-lac-beauport` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| livraison-gravier | `/livraison-gravier-lac-beauport` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| livraison-pierre | `/livraison-pierre-lac-beauport` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| excavation | `/excavation-lac-beauport` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| nivellement | `/nivellement-lac-beauport` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| dompe | `/dompe-lac-beauport` | oui | oui | indexed | 17 | 0 | 34.2 |  |
| recherche-point-de-depot | `/recherche-point-de-depot-lac-beauport` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| courtage-materiaux | `/courtage-materiaux-lac-beauport` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| terre-tamisee | `/terre-tamisee-lac-beauport` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| terre-contaminee | `/terre-contaminee-lac-beauport` | oui | oui | indexed | 7 | 0 | 7.4 |  |
| sable | `/sable-lac-beauport` | oui | oui | indexed | 19 | 0 | 12.7 |  |
| gravier | `/gravier-lac-beauport` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| gravier-0-3-4 | `/gravier-0-3-4-lac-beauport` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| mg-20 | `/mg-20-lac-beauport` | oui | oui | indexed | 87 | 1 | 5.0 | PROTÉGER |
| mg-56 | `/mg-56-lac-beauport` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| pierre | `/pierre-lac-beauport` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| pierre-concassee | `/pierre-concassee-lac-beauport` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| pierre-nette | `/pierre-nette-lac-beauport` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| poussiere-de-pierre | `/poussiere-de-pierre-lac-beauport` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| roche | `/roche-lac-beauport` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| remblai | `/remblai-lac-beauport` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| beton | `/beton-lac-beauport` | oui | oui | indexed | 18 | 0 | 18.7 |  |
| asphalte | `/asphalte-lac-beauport` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| brique | `/brique-lac-beauport` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| neige | `/neige-lac-beauport` | oui | oui | unknown | 0 | 0 | 0.0 |  |

### Lac-Delage — 28/28

| Famille | URL | Idx | Pub | Google | Impr. | Clics | Pos. | Risque |
|---|---|---|---|---|---|---|---|---|
| ville | `/lac-delage` | oui | oui | indexed | 7 | 0 | 45.6 | CANNIB. |
| transport-vrac | `/transport-vrac-lac-delage` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| livraison-terre | `/livraison-terre-lac-delage` | oui | oui | unknown | 1 | 0 | 9.0 | CANNIB. |
| livraison-sable | `/livraison-sable-lac-delage` | oui | oui | — | 0 | 0 |  |  |
| livraison-gravier | `/livraison-gravier-lac-delage` | oui | oui | indexed | 11 | 0 | 24.0 | CANNIB. |
| livraison-pierre | `/livraison-pierre-lac-delage` | oui | oui | indexed | 10 | 0 | 30.3 | CANNIB. |
| excavation | `/excavation-lac-delage` | oui | oui | indexed | 1 | 0 | 93.0 | CANNIB. |
| nivellement | `/nivellement-lac-delage` | oui | oui | indexed | 41 | 0 | 45.9 | CANNIB. |
| dompe | `/dompe-lac-delage` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| recherche-point-de-depot | `/recherche-point-de-depot-lac-delage` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| courtage-materiaux | `/courtage-materiaux-lac-delage` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| terre-tamisee | `/terre-tamisee-lac-delage` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| terre-contaminee | `/terre-contaminee-lac-delage` | oui | oui | indexed | 2 | 0 | 9.0 |  |
| sable | `/sable-lac-delage` | oui | oui | indexed | 11 | 0 | 44.9 |  |
| gravier | `/gravier-lac-delage` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| gravier-0-3-4 | `/gravier-0-3-4-lac-delage` | oui | oui | indexed | 61 | 2 | 10.4 | PROTÉGER |
| mg-20 | `/mg-20-lac-delage` | oui | oui | indexed | 10 | 0 | 7.4 |  |
| mg-56 | `/mg-56-lac-delage` | oui | oui | indexed | 2 | 0 | 4.5 |  |
| pierre | `/pierre-lac-delage` | oui | oui | unknown | 3 | 0 | 52.0 | CANNIB. |
| pierre-concassee | `/pierre-concassee-lac-delage` | oui | oui | indexed | 54 | 0 | 16.8 |  |
| pierre-nette | `/pierre-nette-lac-delage` | oui | oui | indexed | 4 | 0 | 5.8 |  |
| poussiere-de-pierre | `/poussiere-de-pierre-lac-delage` | oui | oui | unknown | 0 | 0 |  |  |
| roche | `/roche-lac-delage` | oui | oui | unknown | 2 | 0 | 6.0 |  |
| remblai | `/remblai-lac-delage` | oui | oui | indexed | 23 | 0 | 17.0 |  |
| beton | `/beton-lac-delage` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| asphalte | `/asphalte-lac-delage` | oui | oui | indexed | 22 | 0 | 13.5 |  |
| brique | `/brique-lac-delage` | oui | oui | indexed | 1 | 0 | 5.0 |  |
| neige | `/neige-lac-delage` | oui | oui | unknown | 0 | 0 | 0.0 |  |

### Lac-Saint-Charles — 28/28

| Famille | URL | Idx | Pub | Google | Impr. | Clics | Pos. | Risque |
|---|---|---|---|---|---|---|---|---|
| ville | `/lac-saint-charles` | oui | oui | indexed | 16 | 0 | 6.2 | CANNIB. |
| transport-vrac | `/transport-vrac-lac-saint-charles` | oui | oui | unknown | 0 | 0 |  |  |
| livraison-terre | `/livraison-terre-lac-saint-charles` | oui | oui | indexed | 13 | 1 | 11.5 | CANNIB., PROTÉGER |
| livraison-sable | `/livraison-sable-lac-saint-charles` | oui | oui | indexed | 63 | 0 | 18.0 | CANNIB. |
| livraison-gravier | `/livraison-gravier-lac-saint-charles` | oui | oui | indexed | 18 | 0 | 10.6 | CANNIB. |
| livraison-pierre | `/livraison-pierre-lac-saint-charles` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| excavation | `/excavation-lac-saint-charles` | oui | oui | indexed | 26 | 0 | 32.7 |  |
| nivellement | `/nivellement-lac-saint-charles` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| dompe | `/dompe-lac-saint-charles` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| recherche-point-de-depot | `/recherche-point-de-depot-lac-saint-charles` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| courtage-materiaux | `/courtage-materiaux-lac-saint-charles` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| terre-tamisee | `/terre-tamisee-lac-saint-charles` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| terre-contaminee | `/terre-contaminee-lac-saint-charles` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| sable | `/sable-lac-saint-charles` | oui | oui | indexed | 12 | 0 | 71.2 | CANNIB. |
| gravier | `/gravier-lac-saint-charles` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| gravier-0-3-4 | `/gravier-0-3-4-lac-saint-charles` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| mg-20 | `/mg-20-lac-saint-charles` | oui | oui | unknown | 25 | 0 | 5.6 | PROTÉGER |
| mg-56 | `/mg-56-lac-saint-charles` | oui | oui | unknown | 0 | 0 |  |  |
| pierre | `/pierre-lac-saint-charles` | oui | oui | indexed | 11 | 0 | 23.9 |  |
| pierre-concassee | `/pierre-concassee-lac-saint-charles` | oui | oui | indexed | 46 | 0 | 32.4 |  |
| pierre-nette | `/pierre-nette-lac-saint-charles` | oui | oui | unknown | 5 | 0 | 30.0 |  |
| poussiere-de-pierre | `/poussiere-de-pierre-lac-saint-charles` | oui | oui | indexed | 25 | 0 | 14.8 |  |
| roche | `/roche-lac-saint-charles` | oui | oui | indexed | 0 | 0 |  |  |
| remblai | `/remblai-lac-saint-charles` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| beton | `/beton-lac-saint-charles` | oui | oui | indexed | 3 | 1 | 3.3 | PROTÉGER |
| asphalte | `/asphalte-lac-saint-charles` | oui | oui | unknown | 3 | 0 | 3.3 |  |
| brique | `/brique-lac-saint-charles` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| neige | `/neige-lac-saint-charles` | oui | oui | unknown | 5 | 0 | 7.0 |  |

### Lac-Saint-Joseph — 28/28

| Famille | URL | Idx | Pub | Google | Impr. | Clics | Pos. | Risque |
|---|---|---|---|---|---|---|---|---|
| ville | `/lac-saint-joseph` | oui | oui | indexed | 2 | 1 | 7.5 | CANNIB., PROTÉGER |
| transport-vrac | `/transport-vrac-lac-saint-joseph` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| livraison-terre | `/livraison-terre-lac-saint-joseph` | oui | oui | indexed | 0 | 0 |  |  |
| livraison-sable | `/livraison-sable-lac-saint-joseph` | oui | oui | unknown | 2 | 0 | 3.0 | CANNIB. |
| livraison-gravier | `/livraison-gravier-lac-saint-joseph` | oui | oui | unknown | 3 | 0 | 5.0 | CANNIB. |
| livraison-pierre | `/livraison-pierre-lac-saint-joseph` | oui | oui | unknown | 2 | 0 | 1.5 | CANNIB. |
| excavation | `/excavation-lac-saint-joseph` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| nivellement | `/nivellement-lac-saint-joseph` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| dompe | `/dompe-lac-saint-joseph` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| recherche-point-de-depot | `/recherche-point-de-depot-lac-saint-joseph` | oui | oui | unknown | 4 | 0 | 15.2 |  |
| courtage-materiaux | `/courtage-materiaux-lac-saint-joseph` | oui | oui | unknown | 2 | 0 | 5.0 |  |
| terre-tamisee | `/terre-tamisee-lac-saint-joseph` | oui | oui | indexed | 15 | 0 | 8.0 |  |
| terre-contaminee | `/terre-contaminee-lac-saint-joseph` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| sable | `/sable-lac-saint-joseph` | oui | oui | unknown | 1 | 0 | 11.0 | CANNIB. |
| gravier | `/gravier-lac-saint-joseph` | oui | oui | indexed | 5 | 0 | 10.2 | CANNIB. |
| gravier-0-3-4 | `/gravier-0-3-4-lac-saint-joseph` | oui | oui | indexed | 12 | 0 | 5.0 |  |
| mg-20 | `/mg-20-lac-saint-joseph` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| mg-56 | `/mg-56-lac-saint-joseph` | oui | oui | indexed | 2 | 0 | 7.0 |  |
| pierre | `/pierre-lac-saint-joseph` | oui | oui | indexed | 22 | 0 | 44.5 | CANNIB. |
| pierre-concassee | `/pierre-concassee-lac-saint-joseph` | oui | oui | indexed | 71 | 0 | 44.8 |  |
| pierre-nette | `/pierre-nette-lac-saint-joseph` | oui | oui | unknown | 2 | 0 | 31.0 |  |
| poussiere-de-pierre | `/poussiere-de-pierre-lac-saint-joseph` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| roche | `/roche-lac-saint-joseph` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| remblai | `/remblai-lac-saint-joseph` | oui | oui | indexed | 1 | 0 | 2.0 |  |
| beton | `/beton-lac-saint-joseph` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| asphalte | `/asphalte-lac-saint-joseph` | oui | oui | unknown | 5 | 0 | 4.8 |  |
| brique | `/brique-lac-saint-joseph` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| neige | `/neige-lac-saint-joseph` | oui | oui | unknown | 0 | 0 | 0.0 |  |

### Laurier-Station — 28/28

| Famille | URL | Idx | Pub | Google | Impr. | Clics | Pos. | Risque |
|---|---|---|---|---|---|---|---|---|
| ville | `/laurier-station` | oui | oui | indexed | 25 | 1 | 28.9 | CANNIB., PROTÉGER |
| transport-vrac | `/transport-vrac-laurier-station` | oui | oui | indexed | 43 | 0 | 18.5 | CANNIB. |
| livraison-terre | `/livraison-terre-laurier-station` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| livraison-sable | `/livraison-sable-laurier-station` | oui | oui | indexed | 45 | 1 | 4.1 | CANNIB., PROTÉGER |
| livraison-gravier | `/livraison-gravier-laurier-station` | oui | oui | indexed | 17 | 3 | 3.1 | CANNIB., PROTÉGER |
| livraison-pierre | `/livraison-pierre-laurier-station` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| excavation | `/excavation-laurier-station` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| nivellement | `/nivellement-laurier-station` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| dompe | `/dompe-laurier-station` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| recherche-point-de-depot | `/recherche-point-de-depot-laurier-station` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| courtage-materiaux | `/courtage-materiaux-laurier-station` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| terre-tamisee | `/terre-tamisee-laurier-station` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| terre-contaminee | `/terre-contaminee-laurier-station` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| sable | `/sable-laurier-station` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| gravier | `/gravier-laurier-station` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| gravier-0-3-4 | `/gravier-0-3-4-laurier-station` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| mg-20 | `/mg-20-laurier-station` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| mg-56 | `/mg-56-laurier-station` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| pierre | `/pierre-laurier-station` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| pierre-concassee | `/pierre-concassee-laurier-station` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| pierre-nette | `/pierre-nette-laurier-station` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| poussiere-de-pierre | `/poussiere-de-pierre-laurier-station` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| roche | `/roche-laurier-station` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| remblai | `/remblai-laurier-station` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| beton | `/beton-laurier-station` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| asphalte | `/asphalte-laurier-station` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| brique | `/brique-laurier-station` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| neige | `/neige-laurier-station` | oui | oui | unknown | 0 | 0 | 0.0 |  |

### Lauzon — 28/28

| Famille | URL | Idx | Pub | Google | Impr. | Clics | Pos. | Risque |
|---|---|---|---|---|---|---|---|---|
| ville | `/lauzon` | oui | oui | indexed | 8 | 0 | 7.6 | CANNIB. |
| transport-vrac | `/transport-vrac-lauzon` | oui | oui | indexed | 15 | 0 | 56.2 | CANNIB. |
| livraison-terre | `/livraison-terre-lauzon` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| livraison-sable | `/livraison-sable-lauzon` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| livraison-gravier | `/livraison-gravier-lauzon` | oui | oui | indexed | 4 | 1 | 9.0 | CANNIB., PROTÉGER |
| livraison-pierre | `/livraison-pierre-lauzon` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| excavation | `/excavation-lauzon` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| nivellement | `/nivellement-lauzon` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| dompe | `/dompe-lauzon` | oui | oui | indexed | 9 | 0 | 8.0 | CANNIB. |
| recherche-point-de-depot | `/recherche-point-de-depot-lauzon` | oui | oui | unknown | 1 | 0 | 49.0 | CANNIB. |
| courtage-materiaux | `/courtage-materiaux-lauzon` | oui | oui | unknown | 3 | 0 | 5.0 |  |
| terre-tamisee | `/terre-tamisee-lauzon` | oui | oui | indexed | 1 | 0 | 36.0 |  |
| terre-contaminee | `/terre-contaminee-lauzon` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| sable | `/sable-lauzon` | oui | oui | indexed | 2 | 0 | 3.0 |  |
| gravier | `/gravier-lauzon` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| gravier-0-3-4 | `/gravier-0-3-4-lauzon` | oui | oui | indexed | 11 | 0 | 21.4 |  |
| mg-20 | `/mg-20-lauzon` | oui | oui | indexed | 13 | 1 | 4.9 | PROTÉGER |
| mg-56 | `/mg-56-lauzon` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| pierre | `/pierre-lauzon` | oui | oui | unknown | 5 | 0 | 5.6 |  |
| pierre-concassee | `/pierre-concassee-lauzon` | oui | oui | unknown | 1 | 0 | 3.0 |  |
| pierre-nette | `/pierre-nette-lauzon` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| poussiere-de-pierre | `/poussiere-de-pierre-lauzon` | oui | oui | indexed | 15 | 0 | 13.2 |  |
| roche | `/roche-lauzon` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| remblai | `/remblai-lauzon` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| beton | `/beton-lauzon` | oui | oui | indexed | 16 | 0 | 12.2 |  |
| asphalte | `/asphalte-lauzon` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| brique | `/brique-lauzon` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| neige | `/neige-lauzon` | oui | oui | unknown | 0 | 0 | 0.0 |  |

### Les Rivières — 28/28

| Famille | URL | Idx | Pub | Google | Impr. | Clics | Pos. | Risque |
|---|---|---|---|---|---|---|---|---|
| ville | `/les-rivieres` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| transport-vrac | `/transport-vrac-les-rivieres` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| livraison-terre | `/livraison-terre-les-rivieres` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| livraison-sable | `/livraison-sable-les-rivieres` | oui | oui | indexed | 25 | 0 | 11.0 |  |
| livraison-gravier | `/livraison-gravier-les-rivieres` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| livraison-pierre | `/livraison-pierre-les-rivieres` | oui | oui | indexed | 23 | 1 | 9.7 | PROTÉGER |
| excavation | `/excavation-les-rivieres` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| nivellement | `/nivellement-les-rivieres` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| dompe | `/dompe-les-rivieres` | oui | oui | indexed | 9 | 0 | 5.0 |  |
| recherche-point-de-depot | `/recherche-point-de-depot-les-rivieres` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| courtage-materiaux | `/courtage-materiaux-les-rivieres` | oui | oui | indexed | 1 | 0 | 9.0 |  |
| terre-tamisee | `/terre-tamisee-les-rivieres` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| terre-contaminee | `/terre-contaminee-les-rivieres` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| sable | `/sable-les-rivieres` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| gravier | `/gravier-les-rivieres` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| gravier-0-3-4 | `/gravier-0-3-4-les-rivieres` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| mg-20 | `/mg-20-les-rivieres` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| mg-56 | `/mg-56-les-rivieres` | oui | oui | indexed | 16 | 1 | 6.1 | PROTÉGER |
| pierre | `/pierre-les-rivieres` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| pierre-concassee | `/pierre-concassee-les-rivieres` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| pierre-nette | `/pierre-nette-les-rivieres` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| poussiere-de-pierre | `/poussiere-de-pierre-les-rivieres` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| roche | `/roche-les-rivieres` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| remblai | `/remblai-les-rivieres` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| beton | `/beton-les-rivieres` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| asphalte | `/asphalte-les-rivieres` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| brique | `/brique-les-rivieres` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| neige | `/neige-les-rivieres` | oui | oui | unknown | 0 | 0 | 0.0 |  |

### Limoilou — 28/28

| Famille | URL | Idx | Pub | Google | Impr. | Clics | Pos. | Risque |
|---|---|---|---|---|---|---|---|---|
| ville | `/limoilou` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| transport-vrac | `/transport-vrac-limoilou` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| livraison-terre | `/livraison-terre-limoilou` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| livraison-sable | `/livraison-sable-limoilou` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| livraison-gravier | `/livraison-gravier-limoilou` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| livraison-pierre | `/livraison-pierre-limoilou` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| excavation | `/excavation-limoilou` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| nivellement | `/nivellement-limoilou` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| dompe | `/dompe-limoilou` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| recherche-point-de-depot | `/recherche-point-de-depot-limoilou` | oui | oui | indexed | 6 | 0 | 16.8 |  |
| courtage-materiaux | `/courtage-materiaux-limoilou` | oui | oui | indexed | 10 | 1 | 40.6 | PROTÉGER |
| terre-tamisee | `/terre-tamisee-limoilou` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| terre-contaminee | `/terre-contaminee-limoilou` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| sable | `/sable-limoilou` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| gravier | `/gravier-limoilou` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| gravier-0-3-4 | `/gravier-0-3-4-limoilou` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| mg-20 | `/mg-20-limoilou` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| mg-56 | `/mg-56-limoilou` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| pierre | `/pierre-limoilou` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| pierre-concassee | `/pierre-concassee-limoilou` | oui | oui | indexed | 28 | 2 | 36.5 | PROTÉGER |
| pierre-nette | `/pierre-nette-limoilou` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| poussiere-de-pierre | `/poussiere-de-pierre-limoilou` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| roche | `/roche-limoilou` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| remblai | `/remblai-limoilou` | oui | oui | indexed | 17 | 0 | 42.2 |  |
| beton | `/beton-limoilou` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| asphalte | `/asphalte-limoilou` | oui | oui | indexed | 14 | 1 | 5.3 | PROTÉGER |
| brique | `/brique-limoilou` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| neige | `/neige-limoilou` | oui | oui | unknown | 0 | 0 | 0.0 |  |

### Loretteville — 28/28

| Famille | URL | Idx | Pub | Google | Impr. | Clics | Pos. | Risque |
|---|---|---|---|---|---|---|---|---|
| ville | `/loretteville` | oui | oui | indexed | 16 | 0 | 5.2 | CANNIB. |
| transport-vrac | `/transport-vrac-loretteville` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| livraison-terre | `/livraison-terre-loretteville` | oui | oui | indexed | 9 | 0 | 8.9 | CANNIB. |
| livraison-sable | `/livraison-sable-loretteville` | oui | oui | unknown | 12 | 0 | 21.1 | CANNIB. |
| livraison-gravier | `/livraison-gravier-loretteville` | oui | oui | indexed | 25 | 2 | 8.2 | CANNIB., PROTÉGER |
| livraison-pierre | `/livraison-pierre-loretteville` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| excavation | `/excavation-loretteville` | oui | oui | indexed | 7 | 0 | 43.7 | CANNIB. |
| nivellement | `/nivellement-loretteville` | oui | oui | indexed | 198 | 0 | 68.8 | CANNIB., PROTÉGER |
| dompe | `/dompe-loretteville` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| recherche-point-de-depot | `/recherche-point-de-depot-loretteville` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| courtage-materiaux | `/courtage-materiaux-loretteville` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| terre-tamisee | `/terre-tamisee-loretteville` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| terre-contaminee | `/terre-contaminee-loretteville` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| sable | `/sable-loretteville` | oui | oui | — | 0 | 0 |  |  |
| gravier | `/gravier-loretteville` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| gravier-0-3-4 | `/gravier-0-3-4-loretteville` | oui | oui | indexed | 153 | 8 | 9.1 | PROTÉGER |
| mg-20 | `/mg-20-loretteville` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| mg-56 | `/mg-56-loretteville` | oui | oui | — | 0 | 0 |  |  |
| pierre | `/pierre-loretteville` | oui | oui | indexed | 21 | 0 | 38.3 |  |
| pierre-concassee | `/pierre-concassee-loretteville` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| pierre-nette | `/pierre-nette-loretteville` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| poussiere-de-pierre | `/poussiere-de-pierre-loretteville` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| roche | `/roche-loretteville` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| remblai | `/remblai-loretteville` | oui | oui | indexed | 61 | 0 | 32.8 |  |
| beton | `/beton-loretteville` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| asphalte | `/asphalte-loretteville` | oui | oui | indexed | 13 | 1 | 7.7 | PROTÉGER |
| brique | `/brique-loretteville` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| neige | `/neige-loretteville` | oui | oui | indexed | 13 | 1 | 9.8 | PROTÉGER |

### Lévis — 28/28

| Famille | URL | Idx | Pub | Google | Impr. | Clics | Pos. | Risque |
|---|---|---|---|---|---|---|---|---|
| ville | `/levis` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| transport-vrac | `/transport-vrac-levis` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| livraison-terre | `/livraison-terre-levis` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| livraison-sable | `/livraison-sable-levis` | oui | oui | indexed | 10 | 0 | 64.7 | CANNIB. |
| livraison-gravier | `/livraison-gravier-levis` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| livraison-pierre | `/livraison-pierre-levis` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| excavation | `/excavation-levis` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| nivellement | `/nivellement-levis` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| dompe | `/dompe-levis` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| recherche-point-de-depot | `/recherche-point-de-depot-levis` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| courtage-materiaux | `/courtage-materiaux-levis` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| terre-tamisee | `/terre-tamisee-levis` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| terre-contaminee | `/terre-contaminee-levis` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| sable | `/sable-levis` | oui | oui | indexed | 22 | 2 | 23.8 | CANNIB., PROTÉGER |
| gravier | `/gravier-levis` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| gravier-0-3-4 | `/gravier-0-3-4-levis` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| mg-20 | `/mg-20-levis` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| mg-56 | `/mg-56-levis` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| pierre | `/pierre-levis` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| pierre-concassee | `/pierre-concassee-levis` | oui | oui | indexed | 354 | 12 | 17.3 | PROTÉGER |
| pierre-nette | `/pierre-nette-levis` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| poussiere-de-pierre | `/poussiere-de-pierre-levis` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| roche | `/roche-levis` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| remblai | `/remblai-levis` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| beton | `/beton-levis` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| asphalte | `/asphalte-levis` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| brique | `/brique-levis` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| neige | `/neige-levis` | oui | oui | unknown | 0 | 0 | 0.0 |  |

### Montcalm — 28/28

| Famille | URL | Idx | Pub | Google | Impr. | Clics | Pos. | Risque |
|---|---|---|---|---|---|---|---|---|
| ville | `/montcalm` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| transport-vrac | `/transport-vrac-montcalm` | oui | oui | unknown | 37 | 0 | 69.2 | CANNIB. |
| livraison-terre | `/livraison-terre-montcalm` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| livraison-sable | `/livraison-sable-montcalm` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| livraison-gravier | `/livraison-gravier-montcalm` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| livraison-pierre | `/livraison-pierre-montcalm` | oui | oui | indexed | 11 | 0 | 55.3 | CANNIB. |
| excavation | `/excavation-montcalm` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| nivellement | `/nivellement-montcalm` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| dompe | `/dompe-montcalm` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| recherche-point-de-depot | `/recherche-point-de-depot-montcalm` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| courtage-materiaux | `/courtage-materiaux-montcalm` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| terre-tamisee | `/terre-tamisee-montcalm` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| terre-contaminee | `/terre-contaminee-montcalm` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| sable | `/sable-montcalm` | oui | oui | unknown | 0 | 0 |  |  |
| gravier | `/gravier-montcalm` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| gravier-0-3-4 | `/gravier-0-3-4-montcalm` | oui | oui | indexed | 8 | 2 | 2.8 | PROTÉGER |
| mg-20 | `/mg-20-montcalm` | oui | oui | unknown | 4 | 0 | 6.8 |  |
| mg-56 | `/mg-56-montcalm` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| pierre | `/pierre-montcalm` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| pierre-concassee | `/pierre-concassee-montcalm` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| pierre-nette | `/pierre-nette-montcalm` | oui | oui | unknown | 3 | 0 | 8.0 |  |
| poussiere-de-pierre | `/poussiere-de-pierre-montcalm` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| roche | `/roche-montcalm` | oui | oui | indexed | 22 | 0 | 9.9 | PROTÉGER |
| remblai | `/remblai-montcalm` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| beton | `/beton-montcalm` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| asphalte | `/asphalte-montcalm` | oui | oui | indexed | 4 | 0 | 6.8 |  |
| brique | `/brique-montcalm` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| neige | `/neige-montcalm` | oui | oui | unknown | 0 | 0 | 0.0 |  |

### Neufchâtel — 28/28

| Famille | URL | Idx | Pub | Google | Impr. | Clics | Pos. | Risque |
|---|---|---|---|---|---|---|---|---|
| ville | `/neufchatel` | oui | oui | unknown | 4 | 1 | 6.0 | CANNIB., PROTÉGER |
| transport-vrac | `/transport-vrac-neufchatel` | oui | oui | indexed | 110 | 0 | 59.5 | CANNIB., PROTÉGER |
| livraison-terre | `/livraison-terre-neufchatel` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| livraison-sable | `/livraison-sable-neufchatel` | oui | oui | indexed | 9 | 0 | 3.1 | CANNIB. |
| livraison-gravier | `/livraison-gravier-neufchatel` | oui | oui | indexed | 5 | 0 | 9.4 | CANNIB. |
| livraison-pierre | `/livraison-pierre-neufchatel` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| excavation | `/excavation-neufchatel` | oui | oui | unknown | 0 | 0 |  |  |
| nivellement | `/nivellement-neufchatel` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| dompe | `/dompe-neufchatel` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| recherche-point-de-depot | `/recherche-point-de-depot-neufchatel` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| courtage-materiaux | `/courtage-materiaux-neufchatel` | oui | oui | unknown | 2 | 0 | 10.0 |  |
| terre-tamisee | `/terre-tamisee-neufchatel` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| terre-contaminee | `/terre-contaminee-neufchatel` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| sable | `/sable-neufchatel` | oui | oui | unknown | 3 | 0 | 50.3 | CANNIB. |
| gravier | `/gravier-neufchatel` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| gravier-0-3-4 | `/gravier-0-3-4-neufchatel` | oui | oui | indexed | 23 | 0 | 27.5 |  |
| mg-20 | `/mg-20-neufchatel` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| mg-56 | `/mg-56-neufchatel` | oui | oui | indexed | 6 | 0 | 2.0 |  |
| pierre | `/pierre-neufchatel` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| pierre-concassee | `/pierre-concassee-neufchatel` | oui | oui | unknown | 3 | 1 | 1.0 | PROTÉGER |
| pierre-nette | `/pierre-nette-neufchatel` | oui | oui | unknown | 2 | 0 | 23.5 |  |
| poussiere-de-pierre | `/poussiere-de-pierre-neufchatel` | oui | oui | indexed | 15 | 0 | 9.7 |  |
| roche | `/roche-neufchatel` | oui | oui | unknown | 0 | 0 |  |  |
| remblai | `/remblai-neufchatel` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| beton | `/beton-neufchatel` | oui | oui | indexed | 3 | 0 | 9.3 |  |
| asphalte | `/asphalte-neufchatel` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| brique | `/brique-neufchatel` | oui | oui | unknown | 1 | 0 | 5.0 |  |
| neige | `/neige-neufchatel` | oui | oui | unknown | 0 | 0 |  |  |

### Neuville — 28/28

| Famille | URL | Idx | Pub | Google | Impr. | Clics | Pos. | Risque |
|---|---|---|---|---|---|---|---|---|
| ville | `/neuville` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| transport-vrac | `/transport-vrac-neuville` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| livraison-terre | `/livraison-terre-neuville` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| livraison-sable | `/livraison-sable-neuville` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| livraison-gravier | `/livraison-gravier-neuville` | oui | oui | indexed | 36 | 5 | 8.9 | PROTÉGER |
| livraison-pierre | `/livraison-pierre-neuville` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| excavation | `/excavation-neuville` | oui | oui | unknown | 3 | 0 | 8.7 | CANNIB. |
| nivellement | `/nivellement-neuville` | oui | oui | indexed | 2 | 0 | 11.0 | CANNIB. |
| dompe | `/dompe-neuville` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| recherche-point-de-depot | `/recherche-point-de-depot-neuville` | oui | oui | indexed | 4 | 0 | 6.8 |  |
| courtage-materiaux | `/courtage-materiaux-neuville` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| terre-tamisee | `/terre-tamisee-neuville` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| terre-contaminee | `/terre-contaminee-neuville` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| sable | `/sable-neuville` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| gravier | `/gravier-neuville` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| gravier-0-3-4 | `/gravier-0-3-4-neuville` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| mg-20 | `/mg-20-neuville` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| mg-56 | `/mg-56-neuville` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| pierre | `/pierre-neuville` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| pierre-concassee | `/pierre-concassee-neuville` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| pierre-nette | `/pierre-nette-neuville` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| poussiere-de-pierre | `/poussiere-de-pierre-neuville` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| roche | `/roche-neuville` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| remblai | `/remblai-neuville` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| beton | `/beton-neuville` | oui | oui | — | 0 | 0 |  |  |
| asphalte | `/asphalte-neuville` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| brique | `/brique-neuville` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| neige | `/neige-neuville` | oui | oui | unknown | 0 | 0 | 0.0 |  |

### Pintendre — 28/28

| Famille | URL | Idx | Pub | Google | Impr. | Clics | Pos. | Risque |
|---|---|---|---|---|---|---|---|---|
| ville | `/pintendre` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| transport-vrac | `/transport-vrac-pintendre` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| livraison-terre | `/livraison-terre-pintendre` | oui | oui | indexed | 55 | 2 | 28.9 | PROTÉGER |
| livraison-sable | `/livraison-sable-pintendre` | oui | oui | indexed | 9 | 0 | 68.2 |  |
| livraison-gravier | `/livraison-gravier-pintendre` | oui | oui | indexed | 2 | 0 | 8.5 |  |
| livraison-pierre | `/livraison-pierre-pintendre` | oui | oui | indexed | 4 | 0 | 49.5 |  |
| excavation | `/excavation-pintendre` | oui | oui | indexed | 1 | 0 | 4.0 | CANNIB. |
| nivellement | `/nivellement-pintendre` | oui | oui | unknown | 2 | 0 | 8.5 | CANNIB. |
| dompe | `/dompe-pintendre` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| recherche-point-de-depot | `/recherche-point-de-depot-pintendre` | oui | oui | indexed | 10 | 0 | 26.6 |  |
| courtage-materiaux | `/courtage-materiaux-pintendre` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| terre-tamisee | `/terre-tamisee-pintendre` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| terre-contaminee | `/terre-contaminee-pintendre` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| sable | `/sable-pintendre` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| gravier | `/gravier-pintendre` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| gravier-0-3-4 | `/gravier-0-3-4-pintendre` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| mg-20 | `/mg-20-pintendre` | oui | oui | indexed | 44 | 2 | 4.1 | PROTÉGER |
| mg-56 | `/mg-56-pintendre` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| pierre | `/pierre-pintendre` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| pierre-concassee | `/pierre-concassee-pintendre` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| pierre-nette | `/pierre-nette-pintendre` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| poussiere-de-pierre | `/poussiere-de-pierre-pintendre` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| roche | `/roche-pintendre` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| remblai | `/remblai-pintendre` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| beton | `/beton-pintendre` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| asphalte | `/asphalte-pintendre` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| brique | `/brique-pintendre` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| neige | `/neige-pintendre` | oui | oui | unknown | 0 | 0 | 0.0 |  |

### Pont-Rouge — 28/28

| Famille | URL | Idx | Pub | Google | Impr. | Clics | Pos. | Risque |
|---|---|---|---|---|---|---|---|---|
| ville | `/pont-rouge` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| transport-vrac | `/transport-vrac-pont-rouge` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| livraison-terre | `/livraison-terre-pont-rouge` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| livraison-sable | `/livraison-sable-pont-rouge` | oui | oui | indexed | 16 | 2 | 4.9 | PROTÉGER |
| livraison-gravier | `/livraison-gravier-pont-rouge` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| livraison-pierre | `/livraison-pierre-pont-rouge` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| excavation | `/excavation-pont-rouge` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| nivellement | `/nivellement-pont-rouge` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| dompe | `/dompe-pont-rouge` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| recherche-point-de-depot | `/recherche-point-de-depot-pont-rouge` | oui | oui | indexed | 16 | 0 | 7.2 |  |
| courtage-materiaux | `/courtage-materiaux-pont-rouge` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| terre-tamisee | `/terre-tamisee-pont-rouge` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| terre-contaminee | `/terre-contaminee-pont-rouge` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| sable | `/sable-pont-rouge` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| gravier | `/gravier-pont-rouge` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| gravier-0-3-4 | `/gravier-0-3-4-pont-rouge` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| mg-20 | `/mg-20-pont-rouge` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| mg-56 | `/mg-56-pont-rouge` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| pierre | `/pierre-pont-rouge` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| pierre-concassee | `/pierre-concassee-pont-rouge` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| pierre-nette | `/pierre-nette-pont-rouge` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| poussiere-de-pierre | `/poussiere-de-pierre-pont-rouge` | oui | oui | indexed | 27 | 4 | 5.3 | PROTÉGER |
| roche | `/roche-pont-rouge` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| remblai | `/remblai-pont-rouge` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| beton | `/beton-pont-rouge` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| asphalte | `/asphalte-pont-rouge` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| brique | `/brique-pont-rouge` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| neige | `/neige-pont-rouge` | oui | oui | unknown | 0 | 0 | 0.0 |  |

### Portneuf — 28/28

| Famille | URL | Idx | Pub | Google | Impr. | Clics | Pos. | Risque |
|---|---|---|---|---|---|---|---|---|
| ville | `/portneuf` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| transport-vrac | `/transport-vrac-portneuf` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| livraison-terre | `/livraison-terre-portneuf` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| livraison-sable | `/livraison-sable-portneuf` | oui | oui | indexed | 24 | 3 | 3.8 | CANNIB., PROTÉGER |
| livraison-gravier | `/livraison-gravier-portneuf` | oui | oui | indexed | 46 | 3 | 4.9 | PROTÉGER |
| livraison-pierre | `/livraison-pierre-portneuf` | oui | oui | indexed | 37 | 4 | 4.6 | PROTÉGER |
| excavation | `/excavation-portneuf` | oui | oui | indexed | 5 | 0 | 18.4 |  |
| nivellement | `/nivellement-portneuf` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| dompe | `/dompe-portneuf` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| recherche-point-de-depot | `/recherche-point-de-depot-portneuf` | oui | oui | indexed | 2 | 0 | 47.0 |  |
| courtage-materiaux | `/courtage-materiaux-portneuf` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| terre-tamisee | `/terre-tamisee-portneuf` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| terre-contaminee | `/terre-contaminee-portneuf` | oui | oui | indexed | 4 | 1 | 9.5 | PROTÉGER |
| sable | `/sable-portneuf` | oui | oui | indexed | 8 | 0 | 6.2 | CANNIB. |
| gravier | `/gravier-portneuf` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| gravier-0-3-4 | `/gravier-0-3-4-portneuf` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| mg-20 | `/mg-20-portneuf` | oui | oui | indexed | 9 | 0 | 3.4 |  |
| mg-56 | `/mg-56-portneuf` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| pierre | `/pierre-portneuf` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| pierre-concassee | `/pierre-concassee-portneuf` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| pierre-nette | `/pierre-nette-portneuf` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| poussiere-de-pierre | `/poussiere-de-pierre-portneuf` | oui | oui | indexed | 45 | 2 | 32.6 | PROTÉGER |
| roche | `/roche-portneuf` | oui | oui | indexed | 19 | 2 | 2.9 | PROTÉGER |
| remblai | `/remblai-portneuf` | oui | oui | unknown | 1 | 0 | 11.0 |  |
| beton | `/beton-portneuf` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| asphalte | `/asphalte-portneuf` | oui | oui | indexed | 58 | 1 | 9.5 | PROTÉGER |
| brique | `/brique-portneuf` | oui | oui | indexed | 34 | 0 | 44.6 |  |
| neige | `/neige-portneuf` | oui | oui | unknown | 0 | 0 | 0.0 |  |

### Québec — 28/28

| Famille | URL | Idx | Pub | Google | Impr. | Clics | Pos. | Risque |
|---|---|---|---|---|---|---|---|---|
| ville | `/quebec` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| transport-vrac | `/transport-vrac-quebec` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| livraison-terre | `/livraison-terre-quebec` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| livraison-sable | `/livraison-sable-quebec` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| livraison-gravier | `/livraison-gravier-quebec` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| livraison-pierre | `/livraison-pierre-quebec` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| excavation | `/excavation-quebec` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| nivellement | `/nivellement-quebec` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| dompe | `/dompe-quebec` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| recherche-point-de-depot | `/recherche-point-de-depot-quebec` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| courtage-materiaux | `/courtage-materiaux-quebec` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| terre-tamisee | `/terre-tamisee-quebec` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| terre-contaminee | `/terre-contaminee-quebec` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| sable | `/sable-quebec` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| gravier | `/gravier-quebec` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| gravier-0-3-4 | `/gravier-0-3-4-quebec` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| mg-20 | `/mg-20-quebec` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| mg-56 | `/mg-56-quebec` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| pierre | `/pierre-quebec` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| pierre-concassee | `/pierre-concassee-quebec` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| pierre-nette | `/pierre-nette-quebec` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| poussiere-de-pierre | `/poussiere-de-pierre-quebec` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| roche | `/roche-quebec` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| remblai | `/remblai-quebec` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| beton | `/beton-quebec` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| asphalte | `/asphalte-quebec` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| brique | `/brique-quebec` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| neige | `/neige-quebec` | oui | oui | unknown | 0 | 0 | 0.0 |  |

### Saint-Apollinaire — 28/28

| Famille | URL | Idx | Pub | Google | Impr. | Clics | Pos. | Risque |
|---|---|---|---|---|---|---|---|---|
| ville | `/saint-apollinaire` | oui | oui | indexed | 156 | 5 | 47.3 | CANNIB., PROTÉGER |
| transport-vrac | `/transport-vrac-saint-apollinaire` | oui | oui | indexed | 251 | 2 | 40.4 | CANNIB., PROTÉGER |
| livraison-terre | `/livraison-terre-saint-apollinaire` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| livraison-sable | `/livraison-sable-saint-apollinaire` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| livraison-gravier | `/livraison-gravier-saint-apollinaire` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| livraison-pierre | `/livraison-pierre-saint-apollinaire` | oui | oui | indexed | 301 | 11 | 37.9 | CANNIB., PROTÉGER |
| excavation | `/excavation-saint-apollinaire` | oui | oui | indexed | 18 | 0 | 23.5 | CANNIB. |
| nivellement | `/nivellement-saint-apollinaire` | oui | oui | indexed | 62 | 0 | 27.9 | CANNIB. |
| dompe | `/dompe-saint-apollinaire` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| recherche-point-de-depot | `/recherche-point-de-depot-saint-apollinaire` | oui | oui | indexed | 60 | 1 | 22.1 | PROTÉGER |
| courtage-materiaux | `/courtage-materiaux-saint-apollinaire` | oui | oui | indexed | 37 | 0 | 27.8 |  |
| terre-tamisee | `/terre-tamisee-saint-apollinaire` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| terre-contaminee | `/terre-contaminee-saint-apollinaire` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| sable | `/sable-saint-apollinaire` | oui | oui | indexed | 85 | 2 | 55.6 | PROTÉGER |
| gravier | `/gravier-saint-apollinaire` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| gravier-0-3-4 | `/gravier-0-3-4-saint-apollinaire` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| mg-20 | `/mg-20-saint-apollinaire` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| mg-56 | `/mg-56-saint-apollinaire` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| pierre | `/pierre-saint-apollinaire` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| pierre-concassee | `/pierre-concassee-saint-apollinaire` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| pierre-nette | `/pierre-nette-saint-apollinaire` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| poussiere-de-pierre | `/poussiere-de-pierre-saint-apollinaire` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| roche | `/roche-saint-apollinaire` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| remblai | `/remblai-saint-apollinaire` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| beton | `/beton-saint-apollinaire` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| asphalte | `/asphalte-saint-apollinaire` | oui | oui | — | 0 | 0 |  |  |
| brique | `/brique-saint-apollinaire` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| neige | `/neige-saint-apollinaire` | oui | oui | unknown | 0 | 0 | 0.0 |  |

### Saint-Augustin-de-Desmaures — 28/28

| Famille | URL | Idx | Pub | Google | Impr. | Clics | Pos. | Risque |
|---|---|---|---|---|---|---|---|---|
| ville | `/saint-augustin-de-desmaures` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| transport-vrac | `/transport-vrac-saint-augustin-de-desmaures` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| livraison-terre | `/livraison-terre-saint-augustin-de-desmaures` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| livraison-sable | `/livraison-sable-saint-augustin-de-desmaures` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| livraison-gravier | `/livraison-gravier-saint-augustin-de-desmaures` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| livraison-pierre | `/livraison-pierre-saint-augustin-de-desmaures` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| excavation | `/excavation-saint-augustin-de-desmaures` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| nivellement | `/nivellement-saint-augustin-de-desmaures` | oui | oui | indexed | 4 | 0 | 18.2 |  |
| dompe | `/dompe-saint-augustin-de-desmaures` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| recherche-point-de-depot | `/recherche-point-de-depot-saint-augustin-de-desmaures` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| courtage-materiaux | `/courtage-materiaux-saint-augustin-de-desmaures` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| terre-tamisee | `/terre-tamisee-saint-augustin-de-desmaures` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| terre-contaminee | `/terre-contaminee-saint-augustin-de-desmaures` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| sable | `/sable-saint-augustin-de-desmaures` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| gravier | `/gravier-saint-augustin-de-desmaures` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| gravier-0-3-4 | `/gravier-0-3-4-saint-augustin-de-desmaures` | oui | oui | indexed | 13 | 3 | 7.3 | PROTÉGER |
| mg-20 | `/mg-20-saint-augustin-de-desmaures` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| mg-56 | `/mg-56-saint-augustin-de-desmaures` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| pierre | `/pierre-saint-augustin-de-desmaures` | oui | oui | indexed | 25 | 5 | 3.5 | PROTÉGER |
| pierre-concassee | `/pierre-concassee-saint-augustin-de-desmaures` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| pierre-nette | `/pierre-nette-saint-augustin-de-desmaures` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| poussiere-de-pierre | `/poussiere-de-pierre-saint-augustin-de-desmaures` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| roche | `/roche-saint-augustin-de-desmaures` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| remblai | `/remblai-saint-augustin-de-desmaures` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| beton | `/beton-saint-augustin-de-desmaures` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| asphalte | `/asphalte-saint-augustin-de-desmaures` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| brique | `/brique-saint-augustin-de-desmaures` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| neige | `/neige-saint-augustin-de-desmaures` | oui | oui | unknown | 0 | 0 | 0.0 |  |

### Saint-Ferréol-les-Neiges — 28/28

| Famille | URL | Idx | Pub | Google | Impr. | Clics | Pos. | Risque |
|---|---|---|---|---|---|---|---|---|
| ville | `/saint-ferreol-les-neiges` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| transport-vrac | `/transport-vrac-saint-ferreol-les-neiges` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| livraison-terre | `/livraison-terre-saint-ferreol-les-neiges` | oui | oui | indexed | 1 | 0 | 8.0 |  |
| livraison-sable | `/livraison-sable-saint-ferreol-les-neiges` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| livraison-gravier | `/livraison-gravier-saint-ferreol-les-neiges` | oui | oui | indexed | 1 | 0 | 7.0 | CANNIB. |
| livraison-pierre | `/livraison-pierre-saint-ferreol-les-neiges` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| excavation | `/excavation-saint-ferreol-les-neiges` | oui | oui | indexed | 17 | 0 | 7.7 | CANNIB. |
| nivellement | `/nivellement-saint-ferreol-les-neiges` | oui | oui | indexed | 11 | 0 | 6.3 | CANNIB. |
| dompe | `/dompe-saint-ferreol-les-neiges` | oui | oui | indexed | 8 | 0 | 6.2 | CANNIB. |
| recherche-point-de-depot | `/recherche-point-de-depot-saint-ferreol-les-neiges` | oui | oui | indexed | 6 | 0 | 24.3 | CANNIB. |
| courtage-materiaux | `/courtage-materiaux-saint-ferreol-les-neiges` | oui | oui | indexed | 1 | 0 | 10.0 |  |
| terre-tamisee | `/terre-tamisee-saint-ferreol-les-neiges` | oui | oui | indexed | 0 | 0 |  |  |
| terre-contaminee | `/terre-contaminee-saint-ferreol-les-neiges` | oui | oui | — | 0 | 0 |  |  |
| sable | `/sable-saint-ferreol-les-neiges` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| gravier | `/gravier-saint-ferreol-les-neiges` | oui | oui | indexed | 6 | 0 | 7.8 | CANNIB. |
| gravier-0-3-4 | `/gravier-0-3-4-saint-ferreol-les-neiges` | oui | oui | indexed | 14 | 1 | 18.8 | PROTÉGER |
| mg-20 | `/mg-20-saint-ferreol-les-neiges` | oui | oui | indexed | 37 | 1 | 5.6 | PROTÉGER |
| mg-56 | `/mg-56-saint-ferreol-les-neiges` | oui | oui | indexed | 16 | 0 | 5.8 |  |
| pierre | `/pierre-saint-ferreol-les-neiges` | oui | oui | unknown | 10 | 1 | 4.1 | PROTÉGER |
| pierre-concassee | `/pierre-concassee-saint-ferreol-les-neiges` | oui | oui | indexed | 27 | 1 | 43.2 | PROTÉGER |
| pierre-nette | `/pierre-nette-saint-ferreol-les-neiges` | oui | oui | indexed | 8 | 0 | 11.4 |  |
| poussiere-de-pierre | `/poussiere-de-pierre-saint-ferreol-les-neiges` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| roche | `/roche-saint-ferreol-les-neiges` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| remblai | `/remblai-saint-ferreol-les-neiges` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| beton | `/beton-saint-ferreol-les-neiges` | oui | oui | unknown | 6 | 1 | 5.0 | PROTÉGER |
| asphalte | `/asphalte-saint-ferreol-les-neiges` | oui | oui | indexed | 9 | 0 | 9.1 |  |
| brique | `/brique-saint-ferreol-les-neiges` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| neige | `/neige-saint-ferreol-les-neiges` | oui | oui | indexed | 7 | 1 | 7.6 | PROTÉGER |

### Saint-Gabriel-de-Valcartier — 28/28

| Famille | URL | Idx | Pub | Google | Impr. | Clics | Pos. | Risque |
|---|---|---|---|---|---|---|---|---|
| ville | `/saint-gabriel-de-valcartier` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| transport-vrac | `/transport-vrac-saint-gabriel-de-valcartier` | oui | oui | indexed | 47 | 2 | 36.3 | PROTÉGER |
| livraison-terre | `/livraison-terre-saint-gabriel-de-valcartier` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| livraison-sable | `/livraison-sable-saint-gabriel-de-valcartier` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| livraison-gravier | `/livraison-gravier-saint-gabriel-de-valcartier` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| livraison-pierre | `/livraison-pierre-saint-gabriel-de-valcartier` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| excavation | `/excavation-saint-gabriel-de-valcartier` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| nivellement | `/nivellement-saint-gabriel-de-valcartier` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| dompe | `/dompe-saint-gabriel-de-valcartier` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| recherche-point-de-depot | `/recherche-point-de-depot-saint-gabriel-de-valcartier` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| courtage-materiaux | `/courtage-materiaux-saint-gabriel-de-valcartier` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| terre-tamisee | `/terre-tamisee-saint-gabriel-de-valcartier` | oui | oui | indexed | 7 | 0 | 6.6 |  |
| terre-contaminee | `/terre-contaminee-saint-gabriel-de-valcartier` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| sable | `/sable-saint-gabriel-de-valcartier` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| gravier | `/gravier-saint-gabriel-de-valcartier` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| gravier-0-3-4 | `/gravier-0-3-4-saint-gabriel-de-valcartier` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| mg-20 | `/mg-20-saint-gabriel-de-valcartier` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| mg-56 | `/mg-56-saint-gabriel-de-valcartier` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| pierre | `/pierre-saint-gabriel-de-valcartier` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| pierre-concassee | `/pierre-concassee-saint-gabriel-de-valcartier` | oui | oui | indexed | 50 | 1 | 36.1 | PROTÉGER |
| pierre-nette | `/pierre-nette-saint-gabriel-de-valcartier` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| poussiere-de-pierre | `/poussiere-de-pierre-saint-gabriel-de-valcartier` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| roche | `/roche-saint-gabriel-de-valcartier` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| remblai | `/remblai-saint-gabriel-de-valcartier` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| beton | `/beton-saint-gabriel-de-valcartier` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| asphalte | `/asphalte-saint-gabriel-de-valcartier` | oui | oui | unknown | 10 | 0 | 11.9 |  |
| brique | `/brique-saint-gabriel-de-valcartier` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| neige | `/neige-saint-gabriel-de-valcartier` | oui | oui | unknown | 0 | 0 | 0.0 |  |

### Saint-Jean-Chrysostome — 28/28

| Famille | URL | Idx | Pub | Google | Impr. | Clics | Pos. | Risque |
|---|---|---|---|---|---|---|---|---|
| ville | `/saint-jean-chrysostome` | oui | oui | indexed | 288 | 2 | 17.3 | PROTÉGER |
| transport-vrac | `/transport-vrac-saint-jean-chrysostome` | oui | oui | indexed | 41 | 0 | 83.6 |  |
| livraison-terre | `/livraison-terre-saint-jean-chrysostome` | oui | oui | indexed | 0 | 0 |  |  |
| livraison-sable | `/livraison-sable-saint-jean-chrysostome` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| livraison-gravier | `/livraison-gravier-saint-jean-chrysostome` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| livraison-pierre | `/livraison-pierre-saint-jean-chrysostome` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| excavation | `/excavation-saint-jean-chrysostome` | oui | oui | unknown | 0 | 0 |  |  |
| nivellement | `/nivellement-saint-jean-chrysostome` | oui | oui | indexed | 61 | 3 | 39.5 | PROTÉGER |
| dompe | `/dompe-saint-jean-chrysostome` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| recherche-point-de-depot | `/recherche-point-de-depot-saint-jean-chrysostome` | oui | oui | indexed | 20 | 1 | 13.3 | PROTÉGER |
| courtage-materiaux | `/courtage-materiaux-saint-jean-chrysostome` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| terre-tamisee | `/terre-tamisee-saint-jean-chrysostome` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| terre-contaminee | `/terre-contaminee-saint-jean-chrysostome` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| sable | `/sable-saint-jean-chrysostome` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| gravier | `/gravier-saint-jean-chrysostome` | oui | oui | unknown | 0 | 0 |  |  |
| gravier-0-3-4 | `/gravier-0-3-4-saint-jean-chrysostome` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| mg-20 | `/mg-20-saint-jean-chrysostome` | oui | oui | unknown | 0 | 0 |  |  |
| mg-56 | `/mg-56-saint-jean-chrysostome` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| pierre | `/pierre-saint-jean-chrysostome` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| pierre-concassee | `/pierre-concassee-saint-jean-chrysostome` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| pierre-nette | `/pierre-nette-saint-jean-chrysostome` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| poussiere-de-pierre | `/poussiere-de-pierre-saint-jean-chrysostome` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| roche | `/roche-saint-jean-chrysostome` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| remblai | `/remblai-saint-jean-chrysostome` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| beton | `/beton-saint-jean-chrysostome` | oui | oui | unknown | 0 | 0 |  |  |
| asphalte | `/asphalte-saint-jean-chrysostome` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| brique | `/brique-saint-jean-chrysostome` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| neige | `/neige-saint-jean-chrysostome` | oui | oui | unknown | 0 | 0 | 0.0 |  |

### Saint-Lambert-de-Lauzon — 28/28

| Famille | URL | Idx | Pub | Google | Impr. | Clics | Pos. | Risque |
|---|---|---|---|---|---|---|---|---|
| ville | `/saint-lambert-de-lauzon` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| transport-vrac | `/transport-vrac-saint-lambert-de-lauzon` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| livraison-terre | `/livraison-terre-saint-lambert-de-lauzon` | oui | oui | indexed | 24 | 1 | 34.7 | PROTÉGER |
| livraison-sable | `/livraison-sable-saint-lambert-de-lauzon` | oui | oui | indexed | 22 | 0 | 24.1 |  |
| livraison-gravier | `/livraison-gravier-saint-lambert-de-lauzon` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| livraison-pierre | `/livraison-pierre-saint-lambert-de-lauzon` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| excavation | `/excavation-saint-lambert-de-lauzon` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| nivellement | `/nivellement-saint-lambert-de-lauzon` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| dompe | `/dompe-saint-lambert-de-lauzon` | oui | oui | indexed | 8 | 0 | 39.6 | CANNIB. |
| recherche-point-de-depot | `/recherche-point-de-depot-saint-lambert-de-lauzon` | oui | oui | indexed | 71 | 0 | 28.4 | CANNIB. |
| courtage-materiaux | `/courtage-materiaux-saint-lambert-de-lauzon` | oui | oui | unknown | 68 | 0 | 84.5 |  |
| terre-tamisee | `/terre-tamisee-saint-lambert-de-lauzon` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| terre-contaminee | `/terre-contaminee-saint-lambert-de-lauzon` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| sable | `/sable-saint-lambert-de-lauzon` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| gravier | `/gravier-saint-lambert-de-lauzon` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| gravier-0-3-4 | `/gravier-0-3-4-saint-lambert-de-lauzon` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| mg-20 | `/mg-20-saint-lambert-de-lauzon` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| mg-56 | `/mg-56-saint-lambert-de-lauzon` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| pierre | `/pierre-saint-lambert-de-lauzon` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| pierre-concassee | `/pierre-concassee-saint-lambert-de-lauzon` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| pierre-nette | `/pierre-nette-saint-lambert-de-lauzon` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| poussiere-de-pierre | `/poussiere-de-pierre-saint-lambert-de-lauzon` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| roche | `/roche-saint-lambert-de-lauzon` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| remblai | `/remblai-saint-lambert-de-lauzon` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| beton | `/beton-saint-lambert-de-lauzon` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| asphalte | `/asphalte-saint-lambert-de-lauzon` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| brique | `/brique-saint-lambert-de-lauzon` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| neige | `/neige-saint-lambert-de-lauzon` | oui | oui | unknown | 0 | 0 | 0.0 |  |

### Saint-Nicolas — 28/28

| Famille | URL | Idx | Pub | Google | Impr. | Clics | Pos. | Risque |
|---|---|---|---|---|---|---|---|---|
| ville | `/saint-nicolas` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| transport-vrac | `/transport-vrac-saint-nicolas` | oui | oui | indexed | 15 | 0 | 59.1 | CANNIB. |
| livraison-terre | `/livraison-terre-saint-nicolas` | oui | oui | unknown | 0 | 0 |  |  |
| livraison-sable | `/livraison-sable-saint-nicolas` | oui | oui | indexed | 12 | 0 | 26.5 | CANNIB. |
| livraison-gravier | `/livraison-gravier-saint-nicolas` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| livraison-pierre | `/livraison-pierre-saint-nicolas` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| excavation | `/excavation-saint-nicolas` | oui | oui | indexed | 134 | 0 | 34.8 | PROTÉGER |
| nivellement | `/nivellement-saint-nicolas` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| dompe | `/dompe-saint-nicolas` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| recherche-point-de-depot | `/recherche-point-de-depot-saint-nicolas` | oui | oui | indexed | 3 | 0 | 8.7 |  |
| courtage-materiaux | `/courtage-materiaux-saint-nicolas` | oui | oui | indexed | 35 | 0 | 15.2 |  |
| terre-tamisee | `/terre-tamisee-saint-nicolas` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| terre-contaminee | `/terre-contaminee-saint-nicolas` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| sable | `/sable-saint-nicolas` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| gravier | `/gravier-saint-nicolas` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| gravier-0-3-4 | `/gravier-0-3-4-saint-nicolas` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| mg-20 | `/mg-20-saint-nicolas` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| mg-56 | `/mg-56-saint-nicolas` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| pierre | `/pierre-saint-nicolas` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| pierre-concassee | `/pierre-concassee-saint-nicolas` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| pierre-nette | `/pierre-nette-saint-nicolas` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| poussiere-de-pierre | `/poussiere-de-pierre-saint-nicolas` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| roche | `/roche-saint-nicolas` | oui | oui | indexed | 19 | 1 | 8.3 | PROTÉGER |
| remblai | `/remblai-saint-nicolas` | oui | oui | unknown | 0 | 0 |  |  |
| beton | `/beton-saint-nicolas` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| asphalte | `/asphalte-saint-nicolas` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| brique | `/brique-saint-nicolas` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| neige | `/neige-saint-nicolas` | oui | oui | unknown | 0 | 0 |  |  |

### Saint-Raymond — 28/28

| Famille | URL | Idx | Pub | Google | Impr. | Clics | Pos. | Risque |
|---|---|---|---|---|---|---|---|---|
| ville | `/saint-raymond` | oui | oui | indexed | 36 | 4 | 6.8 | CANNIB., PROTÉGER |
| transport-vrac | `/transport-vrac-saint-raymond` | oui | oui | indexed | 130 | 1 | 58.1 | CANNIB., PROTÉGER |
| livraison-terre | `/livraison-terre-saint-raymond` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| livraison-sable | `/livraison-sable-saint-raymond` | oui | oui | indexed | 136 | 0 | 42.4 | CANNIB., PROTÉGER |
| livraison-gravier | `/livraison-gravier-saint-raymond` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| livraison-pierre | `/livraison-pierre-saint-raymond` | oui | oui | indexed | 33 | 0 | 10.2 | CANNIB. |
| excavation | `/excavation-saint-raymond` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| nivellement | `/nivellement-saint-raymond` | oui | oui | indexed | 23 | 0 | 27.0 |  |
| dompe | `/dompe-saint-raymond` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| recherche-point-de-depot | `/recherche-point-de-depot-saint-raymond` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| courtage-materiaux | `/courtage-materiaux-saint-raymond` | oui | oui | unknown | 7 | 0 | 70.7 |  |
| terre-tamisee | `/terre-tamisee-saint-raymond` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| terre-contaminee | `/terre-contaminee-saint-raymond` | oui | oui | unknown | 2 | 0 | 6.5 |  |
| sable | `/sable-saint-raymond` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| gravier | `/gravier-saint-raymond` | oui | oui | indexed | 11 | 2 | 12.9 | PROTÉGER |
| gravier-0-3-4 | `/gravier-0-3-4-saint-raymond` | oui | oui | indexed | 60 | 6 | 10.7 | PROTÉGER |
| mg-20 | `/mg-20-saint-raymond` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| mg-56 | `/mg-56-saint-raymond` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| pierre | `/pierre-saint-raymond` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| pierre-concassee | `/pierre-concassee-saint-raymond` | oui | oui | indexed | 49 | 1 | 27.8 | PROTÉGER |
| pierre-nette | `/pierre-nette-saint-raymond` | oui | oui | indexed | 12 | 3 | 6.7 | PROTÉGER |
| poussiere-de-pierre | `/poussiere-de-pierre-saint-raymond` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| roche | `/roche-saint-raymond` | oui | oui | indexed | 13 | 3 | 13.2 | PROTÉGER |
| remblai | `/remblai-saint-raymond` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| beton | `/beton-saint-raymond` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| asphalte | `/asphalte-saint-raymond` | oui | oui | indexed | 4 | 1 | 6.5 | PROTÉGER |
| brique | `/brique-saint-raymond` | oui | oui | unknown | 8 | 0 | 36.1 |  |
| neige | `/neige-saint-raymond` | oui | oui | indexed | 5 | 0 | 7.8 |  |

### Saint-Romuald — 28/28

| Famille | URL | Idx | Pub | Google | Impr. | Clics | Pos. | Risque |
|---|---|---|---|---|---|---|---|---|
| ville | `/saint-romuald` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| transport-vrac | `/transport-vrac-saint-romuald` | oui | oui | indexed | 226 | 0 | 53.6 | CANNIB., PROTÉGER |
| livraison-terre | `/livraison-terre-saint-romuald` | oui | oui | indexed | 7 | 0 | 5.1 | CANNIB. |
| livraison-sable | `/livraison-sable-saint-romuald` | oui | oui | — | 0 | 0 |  |  |
| livraison-gravier | `/livraison-gravier-saint-romuald` | oui | oui | indexed | 6 | 0 | 4.3 | CANNIB. |
| livraison-pierre | `/livraison-pierre-saint-romuald` | oui | oui | indexed | 3 | 0 | 6.3 | CANNIB. |
| excavation | `/excavation-saint-romuald` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| nivellement | `/nivellement-saint-romuald` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| dompe | `/dompe-saint-romuald` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| recherche-point-de-depot | `/recherche-point-de-depot-saint-romuald` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| courtage-materiaux | `/courtage-materiaux-saint-romuald` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| terre-tamisee | `/terre-tamisee-saint-romuald` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| terre-contaminee | `/terre-contaminee-saint-romuald` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| sable | `/sable-saint-romuald` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| gravier | `/gravier-saint-romuald` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| gravier-0-3-4 | `/gravier-0-3-4-saint-romuald` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| mg-20 | `/mg-20-saint-romuald` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| mg-56 | `/mg-56-saint-romuald` | oui | oui | indexed | 10 | 0 | 4.8 |  |
| pierre | `/pierre-saint-romuald` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| pierre-concassee | `/pierre-concassee-saint-romuald` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| pierre-nette | `/pierre-nette-saint-romuald` | oui | oui | indexed | 21 | 0 | 10.2 |  |
| poussiere-de-pierre | `/poussiere-de-pierre-saint-romuald` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| roche | `/roche-saint-romuald` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| remblai | `/remblai-saint-romuald` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| beton | `/beton-saint-romuald` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| asphalte | `/asphalte-saint-romuald` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| brique | `/brique-saint-romuald` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| neige | `/neige-saint-romuald` | oui | oui | — | 0 | 0 |  |  |

### Saint-Sauveur — 28/28

| Famille | URL | Idx | Pub | Google | Impr. | Clics | Pos. | Risque |
|---|---|---|---|---|---|---|---|---|
| ville | `/saint-sauveur` | oui | oui | indexed | 25 | 1 | 6.5 | CANNIB., PROTÉGER |
| transport-vrac | `/transport-vrac-saint-sauveur` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| livraison-terre | `/livraison-terre-saint-sauveur` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| livraison-sable | `/livraison-sable-saint-sauveur` | oui | oui | indexed | 10 | 2 | 9.4 | CANNIB., PROTÉGER |
| livraison-gravier | `/livraison-gravier-saint-sauveur` | oui | oui | indexed | 6 | 0 | 50.7 | CANNIB. |
| livraison-pierre | `/livraison-pierre-saint-sauveur` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| excavation | `/excavation-saint-sauveur` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| nivellement | `/nivellement-saint-sauveur` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| dompe | `/dompe-saint-sauveur` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| recherche-point-de-depot | `/recherche-point-de-depot-saint-sauveur` | oui | oui | indexed | 1 | 0 | 10.0 |  |
| courtage-materiaux | `/courtage-materiaux-saint-sauveur` | oui | oui | indexed | 4 | 0 | 8.5 |  |
| terre-tamisee | `/terre-tamisee-saint-sauveur` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| terre-contaminee | `/terre-contaminee-saint-sauveur` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| sable | `/sable-saint-sauveur` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| gravier | `/gravier-saint-sauveur` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| gravier-0-3-4 | `/gravier-0-3-4-saint-sauveur` | oui | oui | unknown | 0 | 0 |  |  |
| mg-20 | `/mg-20-saint-sauveur` | oui | oui | unknown | 10 | 0 | 5.0 |  |
| mg-56 | `/mg-56-saint-sauveur` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| pierre | `/pierre-saint-sauveur` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| pierre-concassee | `/pierre-concassee-saint-sauveur` | oui | oui | indexed | 37 | 3 | 32.5 | PROTÉGER |
| pierre-nette | `/pierre-nette-saint-sauveur` | oui | oui | indexed | 0 | 0 | 0.0 |  |
| poussiere-de-pierre | `/poussiere-de-pierre-saint-sauveur` | oui | oui | indexed | 0 | 0 |  |  |
| roche | `/roche-saint-sauveur` | oui | oui | indexed | 8 | 1 | 5.6 | PROTÉGER |
| remblai | `/remblai-saint-sauveur` | oui | oui | unknown | 0 | 0 |  |  |
| beton | `/beton-saint-sauveur` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| asphalte | `/asphalte-saint-sauveur` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| brique | `/brique-saint-sauveur` | oui | oui | unknown | 1 | 0 | 4.0 |  |
| neige | `/neige-saint-sauveur` | oui | oui | unknown | 0 | 0 | 0.0 |  |

### Saint-Émile — 28/28

| Famille | URL | Idx | Pub | Google | Impr. | Clics | Pos. | Risque |
|---|---|---|---|---|---|---|---|---|
| ville | `/saint-emile` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| transport-vrac | `/transport-vrac-saint-emile` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| livraison-terre | `/livraison-terre-saint-emile` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| livraison-sable | `/livraison-sable-saint-emile` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| livraison-gravier | `/livraison-gravier-saint-emile` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| livraison-pierre | `/livraison-pierre-saint-emile` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| excavation | `/excavation-saint-emile` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| nivellement | `/nivellement-saint-emile` | oui | oui | indexed | 12 | 0 | 6.3 |  |
| dompe | `/dompe-saint-emile` | oui | oui | indexed | 34 | 0 | 13.5 |  |
| recherche-point-de-depot | `/recherche-point-de-depot-saint-emile` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| courtage-materiaux | `/courtage-materiaux-saint-emile` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| terre-tamisee | `/terre-tamisee-saint-emile` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| terre-contaminee | `/terre-contaminee-saint-emile` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| sable | `/sable-saint-emile` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| gravier | `/gravier-saint-emile` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| gravier-0-3-4 | `/gravier-0-3-4-saint-emile` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| mg-20 | `/mg-20-saint-emile` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| mg-56 | `/mg-56-saint-emile` | oui | oui | indexed | 3 | 0 | 8.3 |  |
| pierre | `/pierre-saint-emile` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| pierre-concassee | `/pierre-concassee-saint-emile` | oui | oui | indexed | 805 | 2 | 34.1 | PROTÉGER |
| pierre-nette | `/pierre-nette-saint-emile` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| poussiere-de-pierre | `/poussiere-de-pierre-saint-emile` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| roche | `/roche-saint-emile` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| remblai | `/remblai-saint-emile` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| beton | `/beton-saint-emile` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| asphalte | `/asphalte-saint-emile` | oui | oui | indexed | 107 | 1 | 58.3 | PROTÉGER |
| brique | `/brique-saint-emile` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| neige | `/neige-saint-emile` | oui | oui | unknown | 0 | 0 | 0.0 |  |

### Saint-Étienne-de-Lauzon — 28/28

| Famille | URL | Idx | Pub | Google | Impr. | Clics | Pos. | Risque |
|---|---|---|---|---|---|---|---|---|
| ville | `/saint-etienne-de-lauzon` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| transport-vrac | `/transport-vrac-saint-etienne-de-lauzon` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| livraison-terre | `/livraison-terre-saint-etienne-de-lauzon` | oui | oui | indexed | 7 | 0 | 19.1 | CANNIB. |
| livraison-sable | `/livraison-sable-saint-etienne-de-lauzon` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| livraison-gravier | `/livraison-gravier-saint-etienne-de-lauzon` | oui | oui | unknown | 0 | 0 |  |  |
| livraison-pierre | `/livraison-pierre-saint-etienne-de-lauzon` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| excavation | `/excavation-saint-etienne-de-lauzon` | oui | oui | indexed | 138 | 0 | 11.6 | PROTÉGER |
| nivellement | `/nivellement-saint-etienne-de-lauzon` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| dompe | `/dompe-saint-etienne-de-lauzon` | oui | oui | unknown | 0 | 0 |  |  |
| recherche-point-de-depot | `/recherche-point-de-depot-saint-etienne-de-lauzon` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| courtage-materiaux | `/courtage-materiaux-saint-etienne-de-lauzon` | oui | oui | indexed | 2 | 0 | 7.5 |  |
| terre-tamisee | `/terre-tamisee-saint-etienne-de-lauzon` | oui | oui | indexed | 29 | 4 | 13.5 | CANNIB., PROTÉGER |
| terre-contaminee | `/terre-contaminee-saint-etienne-de-lauzon` | oui | oui | indexed | 2 | 0 | 19.0 |  |
| sable | `/sable-saint-etienne-de-lauzon` | oui | oui | unknown | 10 | 0 | 4.2 |  |
| gravier | `/gravier-saint-etienne-de-lauzon` | oui | oui | indexed | 19 | 2 | 14.6 | PROTÉGER |
| gravier-0-3-4 | `/gravier-0-3-4-saint-etienne-de-lauzon` | oui | oui | indexed | 22 | 2 | 18.9 | PROTÉGER |
| mg-20 | `/mg-20-saint-etienne-de-lauzon` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| mg-56 | `/mg-56-saint-etienne-de-lauzon` | oui | oui | unknown | 6 | 0 | 3.3 |  |
| pierre | `/pierre-saint-etienne-de-lauzon` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| pierre-concassee | `/pierre-concassee-saint-etienne-de-lauzon` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| pierre-nette | `/pierre-nette-saint-etienne-de-lauzon` | oui | oui | indexed | 23 | 0 | 33.3 |  |
| poussiere-de-pierre | `/poussiere-de-pierre-saint-etienne-de-lauzon` | oui | oui | indexed | 0 | 0 |  |  |
| roche | `/roche-saint-etienne-de-lauzon` | oui | oui | unknown | 18 | 0 | 2.2 |  |
| remblai | `/remblai-saint-etienne-de-lauzon` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| beton | `/beton-saint-etienne-de-lauzon` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| asphalte | `/asphalte-saint-etienne-de-lauzon` | oui | oui | unknown | 0 | 0 |  |  |
| brique | `/brique-saint-etienne-de-lauzon` | oui | oui | unknown | 8 | 0 | 16.2 |  |
| neige | `/neige-saint-etienne-de-lauzon` | oui | oui | unknown | 0 | 0 | 0.0 |  |

### Sainte-Anne-de-Beaupré — 28/28

| Famille | URL | Idx | Pub | Google | Impr. | Clics | Pos. | Risque |
|---|---|---|---|---|---|---|---|---|
| ville | `/sainte-anne-de-beaupre` | oui | oui | indexed | 196 | 2 | 32.8 | CANNIB., PROTÉGER |
| transport-vrac | `/transport-vrac-sainte-anne-de-beaupre` | oui | oui | indexed | 624 | 0 | 20.6 | CANNIB., PROTÉGER |
| livraison-terre | `/livraison-terre-sainte-anne-de-beaupre` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| livraison-sable | `/livraison-sable-sainte-anne-de-beaupre` | oui | oui | unknown | 3 | 0 | 34.7 | CANNIB. |
| livraison-gravier | `/livraison-gravier-sainte-anne-de-beaupre` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| livraison-pierre | `/livraison-pierre-sainte-anne-de-beaupre` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| excavation | `/excavation-sainte-anne-de-beaupre` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| nivellement | `/nivellement-sainte-anne-de-beaupre` | oui | oui | indexed | 7 | 0 | 6.9 |  |
| dompe | `/dompe-sainte-anne-de-beaupre` | oui | oui | unknown | 27 | 0 | 41.9 | CANNIB. |
| recherche-point-de-depot | `/recherche-point-de-depot-sainte-anne-de-beaupre` | oui | oui | indexed | 20 | 0 | 78.9 | CANNIB. |
| courtage-materiaux | `/courtage-materiaux-sainte-anne-de-beaupre` | oui | oui | indexed | 49 | 0 | 18.1 |  |
| terre-tamisee | `/terre-tamisee-sainte-anne-de-beaupre` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| terre-contaminee | `/terre-contaminee-sainte-anne-de-beaupre` | oui | oui | indexed | 12 | 0 | 11.2 |  |
| sable | `/sable-sainte-anne-de-beaupre` | oui | oui | unknown | 10 | 0 | 4.0 | CANNIB. |
| gravier | `/gravier-sainte-anne-de-beaupre` | oui | oui | indexed | 0 | 0 |  |  |
| gravier-0-3-4 | `/gravier-0-3-4-sainte-anne-de-beaupre` | oui | oui | indexed | 18 | 2 | 10.5 | PROTÉGER |
| mg-20 | `/mg-20-sainte-anne-de-beaupre` | oui | oui | indexed | 171 | 3 | 4.8 | PROTÉGER |
| mg-56 | `/mg-56-sainte-anne-de-beaupre` | oui | oui | indexed | 3 | 0 | 4.7 |  |
| pierre | `/pierre-sainte-anne-de-beaupre` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| pierre-concassee | `/pierre-concassee-sainte-anne-de-beaupre` | oui | oui | indexed | 14 | 3 | 3.9 | PROTÉGER |
| pierre-nette | `/pierre-nette-sainte-anne-de-beaupre` | oui | oui | indexed | 2 | 0 | 23.0 |  |
| poussiere-de-pierre | `/poussiere-de-pierre-sainte-anne-de-beaupre` | oui | oui | unknown | 3 | 0 | 16.3 |  |
| roche | `/roche-sainte-anne-de-beaupre` | oui | oui | unknown | 1 | 0 | 1.0 |  |
| remblai | `/remblai-sainte-anne-de-beaupre` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| beton | `/beton-sainte-anne-de-beaupre` | oui | oui | indexed | 5 | 1 | 9.0 | PROTÉGER |
| asphalte | `/asphalte-sainte-anne-de-beaupre` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| brique | `/brique-sainte-anne-de-beaupre` | oui | oui | indexed | 1 | 0 | 5.0 |  |
| neige | `/neige-sainte-anne-de-beaupre` | oui | oui | indexed | 7 | 0 | 22.3 |  |

### Sainte-Brigitte-de-Laval — 28/28

| Famille | URL | Idx | Pub | Google | Impr. | Clics | Pos. | Risque |
|---|---|---|---|---|---|---|---|---|
| ville | `/sainte-brigitte-de-laval` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| transport-vrac | `/transport-vrac-sainte-brigitte-de-laval` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| livraison-terre | `/livraison-terre-sainte-brigitte-de-laval` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| livraison-sable | `/livraison-sable-sainte-brigitte-de-laval` | oui | oui | indexed | 26 | 2 | 35.8 | PROTÉGER |
| livraison-gravier | `/livraison-gravier-sainte-brigitte-de-laval` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| livraison-pierre | `/livraison-pierre-sainte-brigitte-de-laval` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| excavation | `/excavation-sainte-brigitte-de-laval` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| nivellement | `/nivellement-sainte-brigitte-de-laval` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| dompe | `/dompe-sainte-brigitte-de-laval` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| recherche-point-de-depot | `/recherche-point-de-depot-sainte-brigitte-de-laval` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| courtage-materiaux | `/courtage-materiaux-sainte-brigitte-de-laval` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| terre-tamisee | `/terre-tamisee-sainte-brigitte-de-laval` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| terre-contaminee | `/terre-contaminee-sainte-brigitte-de-laval` | oui | oui | unknown | 23 | 0 | 54.4 |  |
| sable | `/sable-sainte-brigitte-de-laval` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| gravier | `/gravier-sainte-brigitte-de-laval` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| gravier-0-3-4 | `/gravier-0-3-4-sainte-brigitte-de-laval` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| mg-20 | `/mg-20-sainte-brigitte-de-laval` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| mg-56 | `/mg-56-sainte-brigitte-de-laval` | oui | oui | indexed | 29 | 0 | 5.1 | PROTÉGER |
| pierre | `/pierre-sainte-brigitte-de-laval` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| pierre-concassee | `/pierre-concassee-sainte-brigitte-de-laval` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| pierre-nette | `/pierre-nette-sainte-brigitte-de-laval` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| poussiere-de-pierre | `/poussiere-de-pierre-sainte-brigitte-de-laval` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| roche | `/roche-sainte-brigitte-de-laval` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| remblai | `/remblai-sainte-brigitte-de-laval` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| beton | `/beton-sainte-brigitte-de-laval` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| asphalte | `/asphalte-sainte-brigitte-de-laval` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| brique | `/brique-sainte-brigitte-de-laval` | oui | oui | indexed | 5 | 0 | 8.2 |  |
| neige | `/neige-sainte-brigitte-de-laval` | oui | oui | unknown | 0 | 0 | 0.0 |  |

### Sainte-Catherine-de-la-Jacques-Cartier — 28/28

| Famille | URL | Idx | Pub | Google | Impr. | Clics | Pos. | Risque |
|---|---|---|---|---|---|---|---|---|
| ville | `/sainte-catherine-de-la-jacques-cartier` | oui | oui | indexed | 38 | 2 | 17.7 | CANNIB., PROTÉGER |
| transport-vrac | `/transport-vrac-sainte-catherine-de-la-jacques-cartier` | oui | oui | indexed | 94 | 2 | 72.8 | CANNIB., PROTÉGER |
| livraison-terre | `/livraison-terre-sainte-catherine-de-la-jacques-cartier` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| livraison-sable | `/livraison-sable-sainte-catherine-de-la-jacques-cartier` | oui | oui | indexed | 18 | 1 | 18.9 | CANNIB., PROTÉGER |
| livraison-gravier | `/livraison-gravier-sainte-catherine-de-la-jacques-cartier` | oui | oui | indexed | 2 | 0 | 6.5 | CANNIB. |
| livraison-pierre | `/livraison-pierre-sainte-catherine-de-la-jacques-cartier` | oui | oui | indexed | 26 | 3 | 5.7 | CANNIB., PROTÉGER |
| excavation | `/excavation-sainte-catherine-de-la-jacques-cartier` | oui | oui | indexed | 140 | 1 | 23.7 | CANNIB., PROTÉGER |
| nivellement | `/nivellement-sainte-catherine-de-la-jacques-cartier` | oui | oui | unknown | 3 | 0 | 15.3 | CANNIB. |
| dompe | `/dompe-sainte-catherine-de-la-jacques-cartier` | oui | oui | indexed | 8 | 1 | 5.6 | CANNIB., PROTÉGER |
| recherche-point-de-depot | `/recherche-point-de-depot-sainte-catherine-de-la-jacques-cartier` | oui | oui | indexed | 2 | 0 | 28.0 | CANNIB. |
| courtage-materiaux | `/courtage-materiaux-sainte-catherine-de-la-jacques-cartier` | oui | oui | indexed | 22 | 0 | 47.0 |  |
| terre-tamisee | `/terre-tamisee-sainte-catherine-de-la-jacques-cartier` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| terre-contaminee | `/terre-contaminee-sainte-catherine-de-la-jacques-cartier` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| sable | `/sable-sainte-catherine-de-la-jacques-cartier` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| gravier | `/gravier-sainte-catherine-de-la-jacques-cartier` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| gravier-0-3-4 | `/gravier-0-3-4-sainte-catherine-de-la-jacques-cartier` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| mg-20 | `/mg-20-sainte-catherine-de-la-jacques-cartier` | oui | oui | indexed | 31 | 0 | 17.6 |  |
| mg-56 | `/mg-56-sainte-catherine-de-la-jacques-cartier` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| pierre | `/pierre-sainte-catherine-de-la-jacques-cartier` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| pierre-concassee | `/pierre-concassee-sainte-catherine-de-la-jacques-cartier` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| pierre-nette | `/pierre-nette-sainte-catherine-de-la-jacques-cartier` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| poussiere-de-pierre | `/poussiere-de-pierre-sainte-catherine-de-la-jacques-cartier` | oui | oui | indexed | 9 | 1 | 4.9 | PROTÉGER |
| roche | `/roche-sainte-catherine-de-la-jacques-cartier` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| remblai | `/remblai-sainte-catherine-de-la-jacques-cartier` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| beton | `/beton-sainte-catherine-de-la-jacques-cartier` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| asphalte | `/asphalte-sainte-catherine-de-la-jacques-cartier` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| brique | `/brique-sainte-catherine-de-la-jacques-cartier` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| neige | `/neige-sainte-catherine-de-la-jacques-cartier` | oui | oui | unknown | 0 | 0 | 0.0 |  |

### Sainte-Foy — 28/28

| Famille | URL | Idx | Pub | Google | Impr. | Clics | Pos. | Risque |
|---|---|---|---|---|---|---|---|---|
| ville | `/sainte-foy` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| transport-vrac | `/transport-vrac-sainte-foy` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| livraison-terre | `/livraison-terre-sainte-foy` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| livraison-sable | `/livraison-sable-sainte-foy` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| livraison-gravier | `/livraison-gravier-sainte-foy` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| livraison-pierre | `/livraison-pierre-sainte-foy` | oui | oui | indexed | 28 | 2 | 8.7 | PROTÉGER |
| excavation | `/excavation-sainte-foy` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| nivellement | `/nivellement-sainte-foy` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| dompe | `/dompe-sainte-foy` | oui | oui | indexed | 25 | 1 | 26.4 | PROTÉGER |
| recherche-point-de-depot | `/recherche-point-de-depot-sainte-foy` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| courtage-materiaux | `/courtage-materiaux-sainte-foy` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| terre-tamisee | `/terre-tamisee-sainte-foy` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| terre-contaminee | `/terre-contaminee-sainte-foy` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| sable | `/sable-sainte-foy` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| gravier | `/gravier-sainte-foy` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| gravier-0-3-4 | `/gravier-0-3-4-sainte-foy` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| mg-20 | `/mg-20-sainte-foy` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| mg-56 | `/mg-56-sainte-foy` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| pierre | `/pierre-sainte-foy` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| pierre-concassee | `/pierre-concassee-sainte-foy` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| pierre-nette | `/pierre-nette-sainte-foy` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| poussiere-de-pierre | `/poussiere-de-pierre-sainte-foy` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| roche | `/roche-sainte-foy` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| remblai | `/remblai-sainte-foy` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| beton | `/beton-sainte-foy` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| asphalte | `/asphalte-sainte-foy` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| brique | `/brique-sainte-foy` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| neige | `/neige-sainte-foy` | oui | oui | unknown | 0 | 0 | 0.0 |  |

### Sainte-Foy–Sillery–Cap-Rouge — 28/28

| Famille | URL | Idx | Pub | Google | Impr. | Clics | Pos. | Risque |
|---|---|---|---|---|---|---|---|---|
| ville | `/sainte-foy-sillery-cap-rouge` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| transport-vrac | `/transport-vrac-sainte-foy-sillery-cap-rouge` | oui | oui | indexed | 16 | 0 | 43.6 | CANNIB. |
| livraison-terre | `/livraison-terre-sainte-foy-sillery-cap-rouge` | oui | oui | indexed | 8 | 1 | 4.5 | CANNIB., PROTÉGER |
| livraison-sable | `/livraison-sable-sainte-foy-sillery-cap-rouge` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| livraison-gravier | `/livraison-gravier-sainte-foy-sillery-cap-rouge` | oui | oui | indexed | 5 | 0 | 79.4 | CANNIB. |
| livraison-pierre | `/livraison-pierre-sainte-foy-sillery-cap-rouge` | oui | oui | indexed | 32 | 0 | 39.2 | CANNIB. |
| excavation | `/excavation-sainte-foy-sillery-cap-rouge` | oui | oui | indexed | 1015 | 0 | 13.8 | CANNIB., PROTÉGER |
| nivellement | `/nivellement-sainte-foy-sillery-cap-rouge` | oui | oui | indexed | 218 | 0 | 49.7 | CANNIB., PROTÉGER |
| dompe | `/dompe-sainte-foy-sillery-cap-rouge` | oui | oui | indexed | 11 | 0 | 41.9 | CANNIB. |
| recherche-point-de-depot | `/recherche-point-de-depot-sainte-foy-sillery-cap-rouge` | oui | oui | unknown | 57 | 0 | 49.3 | CANNIB. |
| courtage-materiaux | `/courtage-materiaux-sainte-foy-sillery-cap-rouge` | oui | oui | indexed | 26 | 0 | 70.0 |  |
| terre-tamisee | `/terre-tamisee-sainte-foy-sillery-cap-rouge` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| terre-contaminee | `/terre-contaminee-sainte-foy-sillery-cap-rouge` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| sable | `/sable-sainte-foy-sillery-cap-rouge` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| gravier | `/gravier-sainte-foy-sillery-cap-rouge` | oui | oui | indexed | 221 | 1 | 49.3 | CANNIB., PROTÉGER |
| gravier-0-3-4 | `/gravier-0-3-4-sainte-foy-sillery-cap-rouge` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| mg-20 | `/mg-20-sainte-foy-sillery-cap-rouge` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| mg-56 | `/mg-56-sainte-foy-sillery-cap-rouge` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| pierre | `/pierre-sainte-foy-sillery-cap-rouge` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| pierre-concassee | `/pierre-concassee-sainte-foy-sillery-cap-rouge` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| pierre-nette | `/pierre-nette-sainte-foy-sillery-cap-rouge` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| poussiere-de-pierre | `/poussiere-de-pierre-sainte-foy-sillery-cap-rouge` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| roche | `/roche-sainte-foy-sillery-cap-rouge` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| remblai | `/remblai-sainte-foy-sillery-cap-rouge` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| beton | `/beton-sainte-foy-sillery-cap-rouge` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| asphalte | `/asphalte-sainte-foy-sillery-cap-rouge` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| brique | `/brique-sainte-foy-sillery-cap-rouge` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| neige | `/neige-sainte-foy-sillery-cap-rouge` | oui | oui | unknown | 0 | 0 |  |  |

### Shannon — 28/28

| Famille | URL | Idx | Pub | Google | Impr. | Clics | Pos. | Risque |
|---|---|---|---|---|---|---|---|---|
| ville | `/shannon` | oui | oui | unknown | 10 | 1 | 4.2 | PROTÉGER |
| transport-vrac | `/transport-vrac-shannon` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| livraison-terre | `/livraison-terre-shannon` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| livraison-sable | `/livraison-sable-shannon` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| livraison-gravier | `/livraison-gravier-shannon` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| livraison-pierre | `/livraison-pierre-shannon` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| excavation | `/excavation-shannon` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| nivellement | `/nivellement-shannon` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| dompe | `/dompe-shannon` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| recherche-point-de-depot | `/recherche-point-de-depot-shannon` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| courtage-materiaux | `/courtage-materiaux-shannon` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| terre-tamisee | `/terre-tamisee-shannon` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| terre-contaminee | `/terre-contaminee-shannon` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| sable | `/sable-shannon` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| gravier | `/gravier-shannon` | oui | oui | indexed | 17 | 0 | 10.3 |  |
| gravier-0-3-4 | `/gravier-0-3-4-shannon` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| mg-20 | `/mg-20-shannon` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| mg-56 | `/mg-56-shannon` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| pierre | `/pierre-shannon` | oui | oui | indexed | 37 | 2 | 5.0 | PROTÉGER |
| pierre-concassee | `/pierre-concassee-shannon` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| pierre-nette | `/pierre-nette-shannon` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| poussiere-de-pierre | `/poussiere-de-pierre-shannon` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| roche | `/roche-shannon` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| remblai | `/remblai-shannon` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| beton | `/beton-shannon` | oui | oui | indexed | 14 | 0 | 3.9 |  |
| asphalte | `/asphalte-shannon` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| brique | `/brique-shannon` | oui | oui | unknown | 7 | 0 | 35.4 |  |
| neige | `/neige-shannon` | oui | oui | unknown | 0 | 0 | 0.0 |  |

### Sillery — 28/28

| Famille | URL | Idx | Pub | Google | Impr. | Clics | Pos. | Risque |
|---|---|---|---|---|---|---|---|---|
| ville | `/sillery` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| transport-vrac | `/transport-vrac-sillery` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| livraison-terre | `/livraison-terre-sillery` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| livraison-sable | `/livraison-sable-sillery` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| livraison-gravier | `/livraison-gravier-sillery` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| livraison-pierre | `/livraison-pierre-sillery` | oui | oui | unknown | 8 | 0 | 68.0 |  |
| excavation | `/excavation-sillery` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| nivellement | `/nivellement-sillery` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| dompe | `/dompe-sillery` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| recherche-point-de-depot | `/recherche-point-de-depot-sillery` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| courtage-materiaux | `/courtage-materiaux-sillery` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| terre-tamisee | `/terre-tamisee-sillery` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| terre-contaminee | `/terre-contaminee-sillery` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| sable | `/sable-sillery` | oui | oui | indexed | 1 | 0 | 11.0 |  |
| gravier | `/gravier-sillery` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| gravier-0-3-4 | `/gravier-0-3-4-sillery` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| mg-20 | `/mg-20-sillery` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| mg-56 | `/mg-56-sillery` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| pierre | `/pierre-sillery` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| pierre-concassee | `/pierre-concassee-sillery` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| pierre-nette | `/pierre-nette-sillery` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| poussiere-de-pierre | `/poussiere-de-pierre-sillery` | oui | oui | indexed | 33 | 0 | 41.4 |  |
| roche | `/roche-sillery` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| remblai | `/remblai-sillery` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| beton | `/beton-sillery` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| asphalte | `/asphalte-sillery` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| brique | `/brique-sillery` | oui | oui | unknown | 3 | 0 | 29.7 |  |
| neige | `/neige-sillery` | oui | oui | unknown | 0 | 0 | 0.0 |  |

### Stoneham-et-Tewkesbury — 28/28

| Famille | URL | Idx | Pub | Google | Impr. | Clics | Pos. | Risque |
|---|---|---|---|---|---|---|---|---|
| ville | `/stoneham-et-tewkesbury` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| transport-vrac | `/transport-vrac-stoneham-et-tewkesbury` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| livraison-terre | `/livraison-terre-stoneham-et-tewkesbury` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| livraison-sable | `/livraison-sable-stoneham-et-tewkesbury` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| livraison-gravier | `/livraison-gravier-stoneham-et-tewkesbury` | oui | oui | indexed | 26 | 0 | 17.0 |  |
| livraison-pierre | `/livraison-pierre-stoneham-et-tewkesbury` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| excavation | `/excavation-stoneham-et-tewkesbury` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| nivellement | `/nivellement-stoneham-et-tewkesbury` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| dompe | `/dompe-stoneham-et-tewkesbury` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| recherche-point-de-depot | `/recherche-point-de-depot-stoneham-et-tewkesbury` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| courtage-materiaux | `/courtage-materiaux-stoneham-et-tewkesbury` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| terre-tamisee | `/terre-tamisee-stoneham-et-tewkesbury` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| terre-contaminee | `/terre-contaminee-stoneham-et-tewkesbury` | oui | oui | indexed | 1 | 0 | 7.0 |  |
| sable | `/sable-stoneham-et-tewkesbury` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| gravier | `/gravier-stoneham-et-tewkesbury` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| gravier-0-3-4 | `/gravier-0-3-4-stoneham-et-tewkesbury` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| mg-20 | `/mg-20-stoneham-et-tewkesbury` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| mg-56 | `/mg-56-stoneham-et-tewkesbury` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| pierre | `/pierre-stoneham-et-tewkesbury` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| pierre-concassee | `/pierre-concassee-stoneham-et-tewkesbury` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| pierre-nette | `/pierre-nette-stoneham-et-tewkesbury` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| poussiere-de-pierre | `/poussiere-de-pierre-stoneham-et-tewkesbury` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| roche | `/roche-stoneham-et-tewkesbury` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| remblai | `/remblai-stoneham-et-tewkesbury` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| beton | `/beton-stoneham-et-tewkesbury` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| asphalte | `/asphalte-stoneham-et-tewkesbury` | oui | oui | indexed | 12 | 0 | 6.9 |  |
| brique | `/brique-stoneham-et-tewkesbury` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| neige | `/neige-stoneham-et-tewkesbury` | oui | oui | unknown | 0 | 0 | 0.0 |  |

### Val-Bélair — 28/28

| Famille | URL | Idx | Pub | Google | Impr. | Clics | Pos. | Risque |
|---|---|---|---|---|---|---|---|---|
| ville | `/val-belair` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| transport-vrac | `/transport-vrac-val-belair` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| livraison-terre | `/livraison-terre-val-belair` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| livraison-sable | `/livraison-sable-val-belair` | oui | oui | indexed | 82 | 1 | 36.2 | PROTÉGER |
| livraison-gravier | `/livraison-gravier-val-belair` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| livraison-pierre | `/livraison-pierre-val-belair` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| excavation | `/excavation-val-belair` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| nivellement | `/nivellement-val-belair` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| dompe | `/dompe-val-belair` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| recherche-point-de-depot | `/recherche-point-de-depot-val-belair` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| courtage-materiaux | `/courtage-materiaux-val-belair` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| terre-tamisee | `/terre-tamisee-val-belair` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| terre-contaminee | `/terre-contaminee-val-belair` | oui | oui | indexed | 9 | 0 | 7.1 |  |
| sable | `/sable-val-belair` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| gravier | `/gravier-val-belair` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| gravier-0-3-4 | `/gravier-0-3-4-val-belair` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| mg-20 | `/mg-20-val-belair` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| mg-56 | `/mg-56-val-belair` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| pierre | `/pierre-val-belair` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| pierre-concassee | `/pierre-concassee-val-belair` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| pierre-nette | `/pierre-nette-val-belair` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| poussiere-de-pierre | `/poussiere-de-pierre-val-belair` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| roche | `/roche-val-belair` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| remblai | `/remblai-val-belair` | oui | oui | indexed | 30 | 0 | 30.4 |  |
| beton | `/beton-val-belair` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| asphalte | `/asphalte-val-belair` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| brique | `/brique-val-belair` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| neige | `/neige-val-belair` | oui | oui | unknown | 0 | 0 | 0.0 |  |

### Vanier — 28/28

| Famille | URL | Idx | Pub | Google | Impr. | Clics | Pos. | Risque |
|---|---|---|---|---|---|---|---|---|
| ville | `/vanier` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| transport-vrac | `/transport-vrac-vanier` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| livraison-terre | `/livraison-terre-vanier` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| livraison-sable | `/livraison-sable-vanier` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| livraison-gravier | `/livraison-gravier-vanier` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| livraison-pierre | `/livraison-pierre-vanier` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| excavation | `/excavation-vanier` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| nivellement | `/nivellement-vanier` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| dompe | `/dompe-vanier` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| recherche-point-de-depot | `/recherche-point-de-depot-vanier` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| courtage-materiaux | `/courtage-materiaux-vanier` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| terre-tamisee | `/terre-tamisee-vanier` | oui | oui | indexed | 4 | 0 | 11.5 |  |
| terre-contaminee | `/terre-contaminee-vanier` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| sable | `/sable-vanier` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| gravier | `/gravier-vanier` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| gravier-0-3-4 | `/gravier-0-3-4-vanier` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| mg-20 | `/mg-20-vanier` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| mg-56 | `/mg-56-vanier` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| pierre | `/pierre-vanier` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| pierre-concassee | `/pierre-concassee-vanier` | oui | oui | indexed | 29 | 0 | 33.8 |  |
| pierre-nette | `/pierre-nette-vanier` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| poussiere-de-pierre | `/poussiere-de-pierre-vanier` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| roche | `/roche-vanier` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| remblai | `/remblai-vanier` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| beton | `/beton-vanier` | oui | oui | indexed | 13 | 2 | 6.1 | PROTÉGER |
| asphalte | `/asphalte-vanier` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| brique | `/brique-vanier` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| neige | `/neige-vanier` | oui | oui | unknown | 0 | 0 | 0.0 |  |

### Wendake — 28/28

| Famille | URL | Idx | Pub | Google | Impr. | Clics | Pos. | Risque |
|---|---|---|---|---|---|---|---|---|
| ville | `/wendake` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| transport-vrac | `/transport-vrac-wendake` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| livraison-terre | `/livraison-terre-wendake` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| livraison-sable | `/livraison-sable-wendake` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| livraison-gravier | `/livraison-gravier-wendake` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| livraison-pierre | `/livraison-pierre-wendake` | oui | oui | indexed | 20 | 4 | 5.8 | PROTÉGER |
| excavation | `/excavation-wendake` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| nivellement | `/nivellement-wendake` | oui | oui | unknown | 3 | 0 | 7.7 |  |
| dompe | `/dompe-wendake` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| recherche-point-de-depot | `/recherche-point-de-depot-wendake` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| courtage-materiaux | `/courtage-materiaux-wendake` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| terre-tamisee | `/terre-tamisee-wendake` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| terre-contaminee | `/terre-contaminee-wendake` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| sable | `/sable-wendake` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| gravier | `/gravier-wendake` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| gravier-0-3-4 | `/gravier-0-3-4-wendake` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| mg-20 | `/mg-20-wendake` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| mg-56 | `/mg-56-wendake` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| pierre | `/pierre-wendake` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| pierre-concassee | `/pierre-concassee-wendake` | oui | oui | indexed | 88 | 1 | 55.6 | PROTÉGER |
| pierre-nette | `/pierre-nette-wendake` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| poussiere-de-pierre | `/poussiere-de-pierre-wendake` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| roche | `/roche-wendake` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| remblai | `/remblai-wendake` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| beton | `/beton-wendake` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| asphalte | `/asphalte-wendake` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| brique | `/brique-wendake` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| neige | `/neige-wendake` | oui | oui | unknown | 0 | 0 | 0.0 |  |

### Saint-Agapit — 8/28

| Famille | URL | Idx | Pub | Google | Impr. | Clics | Pos. | Risque |
|---|---|---|---|---|---|---|---|---|
| ville | `/saint-agapit` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| dompe | `/dompe-saint-agapit` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| sable | `/sable-saint-agapit` | oui | oui | unknown | 0 | 0 |  |  |
| gravier | `/gravier-saint-agapit` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| poussiere-de-pierre | `/poussiere-de-pierre-saint-agapit` | oui | oui | unknown | 0 | 0 |  |  |
| remblai | `/remblai-saint-agapit` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| beton | `/beton-saint-agapit` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| asphalte | `/asphalte-saint-agapit` | oui | oui | unknown | 0 | 0 | 0.0 |  |

Manquantes (20) : transport-vrac, livraison-terre, livraison-sable, livraison-gravier, livraison-pierre, excavation, nivellement, recherche-point-de-depot, courtage-materiaux, terre-tamisee, terre-contaminee, gravier-0-3-4, mg-20, mg-56, pierre, pierre-concassee, pierre-nette, roche, brique, neige — **À VALIDER AVANT EXPANSION**

### Saint-Charles-de-Bellechasse — 8/28

| Famille | URL | Idx | Pub | Google | Impr. | Clics | Pos. | Risque |
|---|---|---|---|---|---|---|---|---|
| ville | `/saint-charles-de-bellechasse` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| dompe | `/dompe-saint-charles-de-bellechasse` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| sable | `/sable-saint-charles-de-bellechasse` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| gravier | `/gravier-saint-charles-de-bellechasse` | oui | oui | unknown | 0 | 0 |  |  |
| poussiere-de-pierre | `/poussiere-de-pierre-saint-charles-de-bellechasse` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| remblai | `/remblai-saint-charles-de-bellechasse` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| beton | `/beton-saint-charles-de-bellechasse` | oui | oui | unknown | 0 | 0 |  |  |
| asphalte | `/asphalte-saint-charles-de-bellechasse` | oui | oui | unknown | 0 | 0 |  |  |

Manquantes (20) : transport-vrac, livraison-terre, livraison-sable, livraison-gravier, livraison-pierre, excavation, nivellement, recherche-point-de-depot, courtage-materiaux, terre-tamisee, terre-contaminee, gravier-0-3-4, mg-20, mg-56, pierre, pierre-concassee, pierre-nette, roche, brique, neige — **À VALIDER AVANT EXPANSION**

### Saint-Gilles — 8/28

| Famille | URL | Idx | Pub | Google | Impr. | Clics | Pos. | Risque |
|---|---|---|---|---|---|---|---|---|
| ville | `/saint-gilles` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| dompe | `/dompe-saint-gilles` | oui | oui | — | 0 | 0 |  |  |
| sable | `/sable-saint-gilles` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| gravier | `/gravier-saint-gilles` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| poussiere-de-pierre | `/poussiere-de-pierre-saint-gilles` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| remblai | `/remblai-saint-gilles` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| beton | `/beton-saint-gilles` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| asphalte | `/asphalte-saint-gilles` | oui | oui | unknown | 0 | 0 | 0.0 |  |

Manquantes (20) : transport-vrac, livraison-terre, livraison-sable, livraison-gravier, livraison-pierre, excavation, nivellement, recherche-point-de-depot, courtage-materiaux, terre-tamisee, terre-contaminee, gravier-0-3-4, mg-20, mg-56, pierre, pierre-concassee, pierre-nette, roche, brique, neige — **À VALIDER AVANT EXPANSION**

### Saint-Jean-de-Matha — 8/28

| Famille | URL | Idx | Pub | Google | Impr. | Clics | Pos. | Risque |
|---|---|---|---|---|---|---|---|---|
| ville | `/saint-jean-de-matha` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| dompe | `/dompe-saint-jean-de-matha` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| terre-tamisee | `/terre-tamisee-saint-jean-de-matha` | oui | oui | unknown | 0 | 0 |  |  |
| sable | `/sable-saint-jean-de-matha` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| gravier | `/gravier-saint-jean-de-matha` | oui | oui | unknown | 0 | 0 |  |  |
| poussiere-de-pierre | `/poussiere-de-pierre-saint-jean-de-matha` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| remblai | `/remblai-saint-jean-de-matha` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| asphalte | `/asphalte-saint-jean-de-matha` | oui | oui | unknown | 0 | 0 | 0.0 |  |

Manquantes (20) : transport-vrac, livraison-terre, livraison-sable, livraison-gravier, livraison-pierre, excavation, nivellement, recherche-point-de-depot, courtage-materiaux, terre-contaminee, gravier-0-3-4, mg-20, mg-56, pierre, pierre-concassee, pierre-nette, roche, beton, brique, neige — **À VALIDER AVANT EXPANSION**

### Saint-Joseph-de-Beauce — 8/28

| Famille | URL | Idx | Pub | Google | Impr. | Clics | Pos. | Risque |
|---|---|---|---|---|---|---|---|---|
| ville | `/saint-joseph-de-beauce` | oui | oui | — | 0 | 0 |  |  |
| dompe | `/dompe-saint-joseph-de-beauce` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| sable | `/sable-saint-joseph-de-beauce` | oui | oui | unknown | 0 | 0 |  |  |
| gravier | `/gravier-saint-joseph-de-beauce` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| poussiere-de-pierre | `/poussiere-de-pierre-saint-joseph-de-beauce` | oui | oui | — | 0 | 0 |  |  |
| remblai | `/remblai-saint-joseph-de-beauce` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| beton | `/beton-saint-joseph-de-beauce` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| asphalte | `/asphalte-saint-joseph-de-beauce` | oui | oui | unknown | 0 | 0 |  |  |

Manquantes (20) : transport-vrac, livraison-terre, livraison-sable, livraison-gravier, livraison-pierre, excavation, nivellement, recherche-point-de-depot, courtage-materiaux, terre-tamisee, terre-contaminee, gravier-0-3-4, mg-20, mg-56, pierre, pierre-concassee, pierre-nette, roche, brique, neige — **À VALIDER AVANT EXPANSION**

### Thetford Mines — 8/28

| Famille | URL | Idx | Pub | Google | Impr. | Clics | Pos. | Risque |
|---|---|---|---|---|---|---|---|---|
| ville | `/thetford-mines` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| dompe | `/dompe-thetford-mines` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| sable | `/sable-thetford-mines` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| gravier | `/gravier-thetford-mines` | oui | oui | unknown | 0 | 0 |  |  |
| poussiere-de-pierre | `/poussiere-de-pierre-thetford-mines` | oui | oui | unknown | 0 | 0 |  |  |
| remblai | `/remblai-thetford-mines` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| beton | `/beton-thetford-mines` | oui | oui | — | 0 | 0 |  |  |
| asphalte | `/asphalte-thetford-mines` | oui | oui | unknown | 0 | 0 | 0.0 |  |

Manquantes (20) : transport-vrac, livraison-terre, livraison-sable, livraison-gravier, livraison-pierre, excavation, nivellement, recherche-point-de-depot, courtage-materiaux, terre-tamisee, terre-contaminee, gravier-0-3-4, mg-20, mg-56, pierre, pierre-concassee, pierre-nette, roche, brique, neige — **À VALIDER AVANT EXPANSION**

### La Durantaye — 7/28

| Famille | URL | Idx | Pub | Google | Impr. | Clics | Pos. | Risque |
|---|---|---|---|---|---|---|---|---|
| ville | `/la-durantaye` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| dompe | `/dompe-la-durantaye` | oui | oui | unknown | 0 | 0 |  |  |
| sable | `/sable-la-durantaye` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| gravier | `/gravier-la-durantaye` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| poussiere-de-pierre | `/poussiere-de-pierre-la-durantaye` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| beton | `/beton-la-durantaye` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| asphalte | `/asphalte-la-durantaye` | oui | oui | unknown | 0 | 0 | 0.0 |  |

Manquantes (21) : transport-vrac, livraison-terre, livraison-sable, livraison-gravier, livraison-pierre, excavation, nivellement, recherche-point-de-depot, courtage-materiaux, terre-tamisee, terre-contaminee, gravier-0-3-4, mg-20, mg-56, pierre, pierre-concassee, pierre-nette, roche, remblai, brique, neige — **À VALIDER AVANT EXPANSION**

### Mascouche — 7/28

| Famille | URL | Idx | Pub | Google | Impr. | Clics | Pos. | Risque |
|---|---|---|---|---|---|---|---|---|
| ville | `/mascouche` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| dompe | `/dompe-mascouche` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| sable | `/sable-mascouche` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| gravier | `/gravier-mascouche` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| poussiere-de-pierre | `/poussiere-de-pierre-mascouche` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| beton | `/beton-mascouche` | oui | oui | unknown | 0 | 0 |  |  |
| asphalte | `/asphalte-mascouche` | oui | oui | unknown | 0 | 0 | 0.0 |  |

Manquantes (21) : transport-vrac, livraison-terre, livraison-sable, livraison-gravier, livraison-pierre, excavation, nivellement, recherche-point-de-depot, courtage-materiaux, terre-tamisee, terre-contaminee, gravier-0-3-4, mg-20, mg-56, pierre, pierre-concassee, pierre-nette, roche, remblai, brique, neige — **À VALIDER AVANT EXPANSION**

### Saint-Basile — 7/28

| Famille | URL | Idx | Pub | Google | Impr. | Clics | Pos. | Risque |
|---|---|---|---|---|---|---|---|---|
| ville | `/saint-basile` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| dompe | `/dompe-saint-basile` | oui | oui | — | 0 | 0 |  |  |
| sable | `/sable-saint-basile` | oui | oui | unknown | 0 | 0 |  |  |
| gravier | `/gravier-saint-basile` | oui | oui | unknown | 0 | 0 |  |  |
| poussiere-de-pierre | `/poussiere-de-pierre-saint-basile` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| beton | `/beton-saint-basile` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| asphalte | `/asphalte-saint-basile` | oui | oui | unknown | 0 | 0 | 0.0 |  |

Manquantes (21) : transport-vrac, livraison-terre, livraison-sable, livraison-gravier, livraison-pierre, excavation, nivellement, recherche-point-de-depot, courtage-materiaux, terre-tamisee, terre-contaminee, gravier-0-3-4, mg-20, mg-56, pierre, pierre-concassee, pierre-nette, roche, remblai, brique, neige — **À VALIDER AVANT EXPANSION**

### Saint-Cyrille-de-Lessard — 7/28

| Famille | URL | Idx | Pub | Google | Impr. | Clics | Pos. | Risque |
|---|---|---|---|---|---|---|---|---|
| ville | `/saint-cyrille-de-lessard` | oui | oui | — | 0 | 0 |  |  |
| dompe | `/dompe-saint-cyrille-de-lessard` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| sable | `/sable-saint-cyrille-de-lessard` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| gravier | `/gravier-saint-cyrille-de-lessard` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| poussiere-de-pierre | `/poussiere-de-pierre-saint-cyrille-de-lessard` | oui | oui | — | 0 | 0 |  |  |
| beton | `/beton-saint-cyrille-de-lessard` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| asphalte | `/asphalte-saint-cyrille-de-lessard` | oui | oui | unknown | 0 | 0 | 0.0 |  |

Manquantes (21) : transport-vrac, livraison-terre, livraison-sable, livraison-gravier, livraison-pierre, excavation, nivellement, recherche-point-de-depot, courtage-materiaux, terre-tamisee, terre-contaminee, gravier-0-3-4, mg-20, mg-56, pierre, pierre-concassee, pierre-nette, roche, remblai, brique, neige — **À VALIDER AVANT EXPANSION**

### Saint-Damien — 7/28

| Famille | URL | Idx | Pub | Google | Impr. | Clics | Pos. | Risque |
|---|---|---|---|---|---|---|---|---|
| ville | `/saint-damien` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| dompe | `/dompe-saint-damien` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| sable | `/sable-saint-damien` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| gravier | `/gravier-saint-damien` | oui | oui | unknown | 0 | 0 |  |  |
| pierre | `/pierre-saint-damien` | oui | oui | unknown | 0 | 0 |  |  |
| poussiere-de-pierre | `/poussiere-de-pierre-saint-damien` | oui | oui | unknown | 0 | 0 |  |  |
| remblai | `/remblai-saint-damien` | oui | oui | unknown | 0 | 0 |  |  |

Manquantes (21) : transport-vrac, livraison-terre, livraison-sable, livraison-gravier, livraison-pierre, excavation, nivellement, recherche-point-de-depot, courtage-materiaux, terre-tamisee, terre-contaminee, gravier-0-3-4, mg-20, mg-56, pierre-concassee, pierre-nette, roche, beton, asphalte, brique, neige — **À VALIDER AVANT EXPANSION**

### Saint-Flavien — 7/28

| Famille | URL | Idx | Pub | Google | Impr. | Clics | Pos. | Risque |
|---|---|---|---|---|---|---|---|---|
| ville | `/saint-flavien` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| dompe | `/dompe-saint-flavien` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| sable | `/sable-saint-flavien` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| gravier | `/gravier-saint-flavien` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| poussiere-de-pierre | `/poussiere-de-pierre-saint-flavien` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| beton | `/beton-saint-flavien` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| asphalte | `/asphalte-saint-flavien` | oui | oui | unknown | 0 | 0 | 0.0 |  |

Manquantes (21) : transport-vrac, livraison-terre, livraison-sable, livraison-gravier, livraison-pierre, excavation, nivellement, recherche-point-de-depot, courtage-materiaux, terre-tamisee, terre-contaminee, gravier-0-3-4, mg-20, mg-56, pierre, pierre-concassee, pierre-nette, roche, remblai, brique, neige — **À VALIDER AVANT EXPANSION**

### Saint-Sylvestre — 7/28

| Famille | URL | Idx | Pub | Google | Impr. | Clics | Pos. | Risque |
|---|---|---|---|---|---|---|---|---|
| ville | `/saint-sylvestre` | oui | oui | — | 0 | 0 |  |  |
| dompe | `/dompe-saint-sylvestre` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| sable | `/sable-saint-sylvestre` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| gravier | `/gravier-saint-sylvestre` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| poussiere-de-pierre | `/poussiere-de-pierre-saint-sylvestre` | oui | oui | — | 0 | 0 |  |  |
| beton | `/beton-saint-sylvestre` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| asphalte | `/asphalte-saint-sylvestre` | oui | oui | unknown | 0 | 0 | 0.0 |  |

Manquantes (21) : transport-vrac, livraison-terre, livraison-sable, livraison-gravier, livraison-pierre, excavation, nivellement, recherche-point-de-depot, courtage-materiaux, terre-tamisee, terre-contaminee, gravier-0-3-4, mg-20, mg-56, pierre, pierre-concassee, pierre-nette, roche, remblai, brique, neige — **À VALIDER AVANT EXPANSION**

### Saint-Victor — 7/28

| Famille | URL | Idx | Pub | Google | Impr. | Clics | Pos. | Risque |
|---|---|---|---|---|---|---|---|---|
| ville | `/saint-victor` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| dompe | `/dompe-saint-victor` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| sable | `/sable-saint-victor` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| gravier | `/gravier-saint-victor` | oui | oui | unknown | 0 | 0 |  |  |
| poussiere-de-pierre | `/poussiere-de-pierre-saint-victor` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| beton | `/beton-saint-victor` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| asphalte | `/asphalte-saint-victor` | oui | oui | unknown | 0 | 0 |  |  |

Manquantes (21) : transport-vrac, livraison-terre, livraison-sable, livraison-gravier, livraison-pierre, excavation, nivellement, recherche-point-de-depot, courtage-materiaux, terre-tamisee, terre-contaminee, gravier-0-3-4, mg-20, mg-56, pierre, pierre-concassee, pierre-nette, roche, remblai, brique, neige — **À VALIDER AVANT EXPANSION**

### Sainte-Thècle — 7/28

| Famille | URL | Idx | Pub | Google | Impr. | Clics | Pos. | Risque |
|---|---|---|---|---|---|---|---|---|
| ville | `/sainte-thecle` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| dompe | `/dompe-sainte-thecle` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| sable | `/sable-sainte-thecle` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| gravier | `/gravier-sainte-thecle` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| poussiere-de-pierre | `/poussiere-de-pierre-sainte-thecle` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| beton | `/beton-sainte-thecle` | oui | oui | unknown | 0 | 0 |  |  |
| asphalte | `/asphalte-sainte-thecle` | oui | oui | — | 0 | 0 |  |  |

Manquantes (21) : transport-vrac, livraison-terre, livraison-sable, livraison-gravier, livraison-pierre, excavation, nivellement, recherche-point-de-depot, courtage-materiaux, terre-tamisee, terre-contaminee, gravier-0-3-4, mg-20, mg-56, pierre, pierre-concassee, pierre-nette, roche, remblai, brique, neige — **À VALIDER AVANT EXPANSION**

### Sainte-Émélie-de-l'Énergie — 7/28

| Famille | URL | Idx | Pub | Google | Impr. | Clics | Pos. | Risque |
|---|---|---|---|---|---|---|---|---|
| ville | `/sainte-emelie-de-l-energie` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| dompe | `/dompe-sainte-emelie-de-l-energie` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| sable | `/sable-sainte-emelie-de-l-energie` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| gravier | `/gravier-sainte-emelie-de-l-energie` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| poussiere-de-pierre | `/poussiere-de-pierre-sainte-emelie-de-l-energie` | oui | oui | unknown | 0 | 0 |  |  |
| beton | `/beton-sainte-emelie-de-l-energie` | oui | oui | — | 0 | 0 |  |  |
| asphalte | `/asphalte-sainte-emelie-de-l-energie` | oui | oui | unknown | 0 | 0 | 0.0 |  |

Manquantes (21) : transport-vrac, livraison-terre, livraison-sable, livraison-gravier, livraison-pierre, excavation, nivellement, recherche-point-de-depot, courtage-materiaux, terre-tamisee, terre-contaminee, gravier-0-3-4, mg-20, mg-56, pierre, pierre-concassee, pierre-nette, roche, remblai, brique, neige — **À VALIDER AVANT EXPANSION**

### Saints-Anges — 7/28

| Famille | URL | Idx | Pub | Google | Impr. | Clics | Pos. | Risque |
|---|---|---|---|---|---|---|---|---|
| ville | `/saints-anges` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| dompe | `/dompe-saints-anges` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| sable | `/sable-saints-anges` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| gravier | `/gravier-saints-anges` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| poussiere-de-pierre | `/poussiere-de-pierre-saints-anges` | oui | oui | — | 0 | 0 |  |  |
| beton | `/beton-saints-anges` | oui | oui | unknown | 0 | 0 |  |  |
| asphalte | `/asphalte-saints-anges` | oui | oui | unknown | 0 | 0 | 0.0 |  |

Manquantes (21) : transport-vrac, livraison-terre, livraison-sable, livraison-gravier, livraison-pierre, excavation, nivellement, recherche-point-de-depot, courtage-materiaux, terre-tamisee, terre-contaminee, gravier-0-3-4, mg-20, mg-56, pierre, pierre-concassee, pierre-nette, roche, remblai, brique, neige — **À VALIDER AVANT EXPANSION**

### Adstock — 6/28

| Famille | URL | Idx | Pub | Google | Impr. | Clics | Pos. | Risque |
|---|---|---|---|---|---|---|---|---|
| ville | `/adstock` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| dompe | `/dompe-adstock` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| sable | `/sable-adstock` | oui | oui | unknown | 0 | 0 |  |  |
| gravier | `/gravier-adstock` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| poussiere-de-pierre | `/poussiere-de-pierre-adstock` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| asphalte | `/asphalte-adstock` | oui | oui | unknown | 0 | 0 |  |  |

Manquantes (22) : transport-vrac, livraison-terre, livraison-sable, livraison-gravier, livraison-pierre, excavation, nivellement, recherche-point-de-depot, courtage-materiaux, terre-tamisee, terre-contaminee, gravier-0-3-4, mg-20, mg-56, pierre, pierre-concassee, pierre-nette, roche, remblai, beton, brique, neige — **À VALIDER AVANT EXPANSION**

### Beaumont — 6/28

| Famille | URL | Idx | Pub | Google | Impr. | Clics | Pos. | Risque |
|---|---|---|---|---|---|---|---|---|
| ville | `/beaumont` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| dompe | `/dompe-beaumont` | oui | oui | — | 0 | 0 |  |  |
| sable | `/sable-beaumont` | oui | oui | unknown | 0 | 0 |  |  |
| gravier | `/gravier-beaumont` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| poussiere-de-pierre | `/poussiere-de-pierre-beaumont` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| beton | `/beton-beaumont` | oui | oui | unknown | 0 | 0 | 0.0 |  |

Manquantes (22) : transport-vrac, livraison-terre, livraison-sable, livraison-gravier, livraison-pierre, excavation, nivellement, recherche-point-de-depot, courtage-materiaux, terre-tamisee, terre-contaminee, gravier-0-3-4, mg-20, mg-56, pierre, pierre-concassee, pierre-nette, roche, remblai, asphalte, brique, neige — **À VALIDER AVANT EXPANSION**

### Cap-Saint-Ignace — 6/28

| Famille | URL | Idx | Pub | Google | Impr. | Clics | Pos. | Risque |
|---|---|---|---|---|---|---|---|---|
| ville | `/cap-saint-ignace` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| dompe | `/dompe-cap-saint-ignace` | oui | oui | — | 0 | 0 |  |  |
| sable | `/sable-cap-saint-ignace` | oui | oui | unknown | 0 | 0 |  |  |
| gravier | `/gravier-cap-saint-ignace` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| poussiere-de-pierre | `/poussiere-de-pierre-cap-saint-ignace` | oui | oui | unknown | 0 | 0 |  |  |
| asphalte | `/asphalte-cap-saint-ignace` | oui | oui | unknown | 0 | 0 |  |  |

Manquantes (22) : transport-vrac, livraison-terre, livraison-sable, livraison-gravier, livraison-pierre, excavation, nivellement, recherche-point-de-depot, courtage-materiaux, terre-tamisee, terre-contaminee, gravier-0-3-4, mg-20, mg-56, pierre, pierre-concassee, pierre-nette, roche, remblai, beton, brique, neige — **À VALIDER AVANT EXPANSION**

### Entrelacs — 6/28

| Famille | URL | Idx | Pub | Google | Impr. | Clics | Pos. | Risque |
|---|---|---|---|---|---|---|---|---|
| ville | `/entrelacs` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| dompe | `/dompe-entrelacs` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| sable | `/sable-entrelacs` | oui | oui | unknown | 0 | 0 |  |  |
| gravier | `/gravier-entrelacs` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| poussiere-de-pierre | `/poussiere-de-pierre-entrelacs` | oui | oui | — | 0 | 0 |  |  |
| beton | `/beton-entrelacs` | oui | oui | unknown | 0 | 0 |  |  |

Manquantes (22) : transport-vrac, livraison-terre, livraison-sable, livraison-gravier, livraison-pierre, excavation, nivellement, recherche-point-de-depot, courtage-materiaux, terre-tamisee, terre-contaminee, gravier-0-3-4, mg-20, mg-56, pierre, pierre-concassee, pierre-nette, roche, remblai, asphalte, brique, neige — **À VALIDER AVANT EXPANSION**

### Frampton — 6/28

| Famille | URL | Idx | Pub | Google | Impr. | Clics | Pos. | Risque |
|---|---|---|---|---|---|---|---|---|
| ville | `/frampton` | oui | oui | — | 0 | 0 |  |  |
| dompe | `/dompe-frampton` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| sable | `/sable-frampton` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| gravier | `/gravier-frampton` | oui | oui | unknown | 0 | 0 |  |  |
| poussiere-de-pierre | `/poussiere-de-pierre-frampton` | oui | oui | unknown | 0 | 0 |  |  |
| beton | `/beton-frampton` | oui | oui | unknown | 0 | 0 | 0.0 |  |

Manquantes (22) : transport-vrac, livraison-terre, livraison-sable, livraison-gravier, livraison-pierre, excavation, nivellement, recherche-point-de-depot, courtage-materiaux, terre-tamisee, terre-contaminee, gravier-0-3-4, mg-20, mg-56, pierre, pierre-concassee, pierre-nette, roche, remblai, asphalte, brique, neige — **À VALIDER AVANT EXPANSION**

### Havelock — 6/28

| Famille | URL | Idx | Pub | Google | Impr. | Clics | Pos. | Risque |
|---|---|---|---|---|---|---|---|---|
| ville | `/havelock` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| dompe | `/dompe-havelock` | oui | oui | — | 0 | 0 |  |  |
| sable | `/sable-havelock` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| gravier | `/gravier-havelock` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| poussiere-de-pierre | `/poussiere-de-pierre-havelock` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| asphalte | `/asphalte-havelock` | oui | oui | unknown | 0 | 0 |  |  |

Manquantes (22) : transport-vrac, livraison-terre, livraison-sable, livraison-gravier, livraison-pierre, excavation, nivellement, recherche-point-de-depot, courtage-materiaux, terre-tamisee, terre-contaminee, gravier-0-3-4, mg-20, mg-56, pierre, pierre-concassee, pierre-nette, roche, remblai, beton, brique, neige — **À VALIDER AVANT EXPANSION**

### Lantier — 6/28

| Famille | URL | Idx | Pub | Google | Impr. | Clics | Pos. | Risque |
|---|---|---|---|---|---|---|---|---|
| ville | `/lantier` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| dompe | `/dompe-lantier` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| sable | `/sable-lantier` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| gravier | `/gravier-lantier` | oui | oui | — | 0 | 0 |  |  |
| poussiere-de-pierre | `/poussiere-de-pierre-lantier` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| asphalte | `/asphalte-lantier` | oui | oui | unknown | 0 | 0 | 0.0 |  |

Manquantes (22) : transport-vrac, livraison-terre, livraison-sable, livraison-gravier, livraison-pierre, excavation, nivellement, recherche-point-de-depot, courtage-materiaux, terre-tamisee, terre-contaminee, gravier-0-3-4, mg-20, mg-56, pierre, pierre-concassee, pierre-nette, roche, remblai, beton, brique, neige — **À VALIDER AVANT EXPANSION**

### Notre-Dame-du-Sacré-Coeur-d'Issoudun — 6/28

| Famille | URL | Idx | Pub | Google | Impr. | Clics | Pos. | Risque |
|---|---|---|---|---|---|---|---|---|
| ville | `/notre-dame-du-sacre-coeur-d-issoudun` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| dompe | `/dompe-notre-dame-du-sacre-coeur-d-issoudun` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| sable | `/sable-notre-dame-du-sacre-coeur-d-issoudun` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| gravier | `/gravier-notre-dame-du-sacre-coeur-d-issoudun` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| poussiere-de-pierre | `/poussiere-de-pierre-notre-dame-du-sacre-coeur-d-issoudun` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| asphalte | `/asphalte-notre-dame-du-sacre-coeur-d-issoudun` | oui | oui | — | 0 | 0 |  |  |

Manquantes (22) : transport-vrac, livraison-terre, livraison-sable, livraison-gravier, livraison-pierre, excavation, nivellement, recherche-point-de-depot, courtage-materiaux, terre-tamisee, terre-contaminee, gravier-0-3-4, mg-20, mg-56, pierre, pierre-concassee, pierre-nette, roche, remblai, beton, brique, neige — **À VALIDER AVANT EXPANSION**

### Saint-Calixte-de-Kilkenny — 6/28

| Famille | URL | Idx | Pub | Google | Impr. | Clics | Pos. | Risque |
|---|---|---|---|---|---|---|---|---|
| ville | `/saint-calixte-de-kilkenny` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| dompe | `/dompe-saint-calixte-de-kilkenny` | oui | oui | — | 0 | 0 |  |  |
| sable | `/sable-saint-calixte-de-kilkenny` | oui | oui | unknown | 0 | 0 |  |  |
| gravier | `/gravier-saint-calixte-de-kilkenny` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| poussiere-de-pierre | `/poussiere-de-pierre-saint-calixte-de-kilkenny` | oui | oui | — | 0 | 0 |  |  |
| beton | `/beton-saint-calixte-de-kilkenny` | oui | oui | unknown | 0 | 0 | 0.0 |  |

Manquantes (22) : transport-vrac, livraison-terre, livraison-sable, livraison-gravier, livraison-pierre, excavation, nivellement, recherche-point-de-depot, courtage-materiaux, terre-tamisee, terre-contaminee, gravier-0-3-4, mg-20, mg-56, pierre, pierre-concassee, pierre-nette, roche, remblai, asphalte, brique, neige — **À VALIDER AVANT EXPANSION**

### Saint-Elzéar — 6/28

| Famille | URL | Idx | Pub | Google | Impr. | Clics | Pos. | Risque |
|---|---|---|---|---|---|---|---|---|
| ville | `/saint-elzear` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| dompe | `/dompe-saint-elzear` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| sable | `/sable-saint-elzear` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| gravier | `/gravier-saint-elzear` | oui | oui | unknown | 0 | 0 |  |  |
| poussiere-de-pierre | `/poussiere-de-pierre-saint-elzear` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| asphalte | `/asphalte-saint-elzear` | oui | oui | unknown | 0 | 0 | 0.0 |  |

Manquantes (22) : transport-vrac, livraison-terre, livraison-sable, livraison-gravier, livraison-pierre, excavation, nivellement, recherche-point-de-depot, courtage-materiaux, terre-tamisee, terre-contaminee, gravier-0-3-4, mg-20, mg-56, pierre, pierre-concassee, pierre-nette, roche, remblai, beton, brique, neige — **À VALIDER AVANT EXPANSION**

### Saint-Henri — 6/28

| Famille | URL | Idx | Pub | Google | Impr. | Clics | Pos. | Risque |
|---|---|---|---|---|---|---|---|---|
| ville | `/saint-henri` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| dompe | `/dompe-saint-henri` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| sable | `/sable-saint-henri` | oui | oui | unknown | 0 | 0 |  |  |
| gravier | `/gravier-saint-henri` | oui | oui | unknown | 0 | 0 |  |  |
| poussiere-de-pierre | `/poussiere-de-pierre-saint-henri` | oui | oui | — | 0 | 0 |  |  |
| asphalte | `/asphalte-saint-henri` | oui | oui | unknown | 0 | 0 |  |  |

Manquantes (22) : transport-vrac, livraison-terre, livraison-sable, livraison-gravier, livraison-pierre, excavation, nivellement, recherche-point-de-depot, courtage-materiaux, terre-tamisee, terre-contaminee, gravier-0-3-4, mg-20, mg-56, pierre, pierre-concassee, pierre-nette, roche, remblai, beton, brique, neige — **À VALIDER AVANT EXPANSION**

### Saint-Jules-de-Beauce — 6/28

| Famille | URL | Idx | Pub | Google | Impr. | Clics | Pos. | Risque |
|---|---|---|---|---|---|---|---|---|
| ville | `/saint-jules-de-beauce` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| dompe | `/dompe-saint-jules-de-beauce` | oui | oui | — | 0 | 0 |  |  |
| sable | `/sable-saint-jules-de-beauce` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| gravier | `/gravier-saint-jules-de-beauce` | oui | oui | unknown | 0 | 0 |  |  |
| poussiere-de-pierre | `/poussiere-de-pierre-saint-jules-de-beauce` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| asphalte | `/asphalte-saint-jules-de-beauce` | oui | oui | unknown | 0 | 0 | 0.0 |  |

Manquantes (22) : transport-vrac, livraison-terre, livraison-sable, livraison-gravier, livraison-pierre, excavation, nivellement, recherche-point-de-depot, courtage-materiaux, terre-tamisee, terre-contaminee, gravier-0-3-4, mg-20, mg-56, pierre, pierre-concassee, pierre-nette, roche, remblai, beton, brique, neige — **À VALIDER AVANT EXPANSION**

### Saint-Simon-les-Mines — 6/28

| Famille | URL | Idx | Pub | Google | Impr. | Clics | Pos. | Risque |
|---|---|---|---|---|---|---|---|---|
| ville | `/saint-simon-les-mines` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| dompe | `/dompe-saint-simon-les-mines` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| sable | `/sable-saint-simon-les-mines` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| gravier | `/gravier-saint-simon-les-mines` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| poussiere-de-pierre | `/poussiere-de-pierre-saint-simon-les-mines` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| asphalte | `/asphalte-saint-simon-les-mines` | oui | oui | unknown | 0 | 0 | 0.0 |  |

Manquantes (22) : transport-vrac, livraison-terre, livraison-sable, livraison-gravier, livraison-pierre, excavation, nivellement, recherche-point-de-depot, courtage-materiaux, terre-tamisee, terre-contaminee, gravier-0-3-4, mg-20, mg-56, pierre, pierre-concassee, pierre-nette, roche, remblai, beton, brique, neige — **À VALIDER AVANT EXPANSION**

### Saint-Théophile — 6/28

| Famille | URL | Idx | Pub | Google | Impr. | Clics | Pos. | Risque |
|---|---|---|---|---|---|---|---|---|
| ville | `/saint-theophile` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| dompe | `/dompe-saint-theophile` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| sable | `/sable-saint-theophile` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| gravier | `/gravier-saint-theophile` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| poussiere-de-pierre | `/poussiere-de-pierre-saint-theophile` | oui | oui | unknown | 0 | 0 |  |  |
| beton | `/beton-saint-theophile` | oui | oui | unknown | 0 | 0 | 0.0 |  |

Manquantes (22) : transport-vrac, livraison-terre, livraison-sable, livraison-gravier, livraison-pierre, excavation, nivellement, recherche-point-de-depot, courtage-materiaux, terre-tamisee, terre-contaminee, gravier-0-3-4, mg-20, mg-56, pierre, pierre-concassee, pierre-nette, roche, remblai, asphalte, brique, neige — **À VALIDER AVANT EXPANSION**

### Saint-Édouard-de-Lotbinière — 6/28

| Famille | URL | Idx | Pub | Google | Impr. | Clics | Pos. | Risque |
|---|---|---|---|---|---|---|---|---|
| ville | `/saint-edouard-de-lotbiniere` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| dompe | `/dompe-saint-edouard-de-lotbiniere` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| sable | `/sable-saint-edouard-de-lotbiniere` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| gravier | `/gravier-saint-edouard-de-lotbiniere` | oui | oui | unknown | 0 | 0 |  |  |
| poussiere-de-pierre | `/poussiere-de-pierre-saint-edouard-de-lotbiniere` | oui | oui | unknown | 0 | 0 |  |  |
| asphalte | `/asphalte-saint-edouard-de-lotbiniere` | oui | oui | unknown | 0 | 0 | 0.0 |  |

Manquantes (22) : transport-vrac, livraison-terre, livraison-sable, livraison-gravier, livraison-pierre, excavation, nivellement, recherche-point-de-depot, courtage-materiaux, terre-tamisee, terre-contaminee, gravier-0-3-4, mg-20, mg-56, pierre, pierre-concassee, pierre-nette, roche, remblai, beton, brique, neige — **À VALIDER AVANT EXPANSION**

### Sainte-Hénédine — 6/28

| Famille | URL | Idx | Pub | Google | Impr. | Clics | Pos. | Risque |
|---|---|---|---|---|---|---|---|---|
| ville | `/sainte-henedine` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| dompe | `/dompe-sainte-henedine` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| sable | `/sable-sainte-henedine` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| gravier | `/gravier-sainte-henedine` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| poussiere-de-pierre | `/poussiere-de-pierre-sainte-henedine` | oui | oui | — | 0 | 0 |  |  |
| beton | `/beton-sainte-henedine` | oui | oui | unknown | 0 | 0 | 0.0 |  |

Manquantes (22) : transport-vrac, livraison-terre, livraison-sable, livraison-gravier, livraison-pierre, excavation, nivellement, recherche-point-de-depot, courtage-materiaux, terre-tamisee, terre-contaminee, gravier-0-3-4, mg-20, mg-56, pierre, pierre-concassee, pierre-nette, roche, remblai, asphalte, brique, neige — **À VALIDER AVANT EXPANSION**

### East Broughton — 5/28

| Famille | URL | Idx | Pub | Google | Impr. | Clics | Pos. | Risque |
|---|---|---|---|---|---|---|---|---|
| ville | `/east-broughton` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| dompe | `/dompe-east-broughton` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| sable | `/sable-east-broughton` | oui | oui | unknown | 0 | 0 |  |  |
| gravier | `/gravier-east-broughton` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| poussiere-de-pierre | `/poussiere-de-pierre-east-broughton` | oui | oui | unknown | 0 | 0 | 0.0 |  |

Manquantes (23) : transport-vrac, livraison-terre, livraison-sable, livraison-gravier, livraison-pierre, excavation, nivellement, recherche-point-de-depot, courtage-materiaux, terre-tamisee, terre-contaminee, gravier-0-3-4, mg-20, mg-56, pierre, pierre-concassee, pierre-nette, roche, remblai, beton, asphalte, brique, neige — **À VALIDER AVANT EXPANSION**

### Grand-Saint-Esprit — 5/28

| Famille | URL | Idx | Pub | Google | Impr. | Clics | Pos. | Risque |
|---|---|---|---|---|---|---|---|---|
| ville | `/grand-saint-esprit` | oui | oui | unknown | 0 | 0 |  |  |
| dompe | `/dompe-grand-saint-esprit` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| sable | `/sable-grand-saint-esprit` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| gravier | `/gravier-grand-saint-esprit` | oui | oui | unknown | 0 | 0 |  |  |
| poussiere-de-pierre | `/poussiere-de-pierre-grand-saint-esprit` | oui | oui | unknown | 0 | 0 |  |  |

Manquantes (23) : transport-vrac, livraison-terre, livraison-sable, livraison-gravier, livraison-pierre, excavation, nivellement, recherche-point-de-depot, courtage-materiaux, terre-tamisee, terre-contaminee, gravier-0-3-4, mg-20, mg-56, pierre, pierre-concassee, pierre-nette, roche, remblai, beton, asphalte, brique, neige — **À VALIDER AVANT EXPANSION**

### Notre-Dame-des-Monts — 5/28

| Famille | URL | Idx | Pub | Google | Impr. | Clics | Pos. | Risque |
|---|---|---|---|---|---|---|---|---|
| ville | `/notre-dame-des-monts` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| dompe | `/dompe-notre-dame-des-monts` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| sable | `/sable-notre-dame-des-monts` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| gravier | `/gravier-notre-dame-des-monts` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| pierre | `/pierre-notre-dame-des-monts` | oui | oui | unknown | 0 | 0 | 0.0 |  |

Manquantes (23) : transport-vrac, livraison-terre, livraison-sable, livraison-gravier, livraison-pierre, excavation, nivellement, recherche-point-de-depot, courtage-materiaux, terre-tamisee, terre-contaminee, gravier-0-3-4, mg-20, mg-56, pierre-concassee, pierre-nette, poussiere-de-pierre, roche, remblai, beton, asphalte, brique, neige — **À VALIDER AVANT EXPANSION**

### Notre-Dame-du-Mont-Carmel — 5/28

| Famille | URL | Idx | Pub | Google | Impr. | Clics | Pos. | Risque |
|---|---|---|---|---|---|---|---|---|
| ville | `/notre-dame-du-mont-carmel` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| dompe | `/dompe-notre-dame-du-mont-carmel` | oui | oui | — | 0 | 0 |  |  |
| sable | `/sable-notre-dame-du-mont-carmel` | oui | oui | unknown | 0 | 0 |  |  |
| gravier | `/gravier-notre-dame-du-mont-carmel` | oui | oui | — | 0 | 0 |  |  |
| poussiere-de-pierre | `/poussiere-de-pierre-notre-dame-du-mont-carmel` | oui | oui | unknown | 0 | 0 | 0.0 |  |

Manquantes (23) : transport-vrac, livraison-terre, livraison-sable, livraison-gravier, livraison-pierre, excavation, nivellement, recherche-point-de-depot, courtage-materiaux, terre-tamisee, terre-contaminee, gravier-0-3-4, mg-20, mg-56, pierre, pierre-concassee, pierre-nette, roche, remblai, beton, asphalte, brique, neige — **À VALIDER AVANT EXPANSION**

### Saguenay — 5/28

| Famille | URL | Idx | Pub | Google | Impr. | Clics | Pos. | Risque |
|---|---|---|---|---|---|---|---|---|
| ville | `/saguenay` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| dompe | `/dompe-saguenay` | oui | oui | — | 0 | 0 |  |  |
| sable | `/sable-saguenay` | oui | oui | unknown | 0 | 0 |  |  |
| gravier | `/gravier-saguenay` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| poussiere-de-pierre | `/poussiere-de-pierre-saguenay` | oui | oui | unknown | 0 | 0 | 0.0 |  |

Manquantes (23) : transport-vrac, livraison-terre, livraison-sable, livraison-gravier, livraison-pierre, excavation, nivellement, recherche-point-de-depot, courtage-materiaux, terre-tamisee, terre-contaminee, gravier-0-3-4, mg-20, mg-56, pierre, pierre-concassee, pierre-nette, roche, remblai, beton, asphalte, brique, neige — **À VALIDER AVANT EXPANSION**

### Saint-Antoine-de-Tilly — 5/28

| Famille | URL | Idx | Pub | Google | Impr. | Clics | Pos. | Risque |
|---|---|---|---|---|---|---|---|---|
| ville | `/saint-antoine-de-tilly` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| dompe | `/dompe-saint-antoine-de-tilly` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| sable | `/sable-saint-antoine-de-tilly` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| gravier | `/gravier-saint-antoine-de-tilly` | oui | oui | unknown | 0 | 0 |  |  |
| poussiere-de-pierre | `/poussiere-de-pierre-saint-antoine-de-tilly` | oui | oui | unknown | 0 | 0 | 0.0 |  |

Manquantes (23) : transport-vrac, livraison-terre, livraison-sable, livraison-gravier, livraison-pierre, excavation, nivellement, recherche-point-de-depot, courtage-materiaux, terre-tamisee, terre-contaminee, gravier-0-3-4, mg-20, mg-56, pierre, pierre-concassee, pierre-nette, roche, remblai, beton, asphalte, brique, neige — **À VALIDER AVANT EXPANSION**

### Saint-Casimir — 5/28

| Famille | URL | Idx | Pub | Google | Impr. | Clics | Pos. | Risque |
|---|---|---|---|---|---|---|---|---|
| ville | `/saint-casimir` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| dompe | `/dompe-saint-casimir` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| sable | `/sable-saint-casimir` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| gravier | `/gravier-saint-casimir` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| poussiere-de-pierre | `/poussiere-de-pierre-saint-casimir` | oui | oui | unknown | 0 | 0 | 0.0 |  |

Manquantes (23) : transport-vrac, livraison-terre, livraison-sable, livraison-gravier, livraison-pierre, excavation, nivellement, recherche-point-de-depot, courtage-materiaux, terre-tamisee, terre-contaminee, gravier-0-3-4, mg-20, mg-56, pierre, pierre-concassee, pierre-nette, roche, remblai, beton, asphalte, brique, neige — **À VALIDER AVANT EXPANSION**

### Saint-Chrysostome — 5/28

| Famille | URL | Idx | Pub | Google | Impr. | Clics | Pos. | Risque |
|---|---|---|---|---|---|---|---|---|
| ville | `/saint-chrysostome` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| dompe | `/dompe-saint-chrysostome` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| gravier | `/gravier-saint-chrysostome` | oui | oui | unknown | 0 | 0 |  |  |
| beton | `/beton-saint-chrysostome` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| asphalte | `/asphalte-saint-chrysostome` | oui | oui | unknown | 0 | 0 | 0.0 |  |

Manquantes (23) : transport-vrac, livraison-terre, livraison-sable, livraison-gravier, livraison-pierre, excavation, nivellement, recherche-point-de-depot, courtage-materiaux, terre-tamisee, terre-contaminee, sable, gravier-0-3-4, mg-20, mg-56, pierre, pierre-concassee, pierre-nette, poussiere-de-pierre, roche, remblai, brique, neige — **À VALIDER AVANT EXPANSION**

### Saint-François-de-la-Rivière-du-Sud — 5/28

| Famille | URL | Idx | Pub | Google | Impr. | Clics | Pos. | Risque |
|---|---|---|---|---|---|---|---|---|
| ville | `/saint-francois-de-la-riviere-du-sud` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| dompe | `/dompe-saint-francois-de-la-riviere-du-sud` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| sable | `/sable-saint-francois-de-la-riviere-du-sud` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| gravier | `/gravier-saint-francois-de-la-riviere-du-sud` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| asphalte | `/asphalte-saint-francois-de-la-riviere-du-sud` | oui | oui | unknown | 0 | 0 | 0.0 |  |

Manquantes (23) : transport-vrac, livraison-terre, livraison-sable, livraison-gravier, livraison-pierre, excavation, nivellement, recherche-point-de-depot, courtage-materiaux, terre-tamisee, terre-contaminee, gravier-0-3-4, mg-20, mg-56, pierre, pierre-concassee, pierre-nette, poussiere-de-pierre, roche, remblai, beton, brique, neige — **À VALIDER AVANT EXPANSION**

### Saint-Isidore — 5/28

| Famille | URL | Idx | Pub | Google | Impr. | Clics | Pos. | Risque |
|---|---|---|---|---|---|---|---|---|
| ville | `/saint-isidore` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| dompe | `/dompe-saint-isidore` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| sable | `/sable-saint-isidore` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| gravier | `/gravier-saint-isidore` | oui | oui | unknown | 0 | 0 |  |  |
| asphalte | `/asphalte-saint-isidore` | oui | oui | unknown | 0 | 0 |  |  |

Manquantes (23) : transport-vrac, livraison-terre, livraison-sable, livraison-gravier, livraison-pierre, excavation, nivellement, recherche-point-de-depot, courtage-materiaux, terre-tamisee, terre-contaminee, gravier-0-3-4, mg-20, mg-56, pierre, pierre-concassee, pierre-nette, poussiere-de-pierre, roche, remblai, beton, brique, neige — **À VALIDER AVANT EXPANSION**

### Saint-Narcisse-de-Beaurivage — 5/28

| Famille | URL | Idx | Pub | Google | Impr. | Clics | Pos. | Risque |
|---|---|---|---|---|---|---|---|---|
| ville | `/saint-narcisse-de-beaurivage` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| dompe | `/dompe-saint-narcisse-de-beaurivage` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| sable | `/sable-saint-narcisse-de-beaurivage` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| gravier | `/gravier-saint-narcisse-de-beaurivage` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| poussiere-de-pierre | `/poussiere-de-pierre-saint-narcisse-de-beaurivage` | oui | oui | unknown | 0 | 0 | 0.0 |  |

Manquantes (23) : transport-vrac, livraison-terre, livraison-sable, livraison-gravier, livraison-pierre, excavation, nivellement, recherche-point-de-depot, courtage-materiaux, terre-tamisee, terre-contaminee, gravier-0-3-4, mg-20, mg-56, pierre, pierre-concassee, pierre-nette, roche, remblai, beton, asphalte, brique, neige — **À VALIDER AVANT EXPANSION**

### Saint-Prosper-de-Champlain — 5/28

| Famille | URL | Idx | Pub | Google | Impr. | Clics | Pos. | Risque |
|---|---|---|---|---|---|---|---|---|
| ville | `/saint-prosper-de-champlain` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| sable | `/sable-saint-prosper-de-champlain` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| gravier | `/gravier-saint-prosper-de-champlain` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| poussiere-de-pierre | `/poussiere-de-pierre-saint-prosper-de-champlain` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| asphalte | `/asphalte-saint-prosper-de-champlain` | oui | oui | unknown | 0 | 0 | 0.0 |  |

Manquantes (23) : transport-vrac, livraison-terre, livraison-sable, livraison-gravier, livraison-pierre, excavation, nivellement, dompe, recherche-point-de-depot, courtage-materiaux, terre-tamisee, terre-contaminee, gravier-0-3-4, mg-20, mg-56, pierre, pierre-concassee, pierre-nette, roche, remblai, beton, brique, neige — **À VALIDER AVANT EXPANSION**

### Saint-Tite-des-Caps — 5/28

| Famille | URL | Idx | Pub | Google | Impr. | Clics | Pos. | Risque |
|---|---|---|---|---|---|---|---|---|
| ville | `/saint-tite-des-caps` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| dompe | `/dompe-saint-tite-des-caps` | oui | oui | — | 0 | 0 |  |  |
| sable | `/sable-saint-tite-des-caps` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| gravier | `/gravier-saint-tite-des-caps` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| poussiere-de-pierre | `/poussiere-de-pierre-saint-tite-des-caps` | oui | oui | — | 0 | 0 |  |  |

Manquantes (23) : transport-vrac, livraison-terre, livraison-sable, livraison-gravier, livraison-pierre, excavation, nivellement, recherche-point-de-depot, courtage-materiaux, terre-tamisee, terre-contaminee, gravier-0-3-4, mg-20, mg-56, pierre, pierre-concassee, pierre-nette, roche, remblai, beton, asphalte, brique, neige — **À VALIDER AVANT EXPANSION**

### Sainte-Marguerite — 5/28

| Famille | URL | Idx | Pub | Google | Impr. | Clics | Pos. | Risque |
|---|---|---|---|---|---|---|---|---|
| ville | `/sainte-marguerite` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| dompe | `/dompe-sainte-marguerite` | oui | oui | — | 0 | 0 |  |  |
| sable | `/sable-sainte-marguerite` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| gravier | `/gravier-sainte-marguerite` | oui | oui | unknown | 0 | 0 |  |  |
| poussiere-de-pierre | `/poussiere-de-pierre-sainte-marguerite` | oui | oui | unknown | 0 | 0 | 0.0 |  |

Manquantes (23) : transport-vrac, livraison-terre, livraison-sable, livraison-gravier, livraison-pierre, excavation, nivellement, recherche-point-de-depot, courtage-materiaux, terre-tamisee, terre-contaminee, gravier-0-3-4, mg-20, mg-56, pierre, pierre-concassee, pierre-nette, roche, remblai, beton, asphalte, brique, neige — **À VALIDER AVANT EXPANSION**

### Sainte-Marie — 5/28

| Famille | URL | Idx | Pub | Google | Impr. | Clics | Pos. | Risque |
|---|---|---|---|---|---|---|---|---|
| ville | `/sainte-marie` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| dompe | `/dompe-sainte-marie` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| sable | `/sable-sainte-marie` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| gravier | `/gravier-sainte-marie` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| poussiere-de-pierre | `/poussiere-de-pierre-sainte-marie` | oui | oui | — | 0 | 0 |  |  |

Manquantes (23) : transport-vrac, livraison-terre, livraison-sable, livraison-gravier, livraison-pierre, excavation, nivellement, recherche-point-de-depot, courtage-materiaux, terre-tamisee, terre-contaminee, gravier-0-3-4, mg-20, mg-56, pierre, pierre-concassee, pierre-nette, roche, remblai, beton, asphalte, brique, neige — **À VALIDER AVANT EXPANSION**

### Sainte-Sophie-de-Lévrard — 5/28

| Famille | URL | Idx | Pub | Google | Impr. | Clics | Pos. | Risque |
|---|---|---|---|---|---|---|---|---|
| ville | `/sainte-sophie-de-levrard` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| dompe | `/dompe-sainte-sophie-de-levrard` | oui | oui | — | 0 | 0 |  |  |
| sable | `/sable-sainte-sophie-de-levrard` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| gravier | `/gravier-sainte-sophie-de-levrard` | oui | oui | unknown | 0 | 0 |  |  |
| pierre | `/pierre-sainte-sophie-de-levrard` | oui | oui | unknown | 0 | 0 |  |  |

Manquantes (23) : transport-vrac, livraison-terre, livraison-sable, livraison-gravier, livraison-pierre, excavation, nivellement, recherche-point-de-depot, courtage-materiaux, terre-tamisee, terre-contaminee, gravier-0-3-4, mg-20, mg-56, pierre-concassee, pierre-nette, poussiere-de-pierre, roche, remblai, beton, asphalte, brique, neige — **À VALIDER AVANT EXPANSION**

### Grenville-sur-la-Rouge — 4/28

| Famille | URL | Idx | Pub | Google | Impr. | Clics | Pos. | Risque |
|---|---|---|---|---|---|---|---|---|
| ville | `/grenville-sur-la-rouge` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| sable | `/sable-grenville-sur-la-rouge` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| gravier | `/gravier-grenville-sur-la-rouge` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| poussiere-de-pierre | `/poussiere-de-pierre-grenville-sur-la-rouge` | oui | oui | unknown | 0 | 0 | 0.0 |  |

Manquantes (24) : transport-vrac, livraison-terre, livraison-sable, livraison-gravier, livraison-pierre, excavation, nivellement, dompe, recherche-point-de-depot, courtage-materiaux, terre-tamisee, terre-contaminee, gravier-0-3-4, mg-20, mg-56, pierre, pierre-concassee, pierre-nette, roche, remblai, beton, asphalte, brique, neige — **À VALIDER AVANT EXPANSION**

### Leclercville — 4/28

| Famille | URL | Idx | Pub | Google | Impr. | Clics | Pos. | Risque |
|---|---|---|---|---|---|---|---|---|
| ville | `/leclercville` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| dompe | `/dompe-leclercville` | oui | oui | — | 0 | 0 |  |  |
| sable | `/sable-leclercville` | oui | oui | unknown | 0 | 0 |  |  |
| poussiere-de-pierre | `/poussiere-de-pierre-leclercville` | oui | oui | — | 0 | 0 |  |  |

Manquantes (24) : transport-vrac, livraison-terre, livraison-sable, livraison-gravier, livraison-pierre, excavation, nivellement, recherche-point-de-depot, courtage-materiaux, terre-tamisee, terre-contaminee, gravier, gravier-0-3-4, mg-20, mg-56, pierre, pierre-concassee, pierre-nette, roche, remblai, beton, asphalte, brique, neige — **À VALIDER AVANT EXPANSION**

### Rawdon — 4/28

| Famille | URL | Idx | Pub | Google | Impr. | Clics | Pos. | Risque |
|---|---|---|---|---|---|---|---|---|
| ville | `/rawdon` | oui | oui | unknown | 0 | 0 |  |  |
| dompe | `/dompe-rawdon` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| poussiere-de-pierre | `/poussiere-de-pierre-rawdon` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| asphalte | `/asphalte-rawdon` | oui | oui | unknown | 0 | 0 |  |  |

Manquantes (24) : transport-vrac, livraison-terre, livraison-sable, livraison-gravier, livraison-pierre, excavation, nivellement, recherche-point-de-depot, courtage-materiaux, terre-tamisee, terre-contaminee, sable, gravier, gravier-0-3-4, mg-20, mg-56, pierre, pierre-concassee, pierre-nette, roche, remblai, beton, brique, neige — **À VALIDER AVANT EXPANSION**

### Saint-Alfred — 4/28

| Famille | URL | Idx | Pub | Google | Impr. | Clics | Pos. | Risque |
|---|---|---|---|---|---|---|---|---|
| ville | `/saint-alfred` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| dompe | `/dompe-saint-alfred` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| sable | `/sable-saint-alfred` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| gravier | `/gravier-saint-alfred` | oui | oui | — | 0 | 0 |  |  |

Manquantes (24) : transport-vrac, livraison-terre, livraison-sable, livraison-gravier, livraison-pierre, excavation, nivellement, recherche-point-de-depot, courtage-materiaux, terre-tamisee, terre-contaminee, gravier-0-3-4, mg-20, mg-56, pierre, pierre-concassee, pierre-nette, poussiere-de-pierre, roche, remblai, beton, asphalte, brique, neige — **À VALIDER AVANT EXPANSION**

### Saint-Damase-de-l'Islet — 4/28

| Famille | URL | Idx | Pub | Google | Impr. | Clics | Pos. | Risque |
|---|---|---|---|---|---|---|---|---|
| ville | `/saint-damase-de-l-islet` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| dompe | `/dompe-saint-damase-de-l-islet` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| gravier | `/gravier-saint-damase-de-l-islet` | oui | oui | unknown | 0 | 0 |  |  |
| poussiere-de-pierre | `/poussiere-de-pierre-saint-damase-de-l-islet` | oui | oui | unknown | 0 | 0 | 0.0 |  |

Manquantes (24) : transport-vrac, livraison-terre, livraison-sable, livraison-gravier, livraison-pierre, excavation, nivellement, recherche-point-de-depot, courtage-materiaux, terre-tamisee, terre-contaminee, sable, gravier-0-3-4, mg-20, mg-56, pierre, pierre-concassee, pierre-nette, roche, remblai, beton, asphalte, brique, neige — **À VALIDER AVANT EXPANSION**

### Saint-François-Xavier-de-Brompton — 4/28

| Famille | URL | Idx | Pub | Google | Impr. | Clics | Pos. | Risque |
|---|---|---|---|---|---|---|---|---|
| ville | `/saint-francois-xavier-de-brompton` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| sable | `/sable-saint-francois-xavier-de-brompton` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| gravier | `/gravier-saint-francois-xavier-de-brompton` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| poussiere-de-pierre | `/poussiere-de-pierre-saint-francois-xavier-de-brompton` | oui | oui | unknown | 0 | 0 | 0.0 |  |

Manquantes (24) : transport-vrac, livraison-terre, livraison-sable, livraison-gravier, livraison-pierre, excavation, nivellement, dompe, recherche-point-de-depot, courtage-materiaux, terre-tamisee, terre-contaminee, gravier-0-3-4, mg-20, mg-56, pierre, pierre-concassee, pierre-nette, roche, remblai, beton, asphalte, brique, neige — **À VALIDER AVANT EXPANSION**

### Saint-Gabriel — 4/28

| Famille | URL | Idx | Pub | Google | Impr. | Clics | Pos. | Risque |
|---|---|---|---|---|---|---|---|---|
| ville | `/saint-gabriel` | oui | oui | — | 0 | 0 |  |  |
| dompe | `/dompe-saint-gabriel` | oui | oui | — | 0 | 0 |  |  |
| gravier | `/gravier-saint-gabriel` | oui | oui | unknown | 0 | 0 |  |  |
| beton | `/beton-saint-gabriel` | oui | oui | unknown | 0 | 0 | 0.0 |  |

Manquantes (24) : transport-vrac, livraison-terre, livraison-sable, livraison-gravier, livraison-pierre, excavation, nivellement, recherche-point-de-depot, courtage-materiaux, terre-tamisee, terre-contaminee, sable, gravier-0-3-4, mg-20, mg-56, pierre, pierre-concassee, pierre-nette, poussiere-de-pierre, roche, remblai, asphalte, brique, neige — **À VALIDER AVANT EXPANSION**

### Saint-Hilarion — 4/28

| Famille | URL | Idx | Pub | Google | Impr. | Clics | Pos. | Risque |
|---|---|---|---|---|---|---|---|---|
| ville | `/saint-hilarion` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| dompe | `/dompe-saint-hilarion` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| sable | `/sable-saint-hilarion` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| gravier | `/gravier-saint-hilarion` | oui | oui | unknown | 0 | 0 | 0.0 |  |

Manquantes (24) : transport-vrac, livraison-terre, livraison-sable, livraison-gravier, livraison-pierre, excavation, nivellement, recherche-point-de-depot, courtage-materiaux, terre-tamisee, terre-contaminee, gravier-0-3-4, mg-20, mg-56, pierre, pierre-concassee, pierre-nette, poussiere-de-pierre, roche, remblai, beton, asphalte, brique, neige — **À VALIDER AVANT EXPANSION**

### Saint-Janvier-de-Joly — 4/28

| Famille | URL | Idx | Pub | Google | Impr. | Clics | Pos. | Risque |
|---|---|---|---|---|---|---|---|---|
| ville | `/saint-janvier-de-joly` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| dompe | `/dompe-saint-janvier-de-joly` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| sable | `/sable-saint-janvier-de-joly` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| gravier | `/gravier-saint-janvier-de-joly` | oui | oui | unknown | 0 | 0 | 0.0 |  |

Manquantes (24) : transport-vrac, livraison-terre, livraison-sable, livraison-gravier, livraison-pierre, excavation, nivellement, recherche-point-de-depot, courtage-materiaux, terre-tamisee, terre-contaminee, gravier-0-3-4, mg-20, mg-56, pierre, pierre-concassee, pierre-nette, poussiere-de-pierre, roche, remblai, beton, asphalte, brique, neige — **À VALIDER AVANT EXPANSION**

### Saint-Joachim — 4/28

| Famille | URL | Idx | Pub | Google | Impr. | Clics | Pos. | Risque |
|---|---|---|---|---|---|---|---|---|
| ville | `/saint-joachim` | oui | oui | — | 0 | 0 |  |  |
| dompe | `/dompe-saint-joachim` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| sable | `/sable-saint-joachim` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| poussiere-de-pierre | `/poussiere-de-pierre-saint-joachim` | oui | oui | unknown | 0 | 0 | 0.0 |  |

Manquantes (24) : transport-vrac, livraison-terre, livraison-sable, livraison-gravier, livraison-pierre, excavation, nivellement, recherche-point-de-depot, courtage-materiaux, terre-tamisee, terre-contaminee, gravier, gravier-0-3-4, mg-20, mg-56, pierre, pierre-concassee, pierre-nette, roche, remblai, beton, asphalte, brique, neige — **À VALIDER AVANT EXPANSION**

### Saint-Philémon — 4/28

| Famille | URL | Idx | Pub | Google | Impr. | Clics | Pos. | Risque |
|---|---|---|---|---|---|---|---|---|
| ville | `/saint-philemon` | oui | oui | — | 0 | 0 |  |  |
| dompe | `/dompe-saint-philemon` | oui | oui | — | 0 | 0 |  |  |
| sable | `/sable-saint-philemon` | oui | oui | unknown | 0 | 0 |  |  |
| gravier | `/gravier-saint-philemon` | oui | oui | unknown | 0 | 0 |  |  |

Manquantes (24) : transport-vrac, livraison-terre, livraison-sable, livraison-gravier, livraison-pierre, excavation, nivellement, recherche-point-de-depot, courtage-materiaux, terre-tamisee, terre-contaminee, gravier-0-3-4, mg-20, mg-56, pierre, pierre-concassee, pierre-nette, poussiere-de-pierre, roche, remblai, beton, asphalte, brique, neige — **À VALIDER AVANT EXPANSION**

### Scott — 4/28

| Famille | URL | Idx | Pub | Google | Impr. | Clics | Pos. | Risque |
|---|---|---|---|---|---|---|---|---|
| ville | `/scott` | oui | oui | unknown | 0 | 0 |  |  |
| dompe | `/dompe-scott` | oui | oui | — | 0 | 0 |  |  |
| sable | `/sable-scott` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| beton | `/beton-scott` | oui | oui | — | 0 | 0 |  |  |

Manquantes (24) : transport-vrac, livraison-terre, livraison-sable, livraison-gravier, livraison-pierre, excavation, nivellement, recherche-point-de-depot, courtage-materiaux, terre-tamisee, terre-contaminee, gravier, gravier-0-3-4, mg-20, mg-56, pierre, pierre-concassee, pierre-nette, poussiere-de-pierre, roche, remblai, asphalte, brique, neige — **À VALIDER AVANT EXPANSION**

### Trois-Rivières — 4/28

| Famille | URL | Idx | Pub | Google | Impr. | Clics | Pos. | Risque |
|---|---|---|---|---|---|---|---|---|
| ville | `/trois-rivieres` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| dompe | `/dompe-trois-rivieres` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| terre-tamisee | `/terre-tamisee-trois-rivieres` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| gravier | `/gravier-trois-rivieres` | oui | oui | unknown | 0 | 0 | 0.0 |  |

Manquantes (24) : transport-vrac, livraison-terre, livraison-sable, livraison-gravier, livraison-pierre, excavation, nivellement, recherche-point-de-depot, courtage-materiaux, terre-contaminee, sable, gravier-0-3-4, mg-20, mg-56, pierre, pierre-concassee, pierre-nette, poussiere-de-pierre, roche, remblai, beton, asphalte, brique, neige — **À VALIDER AVANT EXPANSION**

### Beauceville — 3/28

| Famille | URL | Idx | Pub | Google | Impr. | Clics | Pos. | Risque |
|---|---|---|---|---|---|---|---|---|
| ville | `/beauceville` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| dompe | `/dompe-beauceville` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| sable | `/sable-beauceville` | oui | oui | unknown | 0 | 0 | 0.0 |  |

Manquantes (25) : transport-vrac, livraison-terre, livraison-sable, livraison-gravier, livraison-pierre, excavation, nivellement, recherche-point-de-depot, courtage-materiaux, terre-tamisee, terre-contaminee, gravier, gravier-0-3-4, mg-20, mg-56, pierre, pierre-concassee, pierre-nette, poussiere-de-pierre, roche, remblai, beton, asphalte, brique, neige — **À VALIDER AVANT EXPANSION**

### Berthierville — 3/28

| Famille | URL | Idx | Pub | Google | Impr. | Clics | Pos. | Risque |
|---|---|---|---|---|---|---|---|---|
| ville | `/berthierville` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| dompe | `/dompe-berthierville` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| sable | `/sable-berthierville` | oui | oui | unknown | 0 | 0 | 0.0 |  |

Manquantes (25) : transport-vrac, livraison-terre, livraison-sable, livraison-gravier, livraison-pierre, excavation, nivellement, recherche-point-de-depot, courtage-materiaux, terre-tamisee, terre-contaminee, gravier, gravier-0-3-4, mg-20, mg-56, pierre, pierre-concassee, pierre-nette, poussiere-de-pierre, roche, remblai, beton, asphalte, brique, neige — **À VALIDER AVANT EXPANSION**

### Blainville — 3/28

| Famille | URL | Idx | Pub | Google | Impr. | Clics | Pos. | Risque |
|---|---|---|---|---|---|---|---|---|
| ville | `/blainville` | oui | oui | — | 0 | 0 |  |  |
| dompe | `/dompe-blainville` | oui | oui | — | 0 | 0 |  |  |
| sable | `/sable-blainville` | oui | oui | unknown | 0 | 0 |  |  |

Manquantes (25) : transport-vrac, livraison-terre, livraison-sable, livraison-gravier, livraison-pierre, excavation, nivellement, recherche-point-de-depot, courtage-materiaux, terre-tamisee, terre-contaminee, gravier, gravier-0-3-4, mg-20, mg-56, pierre, pierre-concassee, pierre-nette, poussiere-de-pierre, roche, remblai, beton, asphalte, brique, neige — **À VALIDER AVANT EXPANSION**

### Chertsey — 3/28

| Famille | URL | Idx | Pub | Google | Impr. | Clics | Pos. | Risque |
|---|---|---|---|---|---|---|---|---|
| ville | `/chertsey` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| dompe | `/dompe-chertsey` | oui | oui | — | 0 | 0 |  |  |
| sable | `/sable-chertsey` | oui | oui | unknown | 0 | 0 | 0.0 |  |

Manquantes (25) : transport-vrac, livraison-terre, livraison-sable, livraison-gravier, livraison-pierre, excavation, nivellement, recherche-point-de-depot, courtage-materiaux, terre-tamisee, terre-contaminee, gravier, gravier-0-3-4, mg-20, mg-56, pierre, pierre-concassee, pierre-nette, poussiere-de-pierre, roche, remblai, beton, asphalte, brique, neige — **À VALIDER AVANT EXPANSION**

### Disraeli — 3/28

| Famille | URL | Idx | Pub | Google | Impr. | Clics | Pos. | Risque |
|---|---|---|---|---|---|---|---|---|
| ville | `/disraeli` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| dompe | `/dompe-disraeli` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| sable | `/sable-disraeli` | oui | oui | unknown | 0 | 0 |  |  |

Manquantes (25) : transport-vrac, livraison-terre, livraison-sable, livraison-gravier, livraison-pierre, excavation, nivellement, recherche-point-de-depot, courtage-materiaux, terre-tamisee, terre-contaminee, gravier, gravier-0-3-4, mg-20, mg-56, pierre, pierre-concassee, pierre-nette, poussiere-de-pierre, roche, remblai, beton, asphalte, brique, neige — **À VALIDER AVANT EXPANSION**

### Lac-Etchemin — 3/28

| Famille | URL | Idx | Pub | Google | Impr. | Clics | Pos. | Risque |
|---|---|---|---|---|---|---|---|---|
| ville | `/lac-etchemin` | oui | oui | — | 0 | 0 |  |  |
| dompe | `/dompe-lac-etchemin` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| poussiere-de-pierre | `/poussiere-de-pierre-lac-etchemin` | oui | oui | unknown | 0 | 0 | 0.0 |  |

Manquantes (25) : transport-vrac, livraison-terre, livraison-sable, livraison-gravier, livraison-pierre, excavation, nivellement, recherche-point-de-depot, courtage-materiaux, terre-tamisee, terre-contaminee, sable, gravier, gravier-0-3-4, mg-20, mg-56, pierre, pierre-concassee, pierre-nette, roche, remblai, beton, asphalte, brique, neige — **À VALIDER AVANT EXPANSION**

### Laval — 3/28

| Famille | URL | Idx | Pub | Google | Impr. | Clics | Pos. | Risque |
|---|---|---|---|---|---|---|---|---|
| ville | `/laval` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| dompe | `/dompe-laval` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| recherche-point-de-depot | `/recherche-point-de-depot-laval` | oui | oui | unknown | 0 | 0 |  |  |

Manquantes (25) : transport-vrac, livraison-terre, livraison-sable, livraison-gravier, livraison-pierre, excavation, nivellement, courtage-materiaux, terre-tamisee, terre-contaminee, sable, gravier, gravier-0-3-4, mg-20, mg-56, pierre, pierre-concassee, pierre-nette, poussiere-de-pierre, roche, remblai, beton, asphalte, brique, neige — **À VALIDER AVANT EXPANSION**

### Parisville — 3/28

| Famille | URL | Idx | Pub | Google | Impr. | Clics | Pos. | Risque |
|---|---|---|---|---|---|---|---|---|
| ville | `/parisville` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| dompe | `/dompe-parisville` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| asphalte | `/asphalte-parisville` | oui | oui | unknown | 0 | 0 | 0.0 |  |

Manquantes (25) : transport-vrac, livraison-terre, livraison-sable, livraison-gravier, livraison-pierre, excavation, nivellement, recherche-point-de-depot, courtage-materiaux, terre-tamisee, terre-contaminee, sable, gravier, gravier-0-3-4, mg-20, mg-56, pierre, pierre-concassee, pierre-nette, poussiere-de-pierre, roche, remblai, beton, brique, neige — **À VALIDER AVANT EXPANSION**

### Saint-Benoît-Labre — 3/28

| Famille | URL | Idx | Pub | Google | Impr. | Clics | Pos. | Risque |
|---|---|---|---|---|---|---|---|---|
| ville | `/saint-benoit-labre` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| dompe | `/dompe-saint-benoit-labre` | oui | oui | unknown | 0 | 0 |  |  |
| asphalte | `/asphalte-saint-benoit-labre` | oui | oui | unknown | 0 | 0 |  |  |

Manquantes (25) : transport-vrac, livraison-terre, livraison-sable, livraison-gravier, livraison-pierre, excavation, nivellement, recherche-point-de-depot, courtage-materiaux, terre-tamisee, terre-contaminee, sable, gravier, gravier-0-3-4, mg-20, mg-56, pierre, pierre-concassee, pierre-nette, poussiere-de-pierre, roche, remblai, beton, brique, neige — **À VALIDER AVANT EXPANSION**

### Saint-Colomban — 3/28

| Famille | URL | Idx | Pub | Google | Impr. | Clics | Pos. | Risque |
|---|---|---|---|---|---|---|---|---|
| ville | `/saint-colomban` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| dompe | `/dompe-saint-colomban` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| sable | `/sable-saint-colomban` | oui | oui | unknown | 0 | 0 | 0.0 |  |

Manquantes (25) : transport-vrac, livraison-terre, livraison-sable, livraison-gravier, livraison-pierre, excavation, nivellement, recherche-point-de-depot, courtage-materiaux, terre-tamisee, terre-contaminee, gravier, gravier-0-3-4, mg-20, mg-56, pierre, pierre-concassee, pierre-nette, poussiere-de-pierre, roche, remblai, beton, asphalte, brique, neige — **À VALIDER AVANT EXPANSION**

### Saint-Fabien-de-Panet — 3/28

| Famille | URL | Idx | Pub | Google | Impr. | Clics | Pos. | Risque |
|---|---|---|---|---|---|---|---|---|
| ville | `/saint-fabien-de-panet` | oui | oui | — | 0 | 0 |  |  |
| dompe | `/dompe-saint-fabien-de-panet` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| gravier | `/gravier-saint-fabien-de-panet` | oui | oui | unknown | 0 | 0 | 0.0 |  |

Manquantes (25) : transport-vrac, livraison-terre, livraison-sable, livraison-gravier, livraison-pierre, excavation, nivellement, recherche-point-de-depot, courtage-materiaux, terre-tamisee, terre-contaminee, sable, gravier-0-3-4, mg-20, mg-56, pierre, pierre-concassee, pierre-nette, poussiere-de-pierre, roche, remblai, beton, asphalte, brique, neige — **À VALIDER AVANT EXPANSION**

### Saint-Félix-de-Valois — 3/28

| Famille | URL | Idx | Pub | Google | Impr. | Clics | Pos. | Risque |
|---|---|---|---|---|---|---|---|---|
| ville | `/saint-felix-de-valois` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| dompe | `/dompe-saint-felix-de-valois` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| sable | `/sable-saint-felix-de-valois` | oui | oui | unknown | 0 | 0 |  |  |

Manquantes (25) : transport-vrac, livraison-terre, livraison-sable, livraison-gravier, livraison-pierre, excavation, nivellement, recherche-point-de-depot, courtage-materiaux, terre-tamisee, terre-contaminee, gravier, gravier-0-3-4, mg-20, mg-56, pierre, pierre-concassee, pierre-nette, poussiere-de-pierre, roche, remblai, beton, asphalte, brique, neige — **À VALIDER AVANT EXPANSION**

### Saint-Gervais — 3/28

| Famille | URL | Idx | Pub | Google | Impr. | Clics | Pos. | Risque |
|---|---|---|---|---|---|---|---|---|
| ville | `/saint-gervais` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| dompe | `/dompe-saint-gervais` | oui | oui | — | 0 | 0 |  |  |
| sable | `/sable-saint-gervais` | oui | oui | unknown | 0 | 0 | 0.0 |  |

Manquantes (25) : transport-vrac, livraison-terre, livraison-sable, livraison-gravier, livraison-pierre, excavation, nivellement, recherche-point-de-depot, courtage-materiaux, terre-tamisee, terre-contaminee, gravier, gravier-0-3-4, mg-20, mg-56, pierre, pierre-concassee, pierre-nette, poussiere-de-pierre, roche, remblai, beton, asphalte, brique, neige — **À VALIDER AVANT EXPANSION**

### Saint-Jérôme — 3/28

| Famille | URL | Idx | Pub | Google | Impr. | Clics | Pos. | Risque |
|---|---|---|---|---|---|---|---|---|
| ville | `/saint-jerome` | oui | oui | unknown | 0 | 0 |  |  |
| dompe | `/dompe-saint-jerome` | oui | oui | unknown | 0 | 0 |  |  |
| sable | `/sable-saint-jerome` | oui | oui | unknown | 0 | 0 |  |  |

Manquantes (25) : transport-vrac, livraison-terre, livraison-sable, livraison-gravier, livraison-pierre, excavation, nivellement, recherche-point-de-depot, courtage-materiaux, terre-tamisee, terre-contaminee, gravier, gravier-0-3-4, mg-20, mg-56, pierre, pierre-concassee, pierre-nette, poussiere-de-pierre, roche, remblai, beton, asphalte, brique, neige — **À VALIDER AVANT EXPANSION**

### Saint-Michel-de-Bellechasse — 3/28

| Famille | URL | Idx | Pub | Google | Impr. | Clics | Pos. | Risque |
|---|---|---|---|---|---|---|---|---|
| ville | `/saint-michel-de-bellechasse` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| dompe | `/dompe-saint-michel-de-bellechasse` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| sable | `/sable-saint-michel-de-bellechasse` | oui | oui | unknown | 0 | 0 | 0.0 |  |

Manquantes (25) : transport-vrac, livraison-terre, livraison-sable, livraison-gravier, livraison-pierre, excavation, nivellement, recherche-point-de-depot, courtage-materiaux, terre-tamisee, terre-contaminee, gravier, gravier-0-3-4, mg-20, mg-56, pierre, pierre-concassee, pierre-nette, poussiere-de-pierre, roche, remblai, beton, asphalte, brique, neige — **À VALIDER AVANT EXPANSION**

### Saint-Nazaire-de-Dorchester — 3/28

| Famille | URL | Idx | Pub | Google | Impr. | Clics | Pos. | Risque |
|---|---|---|---|---|---|---|---|---|
| ville | `/saint-nazaire-de-dorchester` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| dompe | `/dompe-saint-nazaire-de-dorchester` | oui | oui | — | 0 | 0 |  |  |
| sable | `/sable-saint-nazaire-de-dorchester` | oui | oui | unknown | 0 | 0 | 0.0 |  |

Manquantes (25) : transport-vrac, livraison-terre, livraison-sable, livraison-gravier, livraison-pierre, excavation, nivellement, recherche-point-de-depot, courtage-materiaux, terre-tamisee, terre-contaminee, gravier, gravier-0-3-4, mg-20, mg-56, pierre, pierre-concassee, pierre-nette, poussiere-de-pierre, roche, remblai, beton, asphalte, brique, neige — **À VALIDER AVANT EXPANSION**

### Saint-Pierre-de-Broughton — 3/28

| Famille | URL | Idx | Pub | Google | Impr. | Clics | Pos. | Risque |
|---|---|---|---|---|---|---|---|---|
| ville | `/saint-pierre-de-broughton` | oui | oui | — | 0 | 0 |  |  |
| dompe | `/dompe-saint-pierre-de-broughton` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| gravier | `/gravier-saint-pierre-de-broughton` | oui | oui | unknown | 0 | 0 | 0.0 |  |

Manquantes (25) : transport-vrac, livraison-terre, livraison-sable, livraison-gravier, livraison-pierre, excavation, nivellement, recherche-point-de-depot, courtage-materiaux, terre-tamisee, terre-contaminee, sable, gravier-0-3-4, mg-20, mg-56, pierre, pierre-concassee, pierre-nette, poussiere-de-pierre, roche, remblai, beton, asphalte, brique, neige — **À VALIDER AVANT EXPANSION**

### Saint-René — 3/28

| Famille | URL | Idx | Pub | Google | Impr. | Clics | Pos. | Risque |
|---|---|---|---|---|---|---|---|---|
| ville | `/saint-rene` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| dompe | `/dompe-saint-rene` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| sable | `/sable-saint-rene` | oui | oui | unknown | 0 | 0 | 0.0 |  |

Manquantes (25) : transport-vrac, livraison-terre, livraison-sable, livraison-gravier, livraison-pierre, excavation, nivellement, recherche-point-de-depot, courtage-materiaux, terre-tamisee, terre-contaminee, gravier, gravier-0-3-4, mg-20, mg-56, pierre, pierre-concassee, pierre-nette, poussiere-de-pierre, roche, remblai, beton, asphalte, brique, neige — **À VALIDER AVANT EXPANSION**

### Saint-Étienne-des-Grès — 3/28

| Famille | URL | Idx | Pub | Google | Impr. | Clics | Pos. | Risque |
|---|---|---|---|---|---|---|---|---|
| ville | `/saint-etienne-des-gres` | oui | oui | — | 0 | 0 |  |  |
| dompe | `/dompe-saint-etienne-des-gres` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| sable | `/sable-saint-etienne-des-gres` | oui | oui | unknown | 0 | 0 | 0.0 |  |

Manquantes (25) : transport-vrac, livraison-terre, livraison-sable, livraison-gravier, livraison-pierre, excavation, nivellement, recherche-point-de-depot, courtage-materiaux, terre-tamisee, terre-contaminee, gravier, gravier-0-3-4, mg-20, mg-56, pierre, pierre-concassee, pierre-nette, poussiere-de-pierre, roche, remblai, beton, asphalte, brique, neige — **À VALIDER AVANT EXPANSION**

### Sainte-Christine-d'Auvergne — 3/28

| Famille | URL | Idx | Pub | Google | Impr. | Clics | Pos. | Risque |
|---|---|---|---|---|---|---|---|---|
| ville | `/sainte-christine-d-auvergne` | oui | oui | — | 0 | 0 |  |  |
| dompe | `/dompe-sainte-christine-d-auvergne` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| sable | `/sable-sainte-christine-d-auvergne` | oui | oui | unknown | 0 | 0 | 0.0 |  |

Manquantes (25) : transport-vrac, livraison-terre, livraison-sable, livraison-gravier, livraison-pierre, excavation, nivellement, recherche-point-de-depot, courtage-materiaux, terre-tamisee, terre-contaminee, gravier, gravier-0-3-4, mg-20, mg-56, pierre, pierre-concassee, pierre-nette, poussiere-de-pierre, roche, remblai, beton, asphalte, brique, neige — **À VALIDER AVANT EXPANSION**

### Sainte-Julienne — 3/28

| Famille | URL | Idx | Pub | Google | Impr. | Clics | Pos. | Risque |
|---|---|---|---|---|---|---|---|---|
| ville | `/sainte-julienne` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| dompe | `/dompe-sainte-julienne` | oui | oui | — | 0 | 0 |  |  |
| sable | `/sable-sainte-julienne` | oui | oui | unknown | 0 | 0 | 0.0 |  |

Manquantes (25) : transport-vrac, livraison-terre, livraison-sable, livraison-gravier, livraison-pierre, excavation, nivellement, recherche-point-de-depot, courtage-materiaux, terre-tamisee, terre-contaminee, gravier, gravier-0-3-4, mg-20, mg-56, pierre, pierre-concassee, pierre-nette, poussiere-de-pierre, roche, remblai, beton, asphalte, brique, neige — **À VALIDER AVANT EXPANSION**

### Shawinigan — 3/28

| Famille | URL | Idx | Pub | Google | Impr. | Clics | Pos. | Risque |
|---|---|---|---|---|---|---|---|---|
| ville | `/shawinigan` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| dompe | `/dompe-shawinigan` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| sable | `/sable-shawinigan` | oui | oui | unknown | 0 | 0 | 0.0 |  |

Manquantes (25) : transport-vrac, livraison-terre, livraison-sable, livraison-gravier, livraison-pierre, excavation, nivellement, recherche-point-de-depot, courtage-materiaux, terre-tamisee, terre-contaminee, gravier, gravier-0-3-4, mg-20, mg-56, pierre, pierre-concassee, pierre-nette, poussiere-de-pierre, roche, remblai, beton, asphalte, brique, neige — **À VALIDER AVANT EXPANSION**

### Stratford — 3/28

| Famille | URL | Idx | Pub | Google | Impr. | Clics | Pos. | Risque |
|---|---|---|---|---|---|---|---|---|
| ville | `/stratford` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| dompe | `/dompe-stratford` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| sable | `/sable-stratford` | oui | oui | unknown | 0 | 0 | 0.0 |  |

Manquantes (25) : transport-vrac, livraison-terre, livraison-sable, livraison-gravier, livraison-pierre, excavation, nivellement, recherche-point-de-depot, courtage-materiaux, terre-tamisee, terre-contaminee, gravier, gravier-0-3-4, mg-20, mg-56, pierre, pierre-concassee, pierre-nette, poussiere-de-pierre, roche, remblai, beton, asphalte, brique, neige — **À VALIDER AVANT EXPANSION**

### Villeroy — 3/28

| Famille | URL | Idx | Pub | Google | Impr. | Clics | Pos. | Risque |
|---|---|---|---|---|---|---|---|---|
| ville | `/villeroy` | oui | oui | — | 0 | 0 |  |  |
| dompe | `/dompe-villeroy` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| sable | `/sable-villeroy` | oui | oui | unknown | 0 | 0 | 0.0 |  |

Manquantes (25) : transport-vrac, livraison-terre, livraison-sable, livraison-gravier, livraison-pierre, excavation, nivellement, recherche-point-de-depot, courtage-materiaux, terre-tamisee, terre-contaminee, gravier, gravier-0-3-4, mg-20, mg-56, pierre, pierre-concassee, pierre-nette, poussiere-de-pierre, roche, remblai, beton, asphalte, brique, neige — **À VALIDER AVANT EXPANSION**

### Warwick — 3/28

| Famille | URL | Idx | Pub | Google | Impr. | Clics | Pos. | Risque |
|---|---|---|---|---|---|---|---|---|
| ville | `/warwick` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| dompe | `/dompe-warwick` | oui | oui | — | 0 | 0 |  |  |
| sable | `/sable-warwick` | oui | oui | unknown | 0 | 0 | 0.0 |  |

Manquantes (25) : transport-vrac, livraison-terre, livraison-sable, livraison-gravier, livraison-pierre, excavation, nivellement, recherche-point-de-depot, courtage-materiaux, terre-tamisee, terre-contaminee, gravier, gravier-0-3-4, mg-20, mg-56, pierre, pierre-concassee, pierre-nette, poussiere-de-pierre, roche, remblai, beton, asphalte, brique, neige — **À VALIDER AVANT EXPANSION**

### Bois-des-Filion — 2/28

| Famille | URL | Idx | Pub | Google | Impr. | Clics | Pos. | Risque |
|---|---|---|---|---|---|---|---|---|
| ville | `/bois-des-filion` | oui | oui | — | 0 | 0 |  |  |
| recherche-point-de-depot | `/recherche-point-de-depot-bois-des-filion` | oui | oui | unknown | 0 | 0 | 0.0 |  |

Manquantes (26) : transport-vrac, livraison-terre, livraison-sable, livraison-gravier, livraison-pierre, excavation, nivellement, dompe, courtage-materiaux, terre-tamisee, terre-contaminee, sable, gravier, gravier-0-3-4, mg-20, mg-56, pierre, pierre-concassee, pierre-nette, poussiere-de-pierre, roche, remblai, beton, asphalte, brique, neige — **À VALIDER AVANT EXPANSION**

### Bécancour — 2/28

| Famille | URL | Idx | Pub | Google | Impr. | Clics | Pos. | Risque |
|---|---|---|---|---|---|---|---|---|
| ville | `/becancour` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| recherche-point-de-depot | `/recherche-point-de-depot-becancour` | oui | oui | unknown | 0 | 0 | 0.0 |  |

Manquantes (26) : transport-vrac, livraison-terre, livraison-sable, livraison-gravier, livraison-pierre, excavation, nivellement, dompe, courtage-materiaux, terre-tamisee, terre-contaminee, sable, gravier, gravier-0-3-4, mg-20, mg-56, pierre, pierre-concassee, pierre-nette, poussiere-de-pierre, roche, remblai, beton, asphalte, brique, neige — **À VALIDER AVANT EXPANSION**

### Contrecoeur — 2/28

| Famille | URL | Idx | Pub | Google | Impr. | Clics | Pos. | Risque |
|---|---|---|---|---|---|---|---|---|
| ville | `/contrecoeur` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| dompe | `/dompe-contrecoeur` | oui | oui | unknown | 0 | 0 | 0.0 |  |

Manquantes (26) : transport-vrac, livraison-terre, livraison-sable, livraison-gravier, livraison-pierre, excavation, nivellement, recherche-point-de-depot, courtage-materiaux, terre-tamisee, terre-contaminee, sable, gravier, gravier-0-3-4, mg-20, mg-56, pierre, pierre-concassee, pierre-nette, poussiere-de-pierre, roche, remblai, beton, asphalte, brique, neige — **À VALIDER AVANT EXPANSION**

### Cowansville — 2/28

| Famille | URL | Idx | Pub | Google | Impr. | Clics | Pos. | Risque |
|---|---|---|---|---|---|---|---|---|
| ville | `/cowansville` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| dompe | `/dompe-cowansville` | oui | oui | unknown | 0 | 0 |  |  |

Manquantes (26) : transport-vrac, livraison-terre, livraison-sable, livraison-gravier, livraison-pierre, excavation, nivellement, recherche-point-de-depot, courtage-materiaux, terre-tamisee, terre-contaminee, sable, gravier, gravier-0-3-4, mg-20, mg-56, pierre, pierre-concassee, pierre-nette, poussiere-de-pierre, roche, remblai, beton, asphalte, brique, neige — **À VALIDER AVANT EXPANSION**

### Deschambault — 2/28

| Famille | URL | Idx | Pub | Google | Impr. | Clics | Pos. | Risque |
|---|---|---|---|---|---|---|---|---|
| ville | `/deschambault` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| dompe | `/dompe-deschambault` | oui | oui | unknown | 0 | 0 | 0.0 |  |

Manquantes (26) : transport-vrac, livraison-terre, livraison-sable, livraison-gravier, livraison-pierre, excavation, nivellement, recherche-point-de-depot, courtage-materiaux, terre-tamisee, terre-contaminee, sable, gravier, gravier-0-3-4, mg-20, mg-56, pierre, pierre-concassee, pierre-nette, poussiere-de-pierre, roche, remblai, beton, asphalte, brique, neige — **À VALIDER AVANT EXPANSION**

### Gore — 2/28

| Famille | URL | Idx | Pub | Google | Impr. | Clics | Pos. | Risque |
|---|---|---|---|---|---|---|---|---|
| ville | `/gore` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| dompe | `/dompe-gore` | oui | oui | unknown | 0 | 0 | 0.0 |  |

Manquantes (26) : transport-vrac, livraison-terre, livraison-sable, livraison-gravier, livraison-pierre, excavation, nivellement, recherche-point-de-depot, courtage-materiaux, terre-tamisee, terre-contaminee, sable, gravier, gravier-0-3-4, mg-20, mg-56, pierre, pierre-concassee, pierre-nette, poussiere-de-pierre, roche, remblai, beton, asphalte, brique, neige — **À VALIDER AVANT EXPANSION**

### Honfleur — 2/28

| Famille | URL | Idx | Pub | Google | Impr. | Clics | Pos. | Risque |
|---|---|---|---|---|---|---|---|---|
| ville | `/honfleur` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| dompe | `/dompe-honfleur` | oui | oui | unknown | 0 | 0 | 0.0 |  |

Manquantes (26) : transport-vrac, livraison-terre, livraison-sable, livraison-gravier, livraison-pierre, excavation, nivellement, recherche-point-de-depot, courtage-materiaux, terre-tamisee, terre-contaminee, sable, gravier, gravier-0-3-4, mg-20, mg-56, pierre, pierre-concassee, pierre-nette, poussiere-de-pierre, roche, remblai, beton, asphalte, brique, neige — **À VALIDER AVANT EXPANSION**

### Inverness — 2/28

| Famille | URL | Idx | Pub | Google | Impr. | Clics | Pos. | Risque |
|---|---|---|---|---|---|---|---|---|
| ville | `/inverness` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| dompe | `/dompe-inverness` | oui | oui | unknown | 0 | 0 | 0.0 |  |

Manquantes (26) : transport-vrac, livraison-terre, livraison-sable, livraison-gravier, livraison-pierre, excavation, nivellement, recherche-point-de-depot, courtage-materiaux, terre-tamisee, terre-contaminee, sable, gravier, gravier-0-3-4, mg-20, mg-56, pierre, pierre-concassee, pierre-nette, poussiere-de-pierre, roche, remblai, beton, asphalte, brique, neige — **À VALIDER AVANT EXPANSION**

### Irlande — 2/28

| Famille | URL | Idx | Pub | Google | Impr. | Clics | Pos. | Risque |
|---|---|---|---|---|---|---|---|---|
| ville | `/irlande` | oui | oui | unknown | 0 | 0 |  |  |
| dompe | `/dompe-irlande` | oui | oui | unknown | 0 | 0 | 0.0 |  |

Manquantes (26) : transport-vrac, livraison-terre, livraison-sable, livraison-gravier, livraison-pierre, excavation, nivellement, recherche-point-de-depot, courtage-materiaux, terre-tamisee, terre-contaminee, sable, gravier, gravier-0-3-4, mg-20, mg-56, pierre, pierre-concassee, pierre-nette, poussiere-de-pierre, roche, remblai, beton, asphalte, brique, neige — **À VALIDER AVANT EXPANSION**

### L'Islet — 2/28

| Famille | URL | Idx | Pub | Google | Impr. | Clics | Pos. | Risque |
|---|---|---|---|---|---|---|---|---|
| ville | `/l-islet` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| dompe | `/dompe-l-islet` | oui | oui | unknown | 0 | 0 | 0.0 |  |

Manquantes (26) : transport-vrac, livraison-terre, livraison-sable, livraison-gravier, livraison-pierre, excavation, nivellement, recherche-point-de-depot, courtage-materiaux, terre-tamisee, terre-contaminee, sable, gravier, gravier-0-3-4, mg-20, mg-56, pierre, pierre-concassee, pierre-nette, poussiere-de-pierre, roche, remblai, beton, asphalte, brique, neige — **À VALIDER AVANT EXPANSION**

### Mandeville — 2/28

| Famille | URL | Idx | Pub | Google | Impr. | Clics | Pos. | Risque |
|---|---|---|---|---|---|---|---|---|
| ville | `/mandeville` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| dompe | `/dompe-mandeville` | oui | oui | unknown | 0 | 0 | 0.0 |  |

Manquantes (26) : transport-vrac, livraison-terre, livraison-sable, livraison-gravier, livraison-pierre, excavation, nivellement, recherche-point-de-depot, courtage-materiaux, terre-tamisee, terre-contaminee, sable, gravier, gravier-0-3-4, mg-20, mg-56, pierre, pierre-concassee, pierre-nette, poussiere-de-pierre, roche, remblai, beton, asphalte, brique, neige — **À VALIDER AVANT EXPANSION**

### Montmagny — 2/28

| Famille | URL | Idx | Pub | Google | Impr. | Clics | Pos. | Risque |
|---|---|---|---|---|---|---|---|---|
| ville | `/montmagny` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| dompe | `/dompe-montmagny` | oui | oui | unknown | 0 | 0 | 0.0 |  |

Manquantes (26) : transport-vrac, livraison-terre, livraison-sable, livraison-gravier, livraison-pierre, excavation, nivellement, recherche-point-de-depot, courtage-materiaux, terre-tamisee, terre-contaminee, sable, gravier, gravier-0-3-4, mg-20, mg-56, pierre, pierre-concassee, pierre-nette, poussiere-de-pierre, roche, remblai, beton, asphalte, brique, neige — **À VALIDER AVANT EXPANSION**

### Prévost — 2/28

| Famille | URL | Idx | Pub | Google | Impr. | Clics | Pos. | Risque |
|---|---|---|---|---|---|---|---|---|
| ville | `/prevost` | oui | oui | unknown | 0 | 0 |  |  |
| dompe | `/dompe-prevost` | oui | oui | unknown | 0 | 0 | 0.0 |  |

Manquantes (26) : transport-vrac, livraison-terre, livraison-sable, livraison-gravier, livraison-pierre, excavation, nivellement, recherche-point-de-depot, courtage-materiaux, terre-tamisee, terre-contaminee, sable, gravier, gravier-0-3-4, mg-20, mg-56, pierre, pierre-concassee, pierre-nette, poussiere-de-pierre, roche, remblai, beton, asphalte, brique, neige — **À VALIDER AVANT EXPANSION**

### Racine — 2/28

| Famille | URL | Idx | Pub | Google | Impr. | Clics | Pos. | Risque |
|---|---|---|---|---|---|---|---|---|
| ville | `/racine` | oui | oui | unknown | 0 | 0 |  |  |
| dompe | `/dompe-racine` | oui | oui | unknown | 0 | 0 | 0.0 |  |

Manquantes (26) : transport-vrac, livraison-terre, livraison-sable, livraison-gravier, livraison-pierre, excavation, nivellement, recherche-point-de-depot, courtage-materiaux, terre-tamisee, terre-contaminee, sable, gravier, gravier-0-3-4, mg-20, mg-56, pierre, pierre-concassee, pierre-nette, poussiere-de-pierre, roche, remblai, beton, asphalte, brique, neige — **À VALIDER AVANT EXPANSION**

### Saint-Alban — 2/28

| Famille | URL | Idx | Pub | Google | Impr. | Clics | Pos. | Risque |
|---|---|---|---|---|---|---|---|---|
| ville | `/saint-alban` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| dompe | `/dompe-saint-alban` | oui | oui | — | 0 | 0 |  |  |

Manquantes (26) : transport-vrac, livraison-terre, livraison-sable, livraison-gravier, livraison-pierre, excavation, nivellement, recherche-point-de-depot, courtage-materiaux, terre-tamisee, terre-contaminee, sable, gravier, gravier-0-3-4, mg-20, mg-56, pierre, pierre-concassee, pierre-nette, poussiere-de-pierre, roche, remblai, beton, asphalte, brique, neige — **À VALIDER AVANT EXPANSION**

### Saint-Alphonse-Rodriguez — 2/28

| Famille | URL | Idx | Pub | Google | Impr. | Clics | Pos. | Risque |
|---|---|---|---|---|---|---|---|---|
| ville | `/saint-alphonse-rodriguez` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| sable | `/sable-saint-alphonse-rodriguez` | oui | oui | unknown | 0 | 0 |  |  |

Manquantes (26) : transport-vrac, livraison-terre, livraison-sable, livraison-gravier, livraison-pierre, excavation, nivellement, dompe, recherche-point-de-depot, courtage-materiaux, terre-tamisee, terre-contaminee, gravier, gravier-0-3-4, mg-20, mg-56, pierre, pierre-concassee, pierre-nette, poussiere-de-pierre, roche, remblai, beton, asphalte, brique, neige — **À VALIDER AVANT EXPANSION**

### Saint-Anselme — 2/28

| Famille | URL | Idx | Pub | Google | Impr. | Clics | Pos. | Risque |
|---|---|---|---|---|---|---|---|---|
| ville | `/saint-anselme` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| dompe | `/dompe-saint-anselme` | oui | oui | unknown | 0 | 0 | 0.0 |  |

Manquantes (26) : transport-vrac, livraison-terre, livraison-sable, livraison-gravier, livraison-pierre, excavation, nivellement, recherche-point-de-depot, courtage-materiaux, terre-tamisee, terre-contaminee, sable, gravier, gravier-0-3-4, mg-20, mg-56, pierre, pierre-concassee, pierre-nette, poussiere-de-pierre, roche, remblai, beton, asphalte, brique, neige — **À VALIDER AVANT EXPANSION**

### Saint-Antoine-Abbé — 2/28

| Famille | URL | Idx | Pub | Google | Impr. | Clics | Pos. | Risque |
|---|---|---|---|---|---|---|---|---|
| ville | `/saint-antoine-abbe` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| dompe | `/dompe-saint-antoine-abbe` | oui | oui | unknown | 0 | 0 | 0.0 |  |

Manquantes (26) : transport-vrac, livraison-terre, livraison-sable, livraison-gravier, livraison-pierre, excavation, nivellement, recherche-point-de-depot, courtage-materiaux, terre-tamisee, terre-contaminee, sable, gravier, gravier-0-3-4, mg-20, mg-56, pierre, pierre-concassee, pierre-nette, poussiere-de-pierre, roche, remblai, beton, asphalte, brique, neige — **À VALIDER AVANT EXPANSION**

### Saint-Barthélemy — 2/28

| Famille | URL | Idx | Pub | Google | Impr. | Clics | Pos. | Risque |
|---|---|---|---|---|---|---|---|---|
| ville | `/saint-barthelemy` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| dompe | `/dompe-saint-barthelemy` | oui | oui | unknown | 0 | 0 | 0.0 |  |

Manquantes (26) : transport-vrac, livraison-terre, livraison-sable, livraison-gravier, livraison-pierre, excavation, nivellement, recherche-point-de-depot, courtage-materiaux, terre-tamisee, terre-contaminee, sable, gravier, gravier-0-3-4, mg-20, mg-56, pierre, pierre-concassee, pierre-nette, poussiere-de-pierre, roche, remblai, beton, asphalte, brique, neige — **À VALIDER AVANT EXPANSION**

### Saint-Calixte — 2/28

| Famille | URL | Idx | Pub | Google | Impr. | Clics | Pos. | Risque |
|---|---|---|---|---|---|---|---|---|
| ville | `/saint-calixte` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| dompe | `/dompe-saint-calixte` | oui | oui | unknown | 0 | 0 | 0.0 |  |

Manquantes (26) : transport-vrac, livraison-terre, livraison-sable, livraison-gravier, livraison-pierre, excavation, nivellement, recherche-point-de-depot, courtage-materiaux, terre-tamisee, terre-contaminee, sable, gravier, gravier-0-3-4, mg-20, mg-56, pierre, pierre-concassee, pierre-nette, poussiere-de-pierre, roche, remblai, beton, asphalte, brique, neige — **À VALIDER AVANT EXPANSION**

### Saint-François-du-Lac — 2/28

| Famille | URL | Idx | Pub | Google | Impr. | Clics | Pos. | Risque |
|---|---|---|---|---|---|---|---|---|
| ville | `/saint-francois-du-lac` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| dompe | `/dompe-saint-francois-du-lac` | oui | oui | unknown | 0 | 0 | 0.0 |  |

Manquantes (26) : transport-vrac, livraison-terre, livraison-sable, livraison-gravier, livraison-pierre, excavation, nivellement, recherche-point-de-depot, courtage-materiaux, terre-tamisee, terre-contaminee, sable, gravier, gravier-0-3-4, mg-20, mg-56, pierre, pierre-concassee, pierre-nette, poussiere-de-pierre, roche, remblai, beton, asphalte, brique, neige — **À VALIDER AVANT EXPANSION**

### Saint-Gabriel-de-Brandon — 2/28

| Famille | URL | Idx | Pub | Google | Impr. | Clics | Pos. | Risque |
|---|---|---|---|---|---|---|---|---|
| ville | `/saint-gabriel-de-brandon` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| dompe | `/dompe-saint-gabriel-de-brandon` | oui | oui | unknown | 0 | 0 |  |  |

Manquantes (26) : transport-vrac, livraison-terre, livraison-sable, livraison-gravier, livraison-pierre, excavation, nivellement, recherche-point-de-depot, courtage-materiaux, terre-tamisee, terre-contaminee, sable, gravier, gravier-0-3-4, mg-20, mg-56, pierre, pierre-concassee, pierre-nette, poussiere-de-pierre, roche, remblai, beton, asphalte, brique, neige — **À VALIDER AVANT EXPANSION**

### Saint-Georges — 2/28

| Famille | URL | Idx | Pub | Google | Impr. | Clics | Pos. | Risque |
|---|---|---|---|---|---|---|---|---|
| ville | `/saint-georges` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| dompe | `/dompe-saint-georges` | oui | oui | unknown | 0 | 0 | 0.0 |  |

Manquantes (26) : transport-vrac, livraison-terre, livraison-sable, livraison-gravier, livraison-pierre, excavation, nivellement, recherche-point-de-depot, courtage-materiaux, terre-tamisee, terre-contaminee, sable, gravier, gravier-0-3-4, mg-20, mg-56, pierre, pierre-concassee, pierre-nette, poussiere-de-pierre, roche, remblai, beton, asphalte, brique, neige — **À VALIDER AVANT EXPANSION**

### Saint-Georges-de-Windsor — 2/28

| Famille | URL | Idx | Pub | Google | Impr. | Clics | Pos. | Risque |
|---|---|---|---|---|---|---|---|---|
| ville | `/saint-georges-de-windsor` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| sable | `/sable-saint-georges-de-windsor` | oui | oui | unknown | 0 | 0 | 0.0 |  |

Manquantes (26) : transport-vrac, livraison-terre, livraison-sable, livraison-gravier, livraison-pierre, excavation, nivellement, dompe, recherche-point-de-depot, courtage-materiaux, terre-tamisee, terre-contaminee, gravier, gravier-0-3-4, mg-20, mg-56, pierre, pierre-concassee, pierre-nette, poussiere-de-pierre, roche, remblai, beton, asphalte, brique, neige — **À VALIDER AVANT EXPANSION**

### Saint-Lazare-de-Bellechasse — 2/28

| Famille | URL | Idx | Pub | Google | Impr. | Clics | Pos. | Risque |
|---|---|---|---|---|---|---|---|---|
| ville | `/saint-lazare-de-bellechasse` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| dompe | `/dompe-saint-lazare-de-bellechasse` | oui | oui | unknown | 0 | 0 | 0.0 |  |

Manquantes (26) : transport-vrac, livraison-terre, livraison-sable, livraison-gravier, livraison-pierre, excavation, nivellement, recherche-point-de-depot, courtage-materiaux, terre-tamisee, terre-contaminee, sable, gravier, gravier-0-3-4, mg-20, mg-56, pierre, pierre-concassee, pierre-nette, poussiere-de-pierre, roche, remblai, beton, asphalte, brique, neige — **À VALIDER AVANT EXPANSION**

### Saint-Luc-de-Bellechasse — 2/28

| Famille | URL | Idx | Pub | Google | Impr. | Clics | Pos. | Risque |
|---|---|---|---|---|---|---|---|---|
| ville | `/saint-luc-de-bellechasse` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| dompe | `/dompe-saint-luc-de-bellechasse` | oui | oui | unknown | 0 | 0 | 0.0 |  |

Manquantes (26) : transport-vrac, livraison-terre, livraison-sable, livraison-gravier, livraison-pierre, excavation, nivellement, recherche-point-de-depot, courtage-materiaux, terre-tamisee, terre-contaminee, sable, gravier, gravier-0-3-4, mg-20, mg-56, pierre, pierre-concassee, pierre-nette, poussiere-de-pierre, roche, remblai, beton, asphalte, brique, neige — **À VALIDER AVANT EXPANSION**

### Saint-Magloire — 2/28

| Famille | URL | Idx | Pub | Google | Impr. | Clics | Pos. | Risque |
|---|---|---|---|---|---|---|---|---|
| ville | `/saint-magloire` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| dompe | `/dompe-saint-magloire` | oui | oui | unknown | 0 | 0 | 0.0 |  |

Manquantes (26) : transport-vrac, livraison-terre, livraison-sable, livraison-gravier, livraison-pierre, excavation, nivellement, recherche-point-de-depot, courtage-materiaux, terre-tamisee, terre-contaminee, sable, gravier, gravier-0-3-4, mg-20, mg-56, pierre, pierre-concassee, pierre-nette, poussiere-de-pierre, roche, remblai, beton, asphalte, brique, neige — **À VALIDER AVANT EXPANSION**

### Saint-Maurice — 2/28

| Famille | URL | Idx | Pub | Google | Impr. | Clics | Pos. | Risque |
|---|---|---|---|---|---|---|---|---|
| ville | `/saint-maurice` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| dompe | `/dompe-saint-maurice` | oui | oui | — | 0 | 0 |  |  |

Manquantes (26) : transport-vrac, livraison-terre, livraison-sable, livraison-gravier, livraison-pierre, excavation, nivellement, recherche-point-de-depot, courtage-materiaux, terre-tamisee, terre-contaminee, sable, gravier, gravier-0-3-4, mg-20, mg-56, pierre, pierre-concassee, pierre-nette, poussiere-de-pierre, roche, remblai, beton, asphalte, brique, neige — **À VALIDER AVANT EXPANSION**

### Saint-Odilon-de-Cranbourne — 2/28

| Famille | URL | Idx | Pub | Google | Impr. | Clics | Pos. | Risque |
|---|---|---|---|---|---|---|---|---|
| ville | `/saint-odilon-de-cranbourne` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| dompe | `/dompe-saint-odilon-de-cranbourne` | oui | oui | unknown | 0 | 0 | 0.0 |  |

Manquantes (26) : transport-vrac, livraison-terre, livraison-sable, livraison-gravier, livraison-pierre, excavation, nivellement, recherche-point-de-depot, courtage-materiaux, terre-tamisee, terre-contaminee, sable, gravier, gravier-0-3-4, mg-20, mg-56, pierre, pierre-concassee, pierre-nette, poussiere-de-pierre, roche, remblai, beton, asphalte, brique, neige — **À VALIDER AVANT EXPANSION**

### Saint-Philibert — 2/28

| Famille | URL | Idx | Pub | Google | Impr. | Clics | Pos. | Risque |
|---|---|---|---|---|---|---|---|---|
| ville | `/saint-philibert` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| dompe | `/dompe-saint-philibert` | oui | oui | unknown | 0 | 0 | 0.0 |  |

Manquantes (26) : transport-vrac, livraison-terre, livraison-sable, livraison-gravier, livraison-pierre, excavation, nivellement, recherche-point-de-depot, courtage-materiaux, terre-tamisee, terre-contaminee, sable, gravier, gravier-0-3-4, mg-20, mg-56, pierre, pierre-concassee, pierre-nette, poussiere-de-pierre, roche, remblai, beton, asphalte, brique, neige — **À VALIDER AVANT EXPANSION**

### Saint-Placide — 2/28

| Famille | URL | Idx | Pub | Google | Impr. | Clics | Pos. | Risque |
|---|---|---|---|---|---|---|---|---|
| ville | `/saint-placide` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| dompe | `/dompe-saint-placide` | oui | oui | unknown | 0 | 0 | 0.0 |  |

Manquantes (26) : transport-vrac, livraison-terre, livraison-sable, livraison-gravier, livraison-pierre, excavation, nivellement, recherche-point-de-depot, courtage-materiaux, terre-tamisee, terre-contaminee, sable, gravier, gravier-0-3-4, mg-20, mg-56, pierre, pierre-concassee, pierre-nette, poussiere-de-pierre, roche, remblai, beton, asphalte, brique, neige — **À VALIDER AVANT EXPANSION**

### Saint-Raphaël — 2/28

| Famille | URL | Idx | Pub | Google | Impr. | Clics | Pos. | Risque |
|---|---|---|---|---|---|---|---|---|
| ville | `/saint-raphael` | oui | oui | — | 0 | 0 |  |  |
| dompe | `/dompe-saint-raphael` | oui | oui | unknown | 0 | 0 | 0.0 |  |

Manquantes (26) : transport-vrac, livraison-terre, livraison-sable, livraison-gravier, livraison-pierre, excavation, nivellement, recherche-point-de-depot, courtage-materiaux, terre-tamisee, terre-contaminee, sable, gravier, gravier-0-3-4, mg-20, mg-56, pierre, pierre-concassee, pierre-nette, poussiere-de-pierre, roche, remblai, beton, asphalte, brique, neige — **À VALIDER AVANT EXPANSION**

### Sainte-Béatrix — 2/28

| Famille | URL | Idx | Pub | Google | Impr. | Clics | Pos. | Risque |
|---|---|---|---|---|---|---|---|---|
| ville | `/sainte-beatrix` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| dompe | `/dompe-sainte-beatrix` | oui | oui | unknown | 0 | 0 | 0.0 |  |

Manquantes (26) : transport-vrac, livraison-terre, livraison-sable, livraison-gravier, livraison-pierre, excavation, nivellement, recherche-point-de-depot, courtage-materiaux, terre-tamisee, terre-contaminee, sable, gravier, gravier-0-3-4, mg-20, mg-56, pierre, pierre-concassee, pierre-nette, poussiere-de-pierre, roche, remblai, beton, asphalte, brique, neige — **À VALIDER AVANT EXPANSION**

### Sainte-Claire — 2/28

| Famille | URL | Idx | Pub | Google | Impr. | Clics | Pos. | Risque |
|---|---|---|---|---|---|---|---|---|
| ville | `/sainte-claire` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| dompe | `/dompe-sainte-claire` | oui | oui | unknown | 0 | 0 | 0.0 |  |

Manquantes (26) : transport-vrac, livraison-terre, livraison-sable, livraison-gravier, livraison-pierre, excavation, nivellement, recherche-point-de-depot, courtage-materiaux, terre-tamisee, terre-contaminee, sable, gravier, gravier-0-3-4, mg-20, mg-56, pierre, pierre-concassee, pierre-nette, poussiere-de-pierre, roche, remblai, beton, asphalte, brique, neige — **À VALIDER AVANT EXPANSION**

### Sainte-Croix — 2/28

| Famille | URL | Idx | Pub | Google | Impr. | Clics | Pos. | Risque |
|---|---|---|---|---|---|---|---|---|
| ville | `/sainte-croix` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| sable | `/sable-sainte-croix` | oui | oui | unknown | 0 | 0 | 0.0 |  |

Manquantes (26) : transport-vrac, livraison-terre, livraison-sable, livraison-gravier, livraison-pierre, excavation, nivellement, dompe, recherche-point-de-depot, courtage-materiaux, terre-tamisee, terre-contaminee, gravier, gravier-0-3-4, mg-20, mg-56, pierre, pierre-concassee, pierre-nette, poussiere-de-pierre, roche, remblai, beton, asphalte, brique, neige — **À VALIDER AVANT EXPANSION**

### Sainte-Pétronille — 2/28

| Famille | URL | Idx | Pub | Google | Impr. | Clics | Pos. | Risque |
|---|---|---|---|---|---|---|---|---|
| ville | `/sainte-petronille` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| dompe | `/dompe-sainte-petronille` | oui | oui | — | 0 | 0 |  |  |

Manquantes (26) : transport-vrac, livraison-terre, livraison-sable, livraison-gravier, livraison-pierre, excavation, nivellement, recherche-point-de-depot, courtage-materiaux, terre-tamisee, terre-contaminee, sable, gravier, gravier-0-3-4, mg-20, mg-56, pierre, pierre-concassee, pierre-nette, poussiere-de-pierre, roche, remblai, beton, asphalte, brique, neige — **À VALIDER AVANT EXPANSION**

### Sainte-Sophie — 2/28

| Famille | URL | Idx | Pub | Google | Impr. | Clics | Pos. | Risque |
|---|---|---|---|---|---|---|---|---|
| ville | `/sainte-sophie` | oui | oui | — | 0 | 0 |  |  |
| dompe | `/dompe-sainte-sophie` | oui | oui | unknown | 0 | 0 | 0.0 |  |

Manquantes (26) : transport-vrac, livraison-terre, livraison-sable, livraison-gravier, livraison-pierre, excavation, nivellement, recherche-point-de-depot, courtage-materiaux, terre-tamisee, terre-contaminee, sable, gravier, gravier-0-3-4, mg-20, mg-56, pierre, pierre-concassee, pierre-nette, poussiere-de-pierre, roche, remblai, beton, asphalte, brique, neige — **À VALIDER AVANT EXPANSION**

### Val-Alain — 2/28

| Famille | URL | Idx | Pub | Google | Impr. | Clics | Pos. | Risque |
|---|---|---|---|---|---|---|---|---|
| ville | `/val-alain` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| dompe | `/dompe-val-alain` | oui | oui | unknown | 0 | 0 | 0.0 |  |

Manquantes (26) : transport-vrac, livraison-terre, livraison-sable, livraison-gravier, livraison-pierre, excavation, nivellement, recherche-point-de-depot, courtage-materiaux, terre-tamisee, terre-contaminee, sable, gravier, gravier-0-3-4, mg-20, mg-56, pierre, pierre-concassee, pierre-nette, poussiere-de-pierre, roche, remblai, beton, asphalte, brique, neige — **À VALIDER AVANT EXPANSION**

### Val-David — 2/28

| Famille | URL | Idx | Pub | Google | Impr. | Clics | Pos. | Risque |
|---|---|---|---|---|---|---|---|---|
| ville | `/val-david` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| dompe | `/dompe-val-david` | oui | oui | unknown | 0 | 0 | 0.0 |  |

Manquantes (26) : transport-vrac, livraison-terre, livraison-sable, livraison-gravier, livraison-pierre, excavation, nivellement, recherche-point-de-depot, courtage-materiaux, terre-tamisee, terre-contaminee, sable, gravier, gravier-0-3-4, mg-20, mg-56, pierre, pierre-concassee, pierre-nette, poussiere-de-pierre, roche, remblai, beton, asphalte, brique, neige — **À VALIDER AVANT EXPANSION**

### Victoriaville — 2/28

| Famille | URL | Idx | Pub | Google | Impr. | Clics | Pos. | Risque |
|---|---|---|---|---|---|---|---|---|
| ville | `/victoriaville` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| dompe | `/dompe-victoriaville` | oui | oui | unknown | 0 | 0 | 0.0 |  |

Manquantes (26) : transport-vrac, livraison-terre, livraison-sable, livraison-gravier, livraison-pierre, excavation, nivellement, recherche-point-de-depot, courtage-materiaux, terre-tamisee, terre-contaminee, sable, gravier, gravier-0-3-4, mg-20, mg-56, pierre, pierre-concassee, pierre-nette, poussiere-de-pierre, roche, remblai, beton, asphalte, brique, neige — **À VALIDER AVANT EXPANSION**

### Weedon — 2/28

| Famille | URL | Idx | Pub | Google | Impr. | Clics | Pos. | Risque |
|---|---|---|---|---|---|---|---|---|
| ville | `/weedon` | oui | oui | — | 0 | 0 |  |  |
| dompe | `/dompe-weedon` | oui | oui | — | 0 | 0 |  |  |

Manquantes (26) : transport-vrac, livraison-terre, livraison-sable, livraison-gravier, livraison-pierre, excavation, nivellement, recherche-point-de-depot, courtage-materiaux, terre-tamisee, terre-contaminee, sable, gravier, gravier-0-3-4, mg-20, mg-56, pierre, pierre-concassee, pierre-nette, poussiere-de-pierre, roche, remblai, beton, asphalte, brique, neige — **À VALIDER AVANT EXPANSION**

### Wentworth-Nord — 2/28

| Famille | URL | Idx | Pub | Google | Impr. | Clics | Pos. | Risque |
|---|---|---|---|---|---|---|---|---|
| ville | `/wentworth-nord` | oui | oui | — | 0 | 0 |  |  |
| dompe | `/dompe-wentworth-nord` | oui | oui | unknown | 0 | 0 | 0.0 |  |

Manquantes (26) : transport-vrac, livraison-terre, livraison-sable, livraison-gravier, livraison-pierre, excavation, nivellement, recherche-point-de-depot, courtage-materiaux, terre-tamisee, terre-contaminee, sable, gravier, gravier-0-3-4, mg-20, mg-56, pierre, pierre-concassee, pierre-nette, poussiere-de-pierre, roche, remblai, beton, asphalte, brique, neige — **À VALIDER AVANT EXPANSION**

### Windsor — 2/28

| Famille | URL | Idx | Pub | Google | Impr. | Clics | Pos. | Risque |
|---|---|---|---|---|---|---|---|---|
| ville | `/windsor` | oui | oui | unknown | 0 | 0 | 0.0 |  |
| dompe | `/dompe-windsor` | oui | oui | unknown | 0 | 0 | 0.0 |  |

Manquantes (26) : transport-vrac, livraison-terre, livraison-sable, livraison-gravier, livraison-pierre, excavation, nivellement, recherche-point-de-depot, courtage-materiaux, terre-tamisee, terre-contaminee, sable, gravier, gravier-0-3-4, mg-20, mg-56, pierre, pierre-concassee, pierre-nette, poussiere-de-pierre, roche, remblai, beton, asphalte, brique, neige — **À VALIDER AVANT EXPANSION**

### Brossard — 1/28

| Famille | URL | Idx | Pub | Google | Impr. | Clics | Pos. | Risque |
|---|---|---|---|---|---|---|---|---|
| ville | `/brossard` | oui | oui | unknown | 0 | 0 | 0.0 |  |

Manquantes (27) : transport-vrac, livraison-terre, livraison-sable, livraison-gravier, livraison-pierre, excavation, nivellement, dompe, recherche-point-de-depot, courtage-materiaux, terre-tamisee, terre-contaminee, sable, gravier, gravier-0-3-4, mg-20, mg-56, pierre, pierre-concassee, pierre-nette, poussiere-de-pierre, roche, remblai, beton, asphalte, brique, neige — **À VALIDER AVANT EXPANSION**

### Mont-Tremblant — 1/28

| Famille | URL | Idx | Pub | Google | Impr. | Clics | Pos. | Risque |
|---|---|---|---|---|---|---|---|---|
| ville | `/mont-tremblant` | oui | oui | unknown | 0 | 0 | 0.0 |  |

Manquantes (27) : transport-vrac, livraison-terre, livraison-sable, livraison-gravier, livraison-pierre, excavation, nivellement, dompe, recherche-point-de-depot, courtage-materiaux, terre-tamisee, terre-contaminee, sable, gravier, gravier-0-3-4, mg-20, mg-56, pierre, pierre-concassee, pierre-nette, poussiere-de-pierre, roche, remblai, beton, asphalte, brique, neige — **À VALIDER AVANT EXPANSION**

## 4. Villes complètes (A)

- Beauport — 28/28, 100 % (265 impr., 7 clics)
- Beaupré — 28/28, 100 % (316 impr., 7 clics)
- Boischatel — 28/28, 100 % (18 impr., 6 clics)
- Breakeyville — 28/28, 100 % (37 impr., 3 clics)
- Cap-Rouge — 28/28, 100 % (20 impr., 3 clics)
- Cap-Santé — 28/28, 100 % (117 impr., 4 clics)
- Charlesbourg — 28/28, 100 % (16 impr., 2 clics)
- Charny — 28/28, 100 % (32 impr., 1 clics)
- Château-Richer — 28/28, 100 % (35 impr., 4 clics)
- Donnacona — 28/28, 100 % (69 impr., 9 clics)
- Duberger — 28/28, 100 % (261 impr., 3 clics)
- Fossambault-sur-le-Lac — 28/28, 100 % (219 impr., 6 clics)
- L'Ancienne-Lorette — 28/28, 100 % (511 impr., 4 clics)
- L'Ange-Gardien — 28/28, 100 % (59 impr., 1 clics)
- La Cité-Limoilou — 28/28, 100 % (1136 impr., 3 clics)
- La Haute-Saint-Charles — 28/28, 100 % (107 impr., 0 clics)
- Lac-Beauport — 28/28, 100 % (148 impr., 1 clics)
- Lac-Delage — 28/28, 100 % (266 impr., 2 clics)
- Lac-Saint-Charles — 28/28, 100 % (271 impr., 2 clics)
- Lac-Saint-Joseph — 28/28, 100 % (151 impr., 1 clics)
- Laurier-Station — 28/28, 100 % (130 impr., 5 clics)
- Lauzon — 28/28, 100 % (104 impr., 2 clics)
- Les Rivières — 28/28, 100 % (74 impr., 2 clics)
- Limoilou — 28/28, 100 % (75 impr., 4 clics)
- Loretteville — 28/28, 100 % (528 impr., 12 clics)
- Lévis — 28/28, 100 % (386 impr., 14 clics)
- Montcalm — 28/28, 100 % (89 impr., 2 clics)
- Neufchâtel — 28/28, 100 % (186 impr., 2 clics)
- Neuville — 28/28, 100 % (45 impr., 5 clics)
- Pintendre — 28/28, 100 % (127 impr., 4 clics)
- Pont-Rouge — 28/28, 100 % (59 impr., 6 clics)
- Portneuf — 28/28, 100 % (292 impr., 16 clics)
- Québec — 28/28, 100 % (0 impr., 0 clics)
- Saint-Apollinaire — 28/28, 100 % (970 impr., 21 clics)
- Saint-Augustin-de-Desmaures — 28/28, 100 % (42 impr., 8 clics)
- Saint-Ferréol-les-Neiges — 28/28, 100 % (185 impr., 6 clics)
- Saint-Gabriel-de-Valcartier — 28/28, 100 % (114 impr., 3 clics)
- Saint-Jean-Chrysostome — 28/28, 100 % (410 impr., 6 clics)
- Saint-Lambert-de-Lauzon — 28/28, 100 % (193 impr., 1 clics)
- Saint-Nicolas — 28/28, 100 % (218 impr., 1 clics)
- Saint-Raymond — 28/28, 100 % (529 impr., 21 clics)
- Saint-Romuald — 28/28, 100 % (273 impr., 0 clics)
- Saint-Sauveur — 28/28, 100 % (102 impr., 7 clics)
- Saint-Émile — 28/28, 100 % (961 impr., 3 clics)
- Saint-Étienne-de-Lauzon — 28/28, 100 % (284 impr., 8 clics)
- Sainte-Anne-de-Beaupré — 28/28, 100 % (1173 impr., 11 clics)
- Sainte-Brigitte-de-Laval — 28/28, 100 % (83 impr., 2 clics)
- Sainte-Catherine-de-la-Jacques-Cartier — 28/28, 100 % (393 impr., 11 clics)
- Sainte-Foy — 28/28, 100 % (53 impr., 3 clics)
- Sainte-Foy–Sillery–Cap-Rouge — 28/28, 100 % (1609 impr., 2 clics)
- Shannon — 28/28, 100 % (85 impr., 3 clics)
- Sillery — 28/28, 100 % (45 impr., 0 clics)
- Stoneham-et-Tewkesbury — 28/28, 100 % (39 impr., 0 clics)
- Val-Bélair — 28/28, 100 % (121 impr., 1 clics)
- Vanier — 28/28, 100 % (46 impr., 2 clics)
- Wendake — 28/28, 100 % (111 impr., 5 clics)

## 5. Villes incomplètes

| Classe | Ville | Présentes | Manquantes | Couverture |
|---|---|---|---|---|
| E | Saint-Agapit | 8 | 20 | 28.6 % |
| E | Saint-Charles-de-Bellechasse | 8 | 20 | 28.6 % |
| E | Saint-Gilles | 8 | 20 | 28.6 % |
| E | Saint-Jean-de-Matha | 8 | 20 | 28.6 % |
| E | Saint-Joseph-de-Beauce | 8 | 20 | 28.6 % |
| E | Thetford Mines | 8 | 20 | 28.6 % |
| E | La Durantaye | 7 | 21 | 25.0 % |
| E | Mascouche | 7 | 21 | 25.0 % |
| E | Saint-Basile | 7 | 21 | 25.0 % |
| E | Saint-Cyrille-de-Lessard | 7 | 21 | 25.0 % |
| E | Saint-Damien | 7 | 21 | 25.0 % |
| E | Saint-Flavien | 7 | 21 | 25.0 % |
| E | Saint-Sylvestre | 7 | 21 | 25.0 % |
| E | Saint-Victor | 7 | 21 | 25.0 % |
| E | Sainte-Thècle | 7 | 21 | 25.0 % |
| E | Sainte-Émélie-de-l'Énergie | 7 | 21 | 25.0 % |
| E | Saints-Anges | 7 | 21 | 25.0 % |
| E | Adstock | 6 | 22 | 21.4 % |
| E | Beaumont | 6 | 22 | 21.4 % |
| E | Cap-Saint-Ignace | 6 | 22 | 21.4 % |
| E | Entrelacs | 6 | 22 | 21.4 % |
| E | Frampton | 6 | 22 | 21.4 % |
| E | Havelock | 6 | 22 | 21.4 % |
| E | Lantier | 6 | 22 | 21.4 % |
| E | Notre-Dame-du-Sacré-Coeur-d'Issoudun | 6 | 22 | 21.4 % |
| E | Saint-Calixte-de-Kilkenny | 6 | 22 | 21.4 % |
| E | Saint-Elzéar | 6 | 22 | 21.4 % |
| E | Saint-Henri | 6 | 22 | 21.4 % |
| E | Saint-Jules-de-Beauce | 6 | 22 | 21.4 % |
| E | Saint-Simon-les-Mines | 6 | 22 | 21.4 % |
| E | Saint-Théophile | 6 | 22 | 21.4 % |
| E | Saint-Édouard-de-Lotbinière | 6 | 22 | 21.4 % |
| E | Sainte-Hénédine | 6 | 22 | 21.4 % |
| E | East Broughton | 5 | 23 | 17.9 % |
| E | Grand-Saint-Esprit | 5 | 23 | 17.9 % |
| E | Notre-Dame-des-Monts | 5 | 23 | 17.9 % |
| E | Notre-Dame-du-Mont-Carmel | 5 | 23 | 17.9 % |
| E | Saguenay | 5 | 23 | 17.9 % |
| E | Saint-Antoine-de-Tilly | 5 | 23 | 17.9 % |
| E | Saint-Casimir | 5 | 23 | 17.9 % |
| E | Saint-Chrysostome | 5 | 23 | 17.9 % |
| E | Saint-François-de-la-Rivière-du-Sud | 5 | 23 | 17.9 % |
| E | Saint-Isidore | 5 | 23 | 17.9 % |
| E | Saint-Narcisse-de-Beaurivage | 5 | 23 | 17.9 % |
| E | Saint-Prosper-de-Champlain | 5 | 23 | 17.9 % |
| E | Saint-Tite-des-Caps | 5 | 23 | 17.9 % |
| E | Sainte-Marguerite | 5 | 23 | 17.9 % |
| E | Sainte-Marie | 5 | 23 | 17.9 % |
| E | Sainte-Sophie-de-Lévrard | 5 | 23 | 17.9 % |
| E | Grenville-sur-la-Rouge | 4 | 24 | 14.3 % |
| E | Leclercville | 4 | 24 | 14.3 % |
| E | Rawdon | 4 | 24 | 14.3 % |
| E | Saint-Alfred | 4 | 24 | 14.3 % |
| E | Saint-Damase-de-l'Islet | 4 | 24 | 14.3 % |
| E | Saint-François-Xavier-de-Brompton | 4 | 24 | 14.3 % |
| E | Saint-Gabriel | 4 | 24 | 14.3 % |
| E | Saint-Hilarion | 4 | 24 | 14.3 % |
| E | Saint-Janvier-de-Joly | 4 | 24 | 14.3 % |
| E | Saint-Joachim | 4 | 24 | 14.3 % |
| E | Saint-Philémon | 4 | 24 | 14.3 % |
| E | Scott | 4 | 24 | 14.3 % |
| E | Trois-Rivières | 4 | 24 | 14.3 % |
| E | Beauceville | 3 | 25 | 10.7 % |
| E | Berthierville | 3 | 25 | 10.7 % |
| E | Blainville | 3 | 25 | 10.7 % |
| E | Chertsey | 3 | 25 | 10.7 % |
| E | Disraeli | 3 | 25 | 10.7 % |
| E | Lac-Etchemin | 3 | 25 | 10.7 % |
| E | Laval | 3 | 25 | 10.7 % |
| E | Parisville | 3 | 25 | 10.7 % |
| E | Saint-Benoît-Labre | 3 | 25 | 10.7 % |
| E | Saint-Colomban | 3 | 25 | 10.7 % |
| E | Saint-Fabien-de-Panet | 3 | 25 | 10.7 % |
| E | Saint-Félix-de-Valois | 3 | 25 | 10.7 % |
| E | Saint-Gervais | 3 | 25 | 10.7 % |
| E | Saint-Jérôme | 3 | 25 | 10.7 % |
| E | Saint-Michel-de-Bellechasse | 3 | 25 | 10.7 % |
| E | Saint-Nazaire-de-Dorchester | 3 | 25 | 10.7 % |
| E | Saint-Pierre-de-Broughton | 3 | 25 | 10.7 % |
| E | Saint-René | 3 | 25 | 10.7 % |
| E | Saint-Étienne-des-Grès | 3 | 25 | 10.7 % |
| E | Sainte-Christine-d'Auvergne | 3 | 25 | 10.7 % |
| E | Sainte-Julienne | 3 | 25 | 10.7 % |
| E | Shawinigan | 3 | 25 | 10.7 % |
| E | Stratford | 3 | 25 | 10.7 % |
| E | Villeroy | 3 | 25 | 10.7 % |
| E | Warwick | 3 | 25 | 10.7 % |
| E | Bois-des-Filion | 2 | 26 | 7.1 % |
| E | Bécancour | 2 | 26 | 7.1 % |
| E | Contrecoeur | 2 | 26 | 7.1 % |
| E | Cowansville | 2 | 26 | 7.1 % |
| E | Deschambault | 2 | 26 | 7.1 % |
| E | Gore | 2 | 26 | 7.1 % |
| E | Honfleur | 2 | 26 | 7.1 % |
| E | Inverness | 2 | 26 | 7.1 % |
| E | Irlande | 2 | 26 | 7.1 % |
| E | L'Islet | 2 | 26 | 7.1 % |
| E | Mandeville | 2 | 26 | 7.1 % |
| E | Montmagny | 2 | 26 | 7.1 % |
| E | Prévost | 2 | 26 | 7.1 % |
| E | Racine | 2 | 26 | 7.1 % |
| E | Saint-Alban | 2 | 26 | 7.1 % |
| E | Saint-Alphonse-Rodriguez | 2 | 26 | 7.1 % |
| E | Saint-Anselme | 2 | 26 | 7.1 % |
| E | Saint-Antoine-Abbé | 2 | 26 | 7.1 % |
| E | Saint-Barthélemy | 2 | 26 | 7.1 % |
| E | Saint-Calixte | 2 | 26 | 7.1 % |
| E | Saint-François-du-Lac | 2 | 26 | 7.1 % |
| E | Saint-Gabriel-de-Brandon | 2 | 26 | 7.1 % |
| E | Saint-Georges | 2 | 26 | 7.1 % |
| E | Saint-Georges-de-Windsor | 2 | 26 | 7.1 % |
| E | Saint-Lazare-de-Bellechasse | 2 | 26 | 7.1 % |
| E | Saint-Luc-de-Bellechasse | 2 | 26 | 7.1 % |
| E | Saint-Magloire | 2 | 26 | 7.1 % |
| E | Saint-Maurice | 2 | 26 | 7.1 % |
| E | Saint-Odilon-de-Cranbourne | 2 | 26 | 7.1 % |
| E | Saint-Philibert | 2 | 26 | 7.1 % |
| E | Saint-Placide | 2 | 26 | 7.1 % |
| E | Saint-Raphaël | 2 | 26 | 7.1 % |
| E | Sainte-Béatrix | 2 | 26 | 7.1 % |
| E | Sainte-Claire | 2 | 26 | 7.1 % |
| E | Sainte-Croix | 2 | 26 | 7.1 % |
| E | Sainte-Pétronille | 2 | 26 | 7.1 % |
| E | Sainte-Sophie | 2 | 26 | 7.1 % |
| E | Val-Alain | 2 | 26 | 7.1 % |
| E | Val-David | 2 | 26 | 7.1 % |
| E | Victoriaville | 2 | 26 | 7.1 % |
| E | Weedon | 2 | 26 | 7.1 % |
| E | Wentworth-Nord | 2 | 26 | 7.1 % |
| E | Windsor | 2 | 26 | 7.1 % |
| E | Brossard | 1 | 27 | 3.6 % |
| E | Mont-Tremblant | 1 | 27 | 3.6 % |

## 6. Pages manquantes (par famille)

| Famille | Villes sans page | dont villes E |
|---|---|---|
| ville | 0 | 0 |
| transport-vrac | 132 | 132 |
| livraison-terre | 132 | 132 |
| livraison-sable | 132 | 132 |
| livraison-gravier | 132 | 132 |
| livraison-pierre | 132 | 132 |
| excavation | 132 | 132 |
| nivellement | 132 | 132 |
| dompe | 10 | 10 |
| recherche-point-de-depot | 129 | 129 |
| courtage-materiaux | 132 | 132 |
| terre-tamisee | 130 | 130 |
| terre-contaminee | 132 | 132 |
| sable | 53 | 53 |
| gravier | 72 | 72 |
| gravier-0-3-4 | 132 | 132 |
| mg-20 | 132 | 132 |
| mg-56 | 132 | 132 |
| pierre | 129 | 129 |
| pierre-concassee | 132 | 132 |
| pierre-nette | 132 | 132 |
| poussiere-de-pierre | 81 | 81 |
| roche | 132 | 132 |
| remblai | 125 | 125 |
| beton | 108 | 108 |
| asphalte | 99 | 99 |
| brique | 132 | 132 |
| neige | 132 | 132 |

## 7. Pages à PROTÉGER (ne jamais régénérer automatiquement)

| Page | Ville | Famille | Impr. | Clics | Pos. | Google |
|---|---|---|---|---|---|---|
| `/pierre-concassee-levis` | Lévis | pierre-concassee | 354 | 12 | 17.3 | indexed |
| `/livraison-pierre-saint-apollinaire` | Saint-Apollinaire | livraison-pierre | 301 | 11 | 37.9 | indexed |
| `/gravier-0-3-4-loretteville` | Loretteville | gravier-0-3-4 | 153 | 8 | 9.1 | indexed |
| `/pierre-concassee-beauport` | Beauport | pierre-concassee | 251 | 7 | 10.9 | indexed |
| `/gravier-0-3-4-saint-raymond` | Saint-Raymond | gravier-0-3-4 | 60 | 6 | 10.7 | indexed |
| `/donnacona` | Donnacona | ville | 25 | 6 | 10.6 | indexed |
| `/saint-apollinaire` | Saint-Apollinaire | ville | 156 | 5 | 47.3 | indexed |
| `/livraison-gravier-neuville` | Neuville | livraison-gravier | 36 | 5 | 8.9 | indexed |
| `/pierre-saint-augustin-de-desmaures` | Saint-Augustin-de-Desmaures | pierre | 25 | 5 | 3.5 | indexed |
| `/gravier-0-3-4-beaupre` | Beaupré | gravier-0-3-4 | 152 | 4 | 11.2 | indexed |
| `/livraison-pierre-portneuf` | Portneuf | livraison-pierre | 37 | 4 | 4.6 | indexed |
| `/saint-raymond` | Saint-Raymond | ville | 36 | 4 | 6.8 | indexed |
| `/terre-tamisee-saint-etienne-de-lauzon` | Saint-Étienne-de-Lauzon | terre-tamisee | 29 | 4 | 13.5 | indexed |
| `/chateau-richer` | Château-Richer | ville | 29 | 4 | 12.6 | indexed |
| `/poussiere-de-pierre-pont-rouge` | Pont-Rouge | poussiere-de-pierre | 27 | 4 | 5.3 | indexed |
| `/livraison-pierre-wendake` | Wendake | livraison-pierre | 20 | 4 | 5.8 | indexed |
| `/terre-tamisee-boischatel` | Boischatel | terre-tamisee | 14 | 4 | 6.1 | indexed |
| `/mg-20-sainte-anne-de-beaupre` | Sainte-Anne-de-Beaupré | mg-20 | 171 | 3 | 4.8 | indexed |
| `/nivellement-saint-jean-chrysostome` | Saint-Jean-Chrysostome | nivellement | 61 | 3 | 39.5 | indexed |
| `/livraison-gravier-portneuf` | Portneuf | livraison-gravier | 46 | 3 | 4.9 | indexed |
| `/livraison-terre-l-ancienne-lorette` | L'Ancienne-Lorette | livraison-terre | 37 | 3 | 4.8 | indexed |
| `/pierre-concassee-saint-sauveur` | Saint-Sauveur | pierre-concassee | 37 | 3 | 32.5 | indexed |
| `/livraison-pierre-sainte-catherine-de-la-jacques-cartier` | Sainte-Catherine-de-la-Jacques-Cartier | livraison-pierre | 26 | 3 | 5.7 | indexed |
| `/livraison-sable-portneuf` | Portneuf | livraison-sable | 24 | 3 | 3.8 | indexed |
| `/livraison-pierre-cap-rouge` | Cap-Rouge | livraison-pierre | 20 | 3 | 9.0 | indexed |
| `/livraison-gravier-laurier-station` | Laurier-Station | livraison-gravier | 17 | 3 | 3.1 | indexed |
| `/pierre-concassee-sainte-anne-de-beaupre` | Sainte-Anne-de-Beaupré | pierre-concassee | 14 | 3 | 3.9 | indexed |
| `/roche-saint-raymond` | Saint-Raymond | roche | 13 | 3 | 13.2 | indexed |
| `/gravier-0-3-4-saint-augustin-de-desmaures` | Saint-Augustin-de-Desmaures | gravier-0-3-4 | 13 | 3 | 7.3 | indexed |
| `/pierre-nette-saint-raymond` | Saint-Raymond | pierre-nette | 12 | 3 | 6.7 | indexed |
| `/pierre-concassee-saint-emile` | Saint-Émile | pierre-concassee | 805 | 2 | 34.1 | indexed |
| `/saint-jean-chrysostome` | Saint-Jean-Chrysostome | ville | 288 | 2 | 17.3 | indexed |
| `/transport-vrac-saint-apollinaire` | Saint-Apollinaire | transport-vrac | 251 | 2 | 40.4 | indexed |
| `/sainte-anne-de-beaupre` | Sainte-Anne-de-Beaupré | ville | 196 | 2 | 32.8 | indexed |
| `/remblai-duberger` | Duberger | remblai | 135 | 2 | 29.5 | indexed |
| `/transport-vrac-sainte-catherine-de-la-jacques-cartier` | Sainte-Catherine-de-la-Jacques-Cartier | transport-vrac | 94 | 2 | 72.8 | indexed |
| `/sable-saint-apollinaire` | Saint-Apollinaire | sable | 85 | 2 | 55.6 | indexed |
| `/gravier-0-3-4-lac-delage` | Lac-Delage | gravier-0-3-4 | 61 | 2 | 10.4 | indexed |
| `/livraison-terre-pintendre` | Pintendre | livraison-terre | 55 | 2 | 28.9 | indexed |
| `/transport-vrac-saint-gabriel-de-valcartier` | Saint-Gabriel-de-Valcartier | transport-vrac | 47 | 2 | 36.3 | indexed |
| `/poussiere-de-pierre-portneuf` | Portneuf | poussiere-de-pierre | 45 | 2 | 32.6 | indexed |
| `/mg-20-pintendre` | Pintendre | mg-20 | 44 | 2 | 4.1 | indexed |
| `/sainte-catherine-de-la-jacques-cartier` | Sainte-Catherine-de-la-Jacques-Cartier | ville | 38 | 2 | 17.7 | indexed |
| `/pierre-shannon` | Shannon | pierre | 37 | 2 | 5.0 | indexed |
| `/pierre-concassee-limoilou` | Limoilou | pierre-concassee | 28 | 2 | 36.5 | indexed |
| `/livraison-pierre-sainte-foy` | Sainte-Foy | livraison-pierre | 28 | 2 | 8.7 | indexed |
| `/livraison-sable-sainte-brigitte-de-laval` | Sainte-Brigitte-de-Laval | livraison-sable | 26 | 2 | 35.8 | indexed |
| `/livraison-gravier-loretteville` | Loretteville | livraison-gravier | 25 | 2 | 8.2 | indexed |
| `/sable-levis` | Lévis | sable | 22 | 2 | 23.8 | indexed |
| `/gravier-0-3-4-saint-etienne-de-lauzon` | Saint-Étienne-de-Lauzon | gravier-0-3-4 | 22 | 2 | 18.9 | indexed |
| `/gravier-saint-etienne-de-lauzon` | Saint-Étienne-de-Lauzon | gravier | 19 | 2 | 14.6 | indexed |
| `/roche-portneuf` | Portneuf | roche | 19 | 2 | 2.9 | indexed |
| `/gravier-0-3-4-sainte-anne-de-beaupre` | Sainte-Anne-de-Beaupré | gravier-0-3-4 | 18 | 2 | 10.5 | indexed |
| `/livraison-gravier-beaupre` | Beaupré | livraison-gravier | 17 | 2 | 6.1 | indexed |
| `/pierre-nette-charlesbourg` | Charlesbourg | pierre-nette | 16 | 2 | 4.0 | indexed |
| `/livraison-sable-pont-rouge` | Pont-Rouge | livraison-sable | 16 | 2 | 4.9 | indexed |
| `/beton-vanier` | Vanier | beton | 13 | 2 | 6.1 | indexed |
| `/poussiere-de-pierre-la-cite-limoilou` | La Cité-Limoilou | poussiere-de-pierre | 13 | 2 | 8.8 | indexed |
| `/gravier-saint-raymond` | Saint-Raymond | gravier | 11 | 2 | 12.9 | indexed |
| `/livraison-gravier-donnacona` | Donnacona | livraison-gravier | 10 | 2 | 3.1 | indexed |
| `/livraison-sable-saint-sauveur` | Saint-Sauveur | livraison-sable | 10 | 2 | 9.4 | indexed |
| `/pierre-nette-breakeyville` | Breakeyville | pierre-nette | 10 | 2 | 16.7 | indexed |
| `/gravier-0-3-4-montcalm` | Montcalm | gravier-0-3-4 | 8 | 2 | 2.8 | indexed |
| `/roche-fossambault-sur-le-lac` | Fossambault-sur-le-Lac | roche | 7 | 2 | 6.0 | indexed |
| `/pierre-boischatel` | Boischatel | pierre | 3 | 2 | 1.7 | indexed |
| `/gravier-sainte-foy-sillery-cap-rouge` | Sainte-Foy–Sillery–Cap-Rouge | gravier | 221 | 1 | 49.3 | indexed |
| `/excavation-sainte-catherine-de-la-jacques-cartier` | Sainte-Catherine-de-la-Jacques-Cartier | excavation | 140 | 1 | 23.7 | indexed |
| `/transport-vrac-saint-raymond` | Saint-Raymond | transport-vrac | 130 | 1 | 58.1 | indexed |
| `/asphalte-saint-emile` | Saint-Émile | asphalte | 107 | 1 | 58.3 | indexed |
| `/pierre-concassee-wendake` | Wendake | pierre-concassee | 88 | 1 | 55.6 | indexed |
| `/mg-20-lac-beauport` | Lac-Beauport | mg-20 | 87 | 1 | 5.0 | indexed |
| `/livraison-sable-val-belair` | Val-Bélair | livraison-sable | 82 | 1 | 36.2 | indexed |
| `/mg-56-fossambault-sur-le-lac` | Fossambault-sur-le-Lac | mg-56 | 73 | 1 | 4.8 | indexed |
| `/recherche-point-de-depot-saint-apollinaire` | Saint-Apollinaire | recherche-point-de-depot | 60 | 1 | 22.1 | indexed |
| `/asphalte-portneuf` | Portneuf | asphalte | 58 | 1 | 9.5 | indexed |
| `/pierre-concassee-saint-gabriel-de-valcartier` | Saint-Gabriel-de-Valcartier | pierre-concassee | 50 | 1 | 36.1 | indexed |
| `/pierre-concassee-saint-raymond` | Saint-Raymond | pierre-concassee | 49 | 1 | 27.8 | indexed |
| `/livraison-sable-laurier-station` | Laurier-Station | livraison-sable | 45 | 1 | 4.1 | indexed |
| `/mg-20-saint-ferreol-les-neiges` | Saint-Ferréol-les-Neiges | mg-20 | 37 | 1 | 5.6 | indexed |
| `/pierre-l-ancienne-lorette` | L'Ancienne-Lorette | pierre | 28 | 1 | 19.9 | indexed |
| `/pierre-concassee-saint-ferreol-les-neiges` | Saint-Ferréol-les-Neiges | pierre-concassee | 27 | 1 | 43.2 | indexed |
| `/dompe-la-cite-limoilou` | La Cité-Limoilou | dompe | 26 | 1 | 26.3 | indexed |
| `/dompe-sainte-foy` | Sainte-Foy | dompe | 25 | 1 | 26.4 | indexed |
| `/laurier-station` | Laurier-Station | ville | 25 | 1 | 28.9 | indexed |
| `/saint-sauveur` | Saint-Sauveur | ville | 25 | 1 | 6.5 | indexed |
| `/livraison-terre-saint-lambert-de-lauzon` | Saint-Lambert-de-Lauzon | livraison-terre | 24 | 1 | 34.7 | indexed |
| `/livraison-pierre-les-rivieres` | Les Rivières | livraison-pierre | 23 | 1 | 9.7 | indexed |
| `/recherche-point-de-depot-saint-jean-chrysostome` | Saint-Jean-Chrysostome | recherche-point-de-depot | 20 | 1 | 13.3 | indexed |
| `/roche-saint-nicolas` | Saint-Nicolas | roche | 19 | 1 | 8.3 | indexed |
| `/transport-vrac-cap-sante` | Cap-Santé | transport-vrac | 19 | 1 | 67.4 | unknown |
| `/livraison-sable-sainte-catherine-de-la-jacques-cartier` | Sainte-Catherine-de-la-Jacques-Cartier | livraison-sable | 18 | 1 | 18.9 | indexed |
| `/mg-56-les-rivieres` | Les Rivières | mg-56 | 16 | 1 | 6.1 | indexed |
| `/transport-vrac-donnacona` | Donnacona | transport-vrac | 16 | 1 | 60.0 | unknown |
| `/asphalte-limoilou` | Limoilou | asphalte | 14 | 1 | 5.3 | indexed |
| `/gravier-0-3-4-saint-ferreol-les-neiges` | Saint-Ferréol-les-Neiges | gravier-0-3-4 | 14 | 1 | 18.8 | indexed |
| `/neige-loretteville` | Loretteville | neige | 13 | 1 | 9.8 | indexed |
| `/mg-20-lauzon` | Lauzon | mg-20 | 13 | 1 | 4.9 | indexed |
| `/livraison-terre-lac-saint-charles` | Lac-Saint-Charles | livraison-terre | 13 | 1 | 11.5 | indexed |
| `/asphalte-loretteville` | Loretteville | asphalte | 13 | 1 | 7.7 | indexed |
| `/excavation-cap-sante` | Cap-Santé | excavation | 12 | 1 | 8.5 | indexed |
| `/gravier-0-3-4-duberger` | Duberger | gravier-0-3-4 | 10 | 1 | 4.6 | indexed |
| `/shannon` | Shannon | ville | 10 | 1 | 4.2 | unknown |
| `/pierre-saint-ferreol-les-neiges` | Saint-Ferréol-les-Neiges | pierre | 10 | 1 | 4.1 | unknown |
| `/courtage-materiaux-limoilou` | Limoilou | courtage-materiaux | 10 | 1 | 40.6 | indexed |
| `/sable-fossambault-sur-le-lac` | Fossambault-sur-le-Lac | sable | 10 | 1 | 49.6 | indexed |
| `/transport-vrac-breakeyville` | Breakeyville | transport-vrac | 9 | 1 | 23.4 | indexed |
| `/poussiere-de-pierre-sainte-catherine-de-la-jacques-cartier` | Sainte-Catherine-de-la-Jacques-Cartier | poussiere-de-pierre | 9 | 1 | 4.9 | indexed |
| `/livraison-terre-sainte-foy-sillery-cap-rouge` | Sainte-Foy–Sillery–Cap-Rouge | livraison-terre | 8 | 1 | 4.5 | indexed |
| `/dompe-sainte-catherine-de-la-jacques-cartier` | Sainte-Catherine-de-la-Jacques-Cartier | dompe | 8 | 1 | 5.6 | indexed |
| `/roche-saint-sauveur` | Saint-Sauveur | roche | 8 | 1 | 5.6 | indexed |
| `/neige-saint-ferreol-les-neiges` | Saint-Ferréol-les-Neiges | neige | 7 | 1 | 7.6 | indexed |
| `/poussiere-de-pierre-cap-sante` | Cap-Santé | poussiere-de-pierre | 7 | 1 | 5.4 | indexed |
| `/livraison-pierre-beaupre` | Beaupré | livraison-pierre | 7 | 1 | 26.7 | indexed |
| `/beton-saint-ferreol-les-neiges` | Saint-Ferréol-les-Neiges | beton | 6 | 1 | 5.0 | unknown |
| `/terre-tamisee-l-ange-gardien` | L'Ange-Gardien | terre-tamisee | 6 | 1 | 11.5 | indexed |
| `/beton-sainte-anne-de-beaupre` | Sainte-Anne-de-Beaupré | beton | 5 | 1 | 9.0 | indexed |
| `/asphalte-fossambault-sur-le-lac` | Fossambault-sur-le-Lac | asphalte | 5 | 1 | 8.2 | indexed |
| `/courtage-materiaux-charny` | Charny | courtage-materiaux | 4 | 1 | 8.5 | indexed |
| `/livraison-gravier-lauzon` | Lauzon | livraison-gravier | 4 | 1 | 9.0 | indexed |
| `/neufchatel` | Neufchâtel | ville | 4 | 1 | 6.0 | unknown |
| `/terre-contaminee-portneuf` | Portneuf | terre-contaminee | 4 | 1 | 9.5 | indexed |
| `/asphalte-saint-raymond` | Saint-Raymond | asphalte | 4 | 1 | 6.5 | indexed |
| `/terre-tamisee-cap-sante` | Cap-Santé | terre-tamisee | 3 | 1 | 1.7 | indexed |
| `/pierre-concassee-neufchatel` | Neufchâtel | pierre-concassee | 3 | 1 | 1.0 | unknown |
| `/beton-lac-saint-charles` | Lac-Saint-Charles | beton | 3 | 1 | 3.3 | indexed |
| `/livraison-terre-fossambault-sur-le-lac` | Fossambault-sur-le-Lac | livraison-terre | 2 | 1 | 3.0 | indexed |
| `/lac-saint-joseph` | Lac-Saint-Joseph | ville | 2 | 1 | 7.5 | indexed |
| `/excavation-sainte-foy-sillery-cap-rouge` | Sainte-Foy–Sillery–Cap-Rouge | excavation | 1015 | 0 | 13.8 | indexed |
| `/nivellement-la-cite-limoilou` | La Cité-Limoilou | nivellement | 968 | 0 | 10.3 | indexed |
| `/transport-vrac-sainte-anne-de-beaupre` | Sainte-Anne-de-Beaupré | transport-vrac | 624 | 0 | 20.6 | indexed |
| `/excavation-l-ancienne-lorette` | L'Ancienne-Lorette | excavation | 442 | 0 | 14.5 | indexed |
| `/transport-vrac-saint-romuald` | Saint-Romuald | transport-vrac | 226 | 0 | 53.6 | indexed |
| `/nivellement-sainte-foy-sillery-cap-rouge` | Sainte-Foy–Sillery–Cap-Rouge | nivellement | 218 | 0 | 49.7 | indexed |
| `/nivellement-loretteville` | Loretteville | nivellement | 198 | 0 | 68.8 | indexed |
| `/excavation-saint-etienne-de-lauzon` | Saint-Étienne-de-Lauzon | excavation | 138 | 0 | 11.6 | indexed |
| `/livraison-sable-saint-raymond` | Saint-Raymond | livraison-sable | 136 | 0 | 42.4 | indexed |
| `/excavation-saint-nicolas` | Saint-Nicolas | excavation | 134 | 0 | 34.8 | indexed |
| `/transport-vrac-neufchatel` | Neufchâtel | transport-vrac | 110 | 0 | 59.5 | indexed |
| `/mg-20-cap-sante` | Cap-Santé | mg-20 | 46 | 0 | 8.7 | indexed |
| `/mg-56-sainte-brigitte-de-laval` | Sainte-Brigitte-de-Laval | mg-56 | 29 | 0 | 5.1 | indexed |
| `/mg-20-lac-saint-charles` | Lac-Saint-Charles | mg-20 | 25 | 0 | 5.6 | unknown |
| `/dompe-la-haute-saint-charles` | La Haute-Saint-Charles | dompe | 25 | 0 | 7.2 | indexed |
| `/roche-montcalm` | Montcalm | roche | 22 | 0 | 9.9 | indexed |
| `/mg-20-beaupre` | Beaupré | mg-20 | 20 | 0 | 6.0 | indexed |

## 8. Risques de cannibalisation (signalement seulement — rien fusionné ni redirigé)

| Niveau | Ville | Page A | Page B | Type | Requête commune (ex.) |
|---|---|---|---|---|---|
| POTENTIEL | Beaupré | dompe | recherche-point-de-depot | dompe vs point de dépôt |  |
| POTENTIEL | Fossambault-sur-le-Lac | dompe | recherche-point-de-depot | dompe vs point de dépôt |  |
| POTENTIEL | La Haute-Saint-Charles | dompe | recherche-point-de-depot | dompe vs point de dépôt |  |
| POTENTIEL | Lauzon | dompe | recherche-point-de-depot | dompe vs point de dépôt |  |
| POTENTIEL | Saint-Ferréol-les-Neiges | dompe | recherche-point-de-depot | dompe vs point de dépôt |  |
| POTENTIEL | Saint-Lambert-de-Lauzon | dompe | recherche-point-de-depot | dompe vs point de dépôt |  |
| POTENTIEL | Sainte-Anne-de-Beaupré | dompe | recherche-point-de-depot | dompe vs point de dépôt |  |
| POTENTIEL | Sainte-Catherine-de-la-Jacques-Cartier | dompe | recherche-point-de-depot | dompe vs point de dépôt |  |
| POTENTIEL | Sainte-Foy–Sillery–Cap-Rouge | dompe | recherche-point-de-depot | dompe vs point de dépôt |  |
| POTENTIEL | Charny | excavation | nivellement | excavation vs nivellement |  |
| POTENTIEL | Donnacona | excavation | nivellement | excavation vs nivellement |  |
| POTENTIEL | Fossambault-sur-le-Lac | excavation | nivellement | excavation vs nivellement |  |
| POTENTIEL | Lac-Delage | excavation | nivellement | excavation vs nivellement |  |
| POTENTIEL | Loretteville | excavation | nivellement | excavation vs nivellement |  |
| POTENTIEL | Neuville | excavation | nivellement | excavation vs nivellement |  |
| POTENTIEL | Pintendre | excavation | nivellement | excavation vs nivellement |  |
| POTENTIEL | Saint-Apollinaire | excavation | nivellement | excavation vs nivellement |  |
| POTENTIEL | Saint-Ferréol-les-Neiges | excavation | nivellement | excavation vs nivellement |  |
| POTENTIEL | Sainte-Catherine-de-la-Jacques-Cartier | excavation | nivellement | excavation vs nivellement |  |
| POTENTIEL | Sainte-Foy–Sillery–Cap-Rouge | excavation | nivellement | excavation vs nivellement |  |
| POTENTIEL | Cap-Santé | sable | livraison-sable | matériau vs livraison |  |
| POTENTIEL | Fossambault-sur-le-Lac | pierre | livraison-pierre | matériau vs livraison |  |
| POTENTIEL | Fossambault-sur-le-Lac | terre-tamisee | livraison-terre | matériau vs livraison |  |
| POTENTIEL | Lac-Delage | pierre | livraison-pierre | matériau vs livraison |  |
| POTENTIEL | Lac-Saint-Charles | sable | livraison-sable | matériau vs livraison |  |
| POTENTIEL | Lac-Saint-Joseph | sable | livraison-sable | matériau vs livraison |  |
| POTENTIEL | Lac-Saint-Joseph | gravier | livraison-gravier | matériau vs livraison |  |
| POTENTIEL | Lac-Saint-Joseph | pierre | livraison-pierre | matériau vs livraison |  |
| POTENTIEL | Lévis | sable | livraison-sable | matériau vs livraison |  |
| POTENTIEL | Neufchâtel | sable | livraison-sable | matériau vs livraison |  |
| POTENTIEL | Portneuf | sable | livraison-sable | matériau vs livraison |  |
| POTENTIEL | Saint-Étienne-de-Lauzon | terre-tamisee | livraison-terre | matériau vs livraison |  |
| POTENTIEL | Saint-Ferréol-les-Neiges | gravier | livraison-gravier | matériau vs livraison |  |
| POTENTIEL | Sainte-Anne-de-Beaupré | sable | livraison-sable | matériau vs livraison |  |
| POTENTIEL | Sainte-Foy–Sillery–Cap-Rouge | gravier | livraison-gravier | matériau vs livraison |  |
| POTENTIEL | Cap-Santé | ville | livraison-sable | page ville vs livraison |  |
| POTENTIEL | Donnacona | ville | livraison-terre | page ville vs livraison |  |
| POTENTIEL | Donnacona | ville | livraison-gravier | page ville vs livraison |  |
| POTENTIEL | Donnacona | ville | livraison-pierre | page ville vs livraison |  |
| POTENTIEL | Fossambault-sur-le-Lac | ville | livraison-terre | page ville vs livraison |  |
| POTENTIEL | Fossambault-sur-le-Lac | ville | livraison-gravier | page ville vs livraison |  |
| POTENTIEL | Fossambault-sur-le-Lac | ville | livraison-pierre | page ville vs livraison |  |
| POTENTIEL | Lac-Delage | ville | livraison-terre | page ville vs livraison |  |
| POTENTIEL | Lac-Delage | ville | livraison-gravier | page ville vs livraison |  |
| POTENTIEL | Lac-Delage | ville | livraison-pierre | page ville vs livraison |  |
| POTENTIEL | Lac-Saint-Charles | ville | livraison-terre | page ville vs livraison |  |
| POTENTIEL | Lac-Saint-Charles | ville | livraison-sable | page ville vs livraison |  |
| POTENTIEL | Lac-Saint-Charles | ville | livraison-gravier | page ville vs livraison |  |
| POTENTIEL | Lac-Saint-Joseph | ville | livraison-sable | page ville vs livraison |  |
| POTENTIEL | Lac-Saint-Joseph | ville | livraison-gravier | page ville vs livraison |  |
| POTENTIEL | Lac-Saint-Joseph | ville | livraison-pierre | page ville vs livraison |  |
| POTENTIEL | Laurier-Station | ville | livraison-sable | page ville vs livraison |  |
| POTENTIEL | Laurier-Station | ville | livraison-gravier | page ville vs livraison |  |
| POTENTIEL | Lauzon | ville | livraison-gravier | page ville vs livraison |  |
| POTENTIEL | Loretteville | ville | livraison-terre | page ville vs livraison |  |
| POTENTIEL | Loretteville | ville | livraison-sable | page ville vs livraison |  |
| POTENTIEL | Loretteville | ville | livraison-gravier | page ville vs livraison |  |
| POTENTIEL | Neufchâtel | ville | livraison-sable | page ville vs livraison |  |
| POTENTIEL | Neufchâtel | ville | livraison-gravier | page ville vs livraison |  |
| POTENTIEL | Saint-Apollinaire | ville | livraison-pierre | page ville vs livraison |  |
| POTENTIEL | Saint-Raymond | ville | livraison-sable | page ville vs livraison |  |
| POTENTIEL | Saint-Raymond | ville | livraison-pierre | page ville vs livraison |  |
| POTENTIEL | Saint-Sauveur | ville | livraison-sable | page ville vs livraison |  |
| POTENTIEL | Saint-Sauveur | ville | livraison-gravier | page ville vs livraison |  |
| POTENTIEL | Sainte-Anne-de-Beaupré | ville | livraison-sable | page ville vs livraison |  |
| POTENTIEL | Sainte-Catherine-de-la-Jacques-Cartier | ville | livraison-sable | page ville vs livraison |  |
| POTENTIEL | Sainte-Catherine-de-la-Jacques-Cartier | ville | livraison-gravier | page ville vs livraison |  |
| POTENTIEL | Sainte-Catherine-de-la-Jacques-Cartier | ville | livraison-pierre | page ville vs livraison |  |
| POTENTIEL | Beaupré | transport-vrac | livraison-sable | transport vs livraison |  |
| POTENTIEL | Beaupré | transport-vrac | livraison-gravier | transport vs livraison |  |
| POTENTIEL | Beaupré | transport-vrac | livraison-pierre | transport vs livraison |  |
| POTENTIEL | Cap-Santé | transport-vrac | livraison-sable | transport vs livraison |  |
| POTENTIEL | Donnacona | transport-vrac | livraison-terre | transport vs livraison |  |
| POTENTIEL | Donnacona | transport-vrac | livraison-gravier | transport vs livraison |  |
| POTENTIEL | Donnacona | transport-vrac | livraison-pierre | transport vs livraison |  |
| POTENTIEL | Duberger | transport-vrac | livraison-sable | transport vs livraison |  |
| POTENTIEL | La Cité-Limoilou | transport-vrac | livraison-sable | transport vs livraison |  |
| POTENTIEL | La Haute-Saint-Charles | transport-vrac | livraison-pierre | transport vs livraison |  |
| POTENTIEL | Laurier-Station | transport-vrac | livraison-sable | transport vs livraison |  |
| POTENTIEL | Laurier-Station | transport-vrac | livraison-gravier | transport vs livraison |  |
| POTENTIEL | Lauzon | transport-vrac | livraison-gravier | transport vs livraison |  |
| POTENTIEL | Montcalm | transport-vrac | livraison-pierre | transport vs livraison |  |
| POTENTIEL | Neufchâtel | transport-vrac | livraison-sable | transport vs livraison |  |
| POTENTIEL | Neufchâtel | transport-vrac | livraison-gravier | transport vs livraison |  |
| POTENTIEL | Saint-Apollinaire | transport-vrac | livraison-pierre | transport vs livraison |  |
| POTENTIEL | Saint-Nicolas | transport-vrac | livraison-sable | transport vs livraison |  |
| POTENTIEL | Saint-Raymond | transport-vrac | livraison-sable | transport vs livraison |  |
| POTENTIEL | Saint-Raymond | transport-vrac | livraison-pierre | transport vs livraison |  |
| POTENTIEL | Saint-Romuald | transport-vrac | livraison-terre | transport vs livraison |  |
| POTENTIEL | Saint-Romuald | transport-vrac | livraison-gravier | transport vs livraison |  |
| POTENTIEL | Saint-Romuald | transport-vrac | livraison-pierre | transport vs livraison |  |
| POTENTIEL | Sainte-Anne-de-Beaupré | transport-vrac | livraison-sable | transport vs livraison |  |
| POTENTIEL | Sainte-Catherine-de-la-Jacques-Cartier | transport-vrac | livraison-sable | transport vs livraison |  |
| POTENTIEL | Sainte-Catherine-de-la-Jacques-Cartier | transport-vrac | livraison-gravier | transport vs livraison |  |
| POTENTIEL | Sainte-Catherine-de-la-Jacques-Cartier | transport-vrac | livraison-pierre | transport vs livraison |  |
| POTENTIEL | Sainte-Foy–Sillery–Cap-Rouge | transport-vrac | livraison-terre | transport vs livraison |  |
| POTENTIEL | Sainte-Foy–Sillery–Cap-Rouge | transport-vrac | livraison-gravier | transport vs livraison |  |
| POTENTIEL | Sainte-Foy–Sillery–Cap-Rouge | transport-vrac | livraison-pierre | transport vs livraison |  |

Par type : matériau vs livraison = 15, excavation vs nivellement = 11, page ville vs livraison = 33, transport vs livraison = 30, dompe vs point de dépôt = 9

## 9. Villes à valider avant expansion (E)

- Saint-Agapit (`saint-agapit`) — 8/28, non desservie, 0 impression : pages existantes conservées, **À VALIDER AVANT EXPANSION** (20 combinaisons)
- Saint-Charles-de-Bellechasse (`saint-charles-de-bellechasse`) — 8/28, non desservie, 0 impression : pages existantes conservées, **À VALIDER AVANT EXPANSION** (20 combinaisons)
- Saint-Gilles (`saint-gilles`) — 8/28, non desservie, 0 impression : pages existantes conservées, **À VALIDER AVANT EXPANSION** (20 combinaisons)
- Saint-Jean-de-Matha (`saint-jean-de-matha`) — 8/28, non desservie, 0 impression : pages existantes conservées, **À VALIDER AVANT EXPANSION** (20 combinaisons)
- Saint-Joseph-de-Beauce (`saint-joseph-de-beauce`) — 8/28, non desservie, 0 impression : pages existantes conservées, **À VALIDER AVANT EXPANSION** (20 combinaisons)
- Thetford Mines (`thetford-mines`) — 8/28, non desservie, 0 impression : pages existantes conservées, **À VALIDER AVANT EXPANSION** (20 combinaisons)
- La Durantaye (`la-durantaye`) — 7/28, non desservie, 0 impression : pages existantes conservées, **À VALIDER AVANT EXPANSION** (21 combinaisons)
- Mascouche (`mascouche`) — 7/28, non desservie, 0 impression : pages existantes conservées, **À VALIDER AVANT EXPANSION** (21 combinaisons)
- Saint-Basile (`saint-basile`) — 7/28, non desservie, 0 impression : pages existantes conservées, **À VALIDER AVANT EXPANSION** (21 combinaisons)
- Saint-Cyrille-de-Lessard (`saint-cyrille-de-lessard`) — 7/28, non desservie, 0 impression : pages existantes conservées, **À VALIDER AVANT EXPANSION** (21 combinaisons)
- Saint-Damien (`saint-damien`) — 7/28, non desservie, 0 impression : pages existantes conservées, **À VALIDER AVANT EXPANSION** (21 combinaisons)
- Saint-Flavien (`saint-flavien`) — 7/28, non desservie, 0 impression : pages existantes conservées, **À VALIDER AVANT EXPANSION** (21 combinaisons)
- Saint-Sylvestre (`saint-sylvestre`) — 7/28, non desservie, 0 impression : pages existantes conservées, **À VALIDER AVANT EXPANSION** (21 combinaisons)
- Saint-Victor (`saint-victor`) — 7/28, non desservie, 0 impression : pages existantes conservées, **À VALIDER AVANT EXPANSION** (21 combinaisons)
- Sainte-Thècle (`sainte-thecle`) — 7/28, non desservie, 0 impression : pages existantes conservées, **À VALIDER AVANT EXPANSION** (21 combinaisons)
- Sainte-Émélie-de-l'Énergie (`sainte-emelie-de-l-energie`) — 7/28, non desservie, 0 impression : pages existantes conservées, **À VALIDER AVANT EXPANSION** (21 combinaisons)
- Saints-Anges (`saints-anges`) — 7/28, non desservie, 0 impression : pages existantes conservées, **À VALIDER AVANT EXPANSION** (21 combinaisons)
- Adstock (`adstock`) — 6/28, non desservie, 0 impression : pages existantes conservées, **À VALIDER AVANT EXPANSION** (22 combinaisons)
- Beaumont (`beaumont`) — 6/28, non desservie, 0 impression : pages existantes conservées, **À VALIDER AVANT EXPANSION** (22 combinaisons)
- Cap-Saint-Ignace (`cap-saint-ignace`) — 6/28, non desservie, 0 impression : pages existantes conservées, **À VALIDER AVANT EXPANSION** (22 combinaisons)
- Entrelacs (`entrelacs`) — 6/28, non desservie, 0 impression : pages existantes conservées, **À VALIDER AVANT EXPANSION** (22 combinaisons)
- Frampton (`frampton`) — 6/28, non desservie, 0 impression : pages existantes conservées, **À VALIDER AVANT EXPANSION** (22 combinaisons)
- Havelock (`havelock`) — 6/28, non desservie, 0 impression : pages existantes conservées, **À VALIDER AVANT EXPANSION** (22 combinaisons)
- Lantier (`lantier`) — 6/28, non desservie, 0 impression : pages existantes conservées, **À VALIDER AVANT EXPANSION** (22 combinaisons)
- Notre-Dame-du-Sacré-Coeur-d'Issoudun (`notre-dame-du-sacre-coeur-d-issoudun`) — 6/28, non desservie, 0 impression : pages existantes conservées, **À VALIDER AVANT EXPANSION** (22 combinaisons)
- Saint-Calixte-de-Kilkenny (`saint-calixte-de-kilkenny`) — 6/28, non desservie, 0 impression : pages existantes conservées, **À VALIDER AVANT EXPANSION** (22 combinaisons)
- Saint-Elzéar (`saint-elzear`) — 6/28, non desservie, 0 impression : pages existantes conservées, **À VALIDER AVANT EXPANSION** (22 combinaisons)
- Saint-Henri (`saint-henri`) — 6/28, non desservie, 0 impression : pages existantes conservées, **À VALIDER AVANT EXPANSION** (22 combinaisons)
- Saint-Jules-de-Beauce (`saint-jules-de-beauce`) — 6/28, non desservie, 0 impression : pages existantes conservées, **À VALIDER AVANT EXPANSION** (22 combinaisons)
- Saint-Simon-les-Mines (`saint-simon-les-mines`) — 6/28, non desservie, 0 impression : pages existantes conservées, **À VALIDER AVANT EXPANSION** (22 combinaisons)
- Saint-Théophile (`saint-theophile`) — 6/28, non desservie, 0 impression : pages existantes conservées, **À VALIDER AVANT EXPANSION** (22 combinaisons)
- Saint-Édouard-de-Lotbinière (`saint-edouard-de-lotbiniere`) — 6/28, non desservie, 0 impression : pages existantes conservées, **À VALIDER AVANT EXPANSION** (22 combinaisons)
- Sainte-Hénédine (`sainte-henedine`) — 6/28, non desservie, 0 impression : pages existantes conservées, **À VALIDER AVANT EXPANSION** (22 combinaisons)
- East Broughton (`east-broughton`) — 5/28, non desservie, 0 impression : pages existantes conservées, **À VALIDER AVANT EXPANSION** (23 combinaisons)
- Grand-Saint-Esprit (`grand-saint-esprit`) — 5/28, non desservie, 0 impression : pages existantes conservées, **À VALIDER AVANT EXPANSION** (23 combinaisons)
- Notre-Dame-des-Monts (`notre-dame-des-monts`) — 5/28, non desservie, 0 impression : pages existantes conservées, **À VALIDER AVANT EXPANSION** (23 combinaisons)
- Notre-Dame-du-Mont-Carmel (`notre-dame-du-mont-carmel`) — 5/28, non desservie, 0 impression : pages existantes conservées, **À VALIDER AVANT EXPANSION** (23 combinaisons)
- Saguenay (`saguenay`) — 5/28, non desservie, 0 impression : pages existantes conservées, **À VALIDER AVANT EXPANSION** (23 combinaisons)
- Saint-Antoine-de-Tilly (`saint-antoine-de-tilly`) — 5/28, non desservie, 0 impression : pages existantes conservées, **À VALIDER AVANT EXPANSION** (23 combinaisons)
- Saint-Casimir (`saint-casimir`) — 5/28, non desservie, 0 impression : pages existantes conservées, **À VALIDER AVANT EXPANSION** (23 combinaisons)
- Saint-Chrysostome (`saint-chrysostome`) — 5/28, non desservie, 0 impression : pages existantes conservées, **À VALIDER AVANT EXPANSION** (23 combinaisons)
- Saint-François-de-la-Rivière-du-Sud (`saint-francois-de-la-riviere-du-sud`) — 5/28, non desservie, 0 impression : pages existantes conservées, **À VALIDER AVANT EXPANSION** (23 combinaisons)
- Saint-Isidore (`saint-isidore`) — 5/28, non desservie, 0 impression : pages existantes conservées, **À VALIDER AVANT EXPANSION** (23 combinaisons)
- Saint-Narcisse-de-Beaurivage (`saint-narcisse-de-beaurivage`) — 5/28, non desservie, 0 impression : pages existantes conservées, **À VALIDER AVANT EXPANSION** (23 combinaisons)
- Saint-Prosper-de-Champlain (`saint-prosper-de-champlain`) — 5/28, non desservie, 0 impression : pages existantes conservées, **À VALIDER AVANT EXPANSION** (23 combinaisons)
- Saint-Tite-des-Caps (`saint-tite-des-caps`) — 5/28, non desservie, 0 impression : pages existantes conservées, **À VALIDER AVANT EXPANSION** (23 combinaisons)
- Sainte-Marguerite (`sainte-marguerite`) — 5/28, non desservie, 0 impression : pages existantes conservées, **À VALIDER AVANT EXPANSION** (23 combinaisons)
- Sainte-Marie (`sainte-marie`) — 5/28, non desservie, 0 impression : pages existantes conservées, **À VALIDER AVANT EXPANSION** (23 combinaisons)
- Sainte-Sophie-de-Lévrard (`sainte-sophie-de-levrard`) — 5/28, non desservie, 0 impression : pages existantes conservées, **À VALIDER AVANT EXPANSION** (23 combinaisons)
- Grenville-sur-la-Rouge (`grenville-sur-la-rouge`) — 4/28, non desservie, 0 impression : pages existantes conservées, **À VALIDER AVANT EXPANSION** (24 combinaisons)
- Leclercville (`leclercville`) — 4/28, non desservie, 0 impression : pages existantes conservées, **À VALIDER AVANT EXPANSION** (24 combinaisons)
- Rawdon (`rawdon`) — 4/28, non desservie, 0 impression : pages existantes conservées, **À VALIDER AVANT EXPANSION** (24 combinaisons)
- Saint-Alfred (`saint-alfred`) — 4/28, non desservie, 0 impression : pages existantes conservées, **À VALIDER AVANT EXPANSION** (24 combinaisons)
- Saint-Damase-de-l'Islet (`saint-damase-de-l-islet`) — 4/28, non desservie, 0 impression : pages existantes conservées, **À VALIDER AVANT EXPANSION** (24 combinaisons)
- Saint-François-Xavier-de-Brompton (`saint-francois-xavier-de-brompton`) — 4/28, non desservie, 0 impression : pages existantes conservées, **À VALIDER AVANT EXPANSION** (24 combinaisons)
- Saint-Gabriel (`saint-gabriel`) — 4/28, non desservie, 0 impression : pages existantes conservées, **À VALIDER AVANT EXPANSION** (24 combinaisons)
- Saint-Hilarion (`saint-hilarion`) — 4/28, non desservie, 0 impression : pages existantes conservées, **À VALIDER AVANT EXPANSION** (24 combinaisons)
- Saint-Janvier-de-Joly (`saint-janvier-de-joly`) — 4/28, non desservie, 0 impression : pages existantes conservées, **À VALIDER AVANT EXPANSION** (24 combinaisons)
- Saint-Joachim (`saint-joachim`) — 4/28, non desservie, 0 impression : pages existantes conservées, **À VALIDER AVANT EXPANSION** (24 combinaisons)
- Saint-Philémon (`saint-philemon`) — 4/28, non desservie, 0 impression : pages existantes conservées, **À VALIDER AVANT EXPANSION** (24 combinaisons)
- Scott (`scott`) — 4/28, non desservie, 0 impression : pages existantes conservées, **À VALIDER AVANT EXPANSION** (24 combinaisons)
- Trois-Rivières (`trois-rivieres`) — 4/28, non desservie, 0 impression : pages existantes conservées, **À VALIDER AVANT EXPANSION** (24 combinaisons)
- Beauceville (`beauceville`) — 3/28, non desservie, 0 impression : pages existantes conservées, **À VALIDER AVANT EXPANSION** (25 combinaisons)
- Berthierville (`berthierville`) — 3/28, non desservie, 0 impression : pages existantes conservées, **À VALIDER AVANT EXPANSION** (25 combinaisons)
- Blainville (`blainville`) — 3/28, non desservie, 0 impression : pages existantes conservées, **À VALIDER AVANT EXPANSION** (25 combinaisons)
- Chertsey (`chertsey`) — 3/28, non desservie, 0 impression : pages existantes conservées, **À VALIDER AVANT EXPANSION** (25 combinaisons)
- Disraeli (`disraeli`) — 3/28, non desservie, 0 impression : pages existantes conservées, **À VALIDER AVANT EXPANSION** (25 combinaisons)
- Lac-Etchemin (`lac-etchemin`) — 3/28, non desservie, 0 impression : pages existantes conservées, **À VALIDER AVANT EXPANSION** (25 combinaisons)
- Laval (`laval`) — 3/28, non desservie, 0 impression : pages existantes conservées, **À VALIDER AVANT EXPANSION** (25 combinaisons)
- Parisville (`parisville`) — 3/28, non desservie, 0 impression : pages existantes conservées, **À VALIDER AVANT EXPANSION** (25 combinaisons)
- Saint-Benoît-Labre (`saint-benoit-labre`) — 3/28, non desservie, 0 impression : pages existantes conservées, **À VALIDER AVANT EXPANSION** (25 combinaisons)
- Saint-Colomban (`saint-colomban`) — 3/28, non desservie, 0 impression : pages existantes conservées, **À VALIDER AVANT EXPANSION** (25 combinaisons)
- Saint-Fabien-de-Panet (`saint-fabien-de-panet`) — 3/28, non desservie, 0 impression : pages existantes conservées, **À VALIDER AVANT EXPANSION** (25 combinaisons)
- Saint-Félix-de-Valois (`saint-felix-de-valois`) — 3/28, non desservie, 0 impression : pages existantes conservées, **À VALIDER AVANT EXPANSION** (25 combinaisons)
- Saint-Gervais (`saint-gervais`) — 3/28, non desservie, 0 impression : pages existantes conservées, **À VALIDER AVANT EXPANSION** (25 combinaisons)
- Saint-Jérôme (`saint-jerome`) — 3/28, non desservie, 0 impression : pages existantes conservées, **À VALIDER AVANT EXPANSION** (25 combinaisons)
- Saint-Michel-de-Bellechasse (`saint-michel-de-bellechasse`) — 3/28, non desservie, 0 impression : pages existantes conservées, **À VALIDER AVANT EXPANSION** (25 combinaisons)
- Saint-Nazaire-de-Dorchester (`saint-nazaire-de-dorchester`) — 3/28, non desservie, 0 impression : pages existantes conservées, **À VALIDER AVANT EXPANSION** (25 combinaisons)
- Saint-Pierre-de-Broughton (`saint-pierre-de-broughton`) — 3/28, non desservie, 0 impression : pages existantes conservées, **À VALIDER AVANT EXPANSION** (25 combinaisons)
- Saint-René (`saint-rene`) — 3/28, non desservie, 0 impression : pages existantes conservées, **À VALIDER AVANT EXPANSION** (25 combinaisons)
- Saint-Étienne-des-Grès (`saint-etienne-des-gres`) — 3/28, non desservie, 0 impression : pages existantes conservées, **À VALIDER AVANT EXPANSION** (25 combinaisons)
- Sainte-Christine-d'Auvergne (`sainte-christine-d-auvergne`) — 3/28, non desservie, 0 impression : pages existantes conservées, **À VALIDER AVANT EXPANSION** (25 combinaisons)
- Sainte-Julienne (`sainte-julienne`) — 3/28, non desservie, 0 impression : pages existantes conservées, **À VALIDER AVANT EXPANSION** (25 combinaisons)
- Shawinigan (`shawinigan`) — 3/28, non desservie, 0 impression : pages existantes conservées, **À VALIDER AVANT EXPANSION** (25 combinaisons)
- Stratford (`stratford`) — 3/28, non desservie, 0 impression : pages existantes conservées, **À VALIDER AVANT EXPANSION** (25 combinaisons)
- Villeroy (`villeroy`) — 3/28, non desservie, 0 impression : pages existantes conservées, **À VALIDER AVANT EXPANSION** (25 combinaisons)
- Warwick (`warwick`) — 3/28, non desservie, 0 impression : pages existantes conservées, **À VALIDER AVANT EXPANSION** (25 combinaisons)
- Bois-des-Filion (`bois-des-filion`) — 2/28, non desservie, 0 impression : pages existantes conservées, **À VALIDER AVANT EXPANSION** (26 combinaisons)
- Bécancour (`becancour`) — 2/28, non desservie, 0 impression : pages existantes conservées, **À VALIDER AVANT EXPANSION** (26 combinaisons)
- Contrecoeur (`contrecoeur`) — 2/28, non desservie, 0 impression : pages existantes conservées, **À VALIDER AVANT EXPANSION** (26 combinaisons)
- Cowansville (`cowansville`) — 2/28, non desservie, 0 impression : pages existantes conservées, **À VALIDER AVANT EXPANSION** (26 combinaisons)
- Deschambault (`deschambault`) — 2/28, non desservie, 0 impression : pages existantes conservées, **À VALIDER AVANT EXPANSION** (26 combinaisons)
- Gore (`gore`) — 2/28, non desservie, 0 impression : pages existantes conservées, **À VALIDER AVANT EXPANSION** (26 combinaisons)
- Honfleur (`honfleur`) — 2/28, non desservie, 0 impression : pages existantes conservées, **À VALIDER AVANT EXPANSION** (26 combinaisons)
- Inverness (`inverness`) — 2/28, non desservie, 0 impression : pages existantes conservées, **À VALIDER AVANT EXPANSION** (26 combinaisons)
- Irlande (`irlande`) — 2/28, non desservie, 0 impression : pages existantes conservées, **À VALIDER AVANT EXPANSION** (26 combinaisons)
- L'Islet (`l-islet`) — 2/28, non desservie, 0 impression : pages existantes conservées, **À VALIDER AVANT EXPANSION** (26 combinaisons)
- Mandeville (`mandeville`) — 2/28, non desservie, 0 impression : pages existantes conservées, **À VALIDER AVANT EXPANSION** (26 combinaisons)
- Montmagny (`montmagny`) — 2/28, non desservie, 0 impression : pages existantes conservées, **À VALIDER AVANT EXPANSION** (26 combinaisons)
- Prévost (`prevost`) — 2/28, non desservie, 0 impression : pages existantes conservées, **À VALIDER AVANT EXPANSION** (26 combinaisons)
- Racine (`racine`) — 2/28, non desservie, 0 impression : pages existantes conservées, **À VALIDER AVANT EXPANSION** (26 combinaisons)
- Saint-Alban (`saint-alban`) — 2/28, non desservie, 0 impression : pages existantes conservées, **À VALIDER AVANT EXPANSION** (26 combinaisons)
- Saint-Alphonse-Rodriguez (`saint-alphonse-rodriguez`) — 2/28, non desservie, 0 impression : pages existantes conservées, **À VALIDER AVANT EXPANSION** (26 combinaisons)
- Saint-Anselme (`saint-anselme`) — 2/28, non desservie, 0 impression : pages existantes conservées, **À VALIDER AVANT EXPANSION** (26 combinaisons)
- Saint-Antoine-Abbé (`saint-antoine-abbe`) — 2/28, non desservie, 0 impression : pages existantes conservées, **À VALIDER AVANT EXPANSION** (26 combinaisons)
- Saint-Barthélemy (`saint-barthelemy`) — 2/28, non desservie, 0 impression : pages existantes conservées, **À VALIDER AVANT EXPANSION** (26 combinaisons)
- Saint-Calixte (`saint-calixte`) — 2/28, non desservie, 0 impression : pages existantes conservées, **À VALIDER AVANT EXPANSION** (26 combinaisons)
- Saint-François-du-Lac (`saint-francois-du-lac`) — 2/28, non desservie, 0 impression : pages existantes conservées, **À VALIDER AVANT EXPANSION** (26 combinaisons)
- Saint-Gabriel-de-Brandon (`saint-gabriel-de-brandon`) — 2/28, non desservie, 0 impression : pages existantes conservées, **À VALIDER AVANT EXPANSION** (26 combinaisons)
- Saint-Georges (`saint-georges`) — 2/28, non desservie, 0 impression : pages existantes conservées, **À VALIDER AVANT EXPANSION** (26 combinaisons)
- Saint-Georges-de-Windsor (`saint-georges-de-windsor`) — 2/28, non desservie, 0 impression : pages existantes conservées, **À VALIDER AVANT EXPANSION** (26 combinaisons)
- Saint-Lazare-de-Bellechasse (`saint-lazare-de-bellechasse`) — 2/28, non desservie, 0 impression : pages existantes conservées, **À VALIDER AVANT EXPANSION** (26 combinaisons)
- Saint-Luc-de-Bellechasse (`saint-luc-de-bellechasse`) — 2/28, non desservie, 0 impression : pages existantes conservées, **À VALIDER AVANT EXPANSION** (26 combinaisons)
- Saint-Magloire (`saint-magloire`) — 2/28, non desservie, 0 impression : pages existantes conservées, **À VALIDER AVANT EXPANSION** (26 combinaisons)
- Saint-Maurice (`saint-maurice`) — 2/28, non desservie, 0 impression : pages existantes conservées, **À VALIDER AVANT EXPANSION** (26 combinaisons)
- Saint-Odilon-de-Cranbourne (`saint-odilon-de-cranbourne`) — 2/28, non desservie, 0 impression : pages existantes conservées, **À VALIDER AVANT EXPANSION** (26 combinaisons)
- Saint-Philibert (`saint-philibert`) — 2/28, non desservie, 0 impression : pages existantes conservées, **À VALIDER AVANT EXPANSION** (26 combinaisons)
- Saint-Placide (`saint-placide`) — 2/28, non desservie, 0 impression : pages existantes conservées, **À VALIDER AVANT EXPANSION** (26 combinaisons)
- Saint-Raphaël (`saint-raphael`) — 2/28, non desservie, 0 impression : pages existantes conservées, **À VALIDER AVANT EXPANSION** (26 combinaisons)
- Sainte-Béatrix (`sainte-beatrix`) — 2/28, non desservie, 0 impression : pages existantes conservées, **À VALIDER AVANT EXPANSION** (26 combinaisons)
- Sainte-Claire (`sainte-claire`) — 2/28, non desservie, 0 impression : pages existantes conservées, **À VALIDER AVANT EXPANSION** (26 combinaisons)
- Sainte-Croix (`sainte-croix`) — 2/28, non desservie, 0 impression : pages existantes conservées, **À VALIDER AVANT EXPANSION** (26 combinaisons)
- Sainte-Pétronille (`sainte-petronille`) — 2/28, non desservie, 0 impression : pages existantes conservées, **À VALIDER AVANT EXPANSION** (26 combinaisons)
- Sainte-Sophie (`sainte-sophie`) — 2/28, non desservie, 0 impression : pages existantes conservées, **À VALIDER AVANT EXPANSION** (26 combinaisons)
- Val-Alain (`val-alain`) — 2/28, non desservie, 0 impression : pages existantes conservées, **À VALIDER AVANT EXPANSION** (26 combinaisons)
- Val-David (`val-david`) — 2/28, non desservie, 0 impression : pages existantes conservées, **À VALIDER AVANT EXPANSION** (26 combinaisons)
- Victoriaville (`victoriaville`) — 2/28, non desservie, 0 impression : pages existantes conservées, **À VALIDER AVANT EXPANSION** (26 combinaisons)
- Weedon (`weedon`) — 2/28, non desservie, 0 impression : pages existantes conservées, **À VALIDER AVANT EXPANSION** (26 combinaisons)
- Wentworth-Nord (`wentworth-nord`) — 2/28, non desservie, 0 impression : pages existantes conservées, **À VALIDER AVANT EXPANSION** (26 combinaisons)
- Windsor (`windsor`) — 2/28, non desservie, 0 impression : pages existantes conservées, **À VALIDER AVANT EXPANSION** (26 combinaisons)
- Brossard (`brossard`) — 1/28, non desservie, 0 impression : pages existantes conservées, **À VALIDER AVANT EXPANSION** (27 combinaisons)
- Mont-Tremblant (`mont-tremblant`) — 1/28, non desservie, 0 impression : pages existantes conservées, **À VALIDER AVANT EXPANSION** (27 combinaisons)

Combinaisons à valider : **3180**.

## 10. Nombre total de pages potentiellement manquantes

- Classe B : 0 pages (0 villes)
- Classe C : 0 pages (0 villes)
- Classe D : 0 pages (0 villes)
- Classe E : 3180 pages (132 villes)
- **Total : 3180** (dont 0 hors villes à valider).

## 11. Recommandation de génération par priorité (aucune génération faite)

1. **Priorité 1 — compléter B et C desservies ou avec impressions**, en commençant par les familles les mieux performantes ailleurs (dompe, transport-vrac, sable, gravier). Ne jamais toucher aux pages PROTÉGER.
2. **Priorité 2 — avant toute création en paires sensibles**, différencier l'intention : matériau = information/prix/usages, livraison-matériau = commande/transport; dompe = déposer ses matériaux, point de dépôt = recherche d'un site accepté. Traiter d'abord les cannibalisations CONFIRMÉES par amélioration de contenu, pas par création.
3. **Priorité 3 — classe D avec preuve** : générer d'abord page ville (si absente), dompe, transport-vrac, puis matériaux principaux.
4. **Priorité 4 — classe E** : valider la pertinence (desserte réelle, demandes, impressions) avant tout ajout; ne pas expandre automatiquement.
5. Réévaluer cette matrice après la prochaine extraction Search Console de 90 jours.

---
Données modifiées : NON · Pages créées : NON · Pages supprimées : NON · URLs modifiées : NON · SEO modifié : NON · Publication : NON