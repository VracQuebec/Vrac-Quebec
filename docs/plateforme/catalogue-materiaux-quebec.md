# Catalogue des matériaux — Vrac Québec (PROPOSITION FINALE, aucune donnée modifiée)

Statut : **proposition**. Catalogue actuel en base = 15 entrées. Aucune migration exécutée, `submission_accepted_materials` vide.

## A. Nombre exact de matériaux canoniques proposés : **45**

TERRE 9 · SABLE 6 · GRANULATS 8 · ROCHE 6 · BÉTON/MAÇONNERIE 5 · ASPHALTE 3 · ORGANIQUE 7 · INCONNU 1.

## B. Liste complète (45)

Légende colonnes : Mat. = matériau réel · Gran. = granulométrie applicable · Hist. = présent dans l'historique / occurrences · Rég. = niveau réglementaire · Vis. = visible directement au client · Qual. = nécessite qualification.

### Famille TERRE ET SOLS (sous-familles : sol naturel, sol travaillé, sol fin)

| # | slug | Nom canonique | Nom client | Sous-famille | Mat. | Gran. | Conditions applicables | Alias connus | Hist. | Occ. | Rég. | Vis. | Qual. |
|--|--|--|--|--|--|--|--|--|--|--|--|--|--|
|1|`terre`|Terre|Terre|sol naturel|OUI|NON|propre, sec, glaise, souches, caractérisation|terre, Terre, There(?)|OUI|332|validation_requise (caractérisation possible)|OUI|NON|
|2|`terre-melangee`|Terre mélangée|Terre mélangée|sol travaillé|OUI|NON|glaise, béton, asphalte, organique, mélange|terre mélangé, terre melangé, terre mélamgé, terre mélanger, Terre mélangé|OUI|380|validation_requise|OUI|NON|
|3|`terre-tamisee`|Terre tamisée|Terre tamisée|sol travaillé|OUI|NON|propre, sec|terre tamisee|OUI|1|standard|OUI|NON|
|4|`terre-vegetale`|Terre végétale|Terre végétale (top soil)|sol travaillé|OUI|NON|organique, racines|top soil, terre à jardin|NON|0|standard|OUI|NON|
|5|`terre-noire`|Terre noire|Terre noire|sol travaillé|OUI|NON|organique|—|NON|0|standard|NON (mode détaillé)|NON|
|6|`terre-remplissage`|Terre de remplissage|Terre de remplissage|sol travaillé|OUI|NON|propre, mélange, caractérisation|remblai de terre, terre de remblai|NON (texte libre)|0|validation_requise|OUI|NON|
|7|`sol-excave`|Sol excavé|Sol d'excavation|sol naturel|OUI|NON|caractérisation exigée|sol d'excavation|NON|0|documentation_requise|NON|NON|
|8|`argile-glaise`|Argile / glaise|Argile (glaise)|sol fin|OUI|NON|glaise, humidité|glaise, argile|NON (en condition)|0|standard|OUI|NON|
|9|`silt-limon`|Silt / limon|Limon|sol fin|OUI|NON|humidité|silt, limon|NON|0|standard|NON|NON|

Décisions d'analyse TERRE : « Sol naturel » = ALIAS de `terre`. « Sol sableux » / « Sol argileux » = **composition** (attribut), pas matériaux. « Terre avec pierres / roche / matière organique » = **composites** (terre + pierre/roche/organique), pas matériaux. « Terre propre » = **condition**.

### Famille SABLE (sous-familles : naturel, traité, recyclé)

| # | slug | Nom canonique | Nom client | Sous-famille | Mat. | Gran. | Conditions | Alias | Hist. | Occ. | Rég. | Vis. | Qual. |
|--|--|--|--|--|--|--|--|--|--|--|--|--|--|
|10|`sable`|Sable|Sable|naturel|OUI|OUI (facultatif)|propre, sec|sable, Sable, sable naturel, sable de remplissage|OUI|275|standard|OUI|NON|
|11|`sable-compaction`|Sable de compaction|Sable de compaction|traité|OUI|OUI|—|sable compactage|NON|0|standard|NON|NON|
|12|`sable-beton`|Sable à béton|Sable à béton|traité|OUI|OUI|—|sable béton|NON|0|standard|NON|NON|
|13|`sable-filtrant`|Sable filtrant|Sable filtrant / drainage|traité|OUI|OUI|—|sable de drainage|NON|0|standard|NON|NON|
|14|`sable-tamise`|Sable tamisé|Sable tamisé|traité|OUI|OUI|—|—|NON|0|standard|NON|NON|
|15|`sable-recycle`|Sable recyclé|Sable recyclé|recyclé|OUI|OUI|mélange|—|NON|0|validation_requise|NON|NON|

Décisions SABLE : « Sable naturel » et « Sable de remplissage » = ALIAS de `sable`. « Sable de drainage » = ALIAS de `sable-filtrant`. « Sable avec gravier » = COMPOSITE.

### Famille GRANULATS — pierre et gravier (sous-familles : naturel, concassé, fin, recyclé)

| # | slug | Nom canonique | Nom client | Sous-famille | Mat. | Gran. | Conditions | Alias | Hist. | Occ. | Rég. | Vis. | Qual. |
|--|--|--|--|--|--|--|--|--|--|--|--|--|--|
|16|`gravier`|Gravier|Gravier|naturel|OUI|OUI|—|gravier, gravelle|OUI|149|standard|OUI|NON|
|17|`pierre`|Pierre|Pierre|naturel|OUI|OUI|—|pierre|OUI|11|standard|OUI|NON|
|18|`pierre-concassee`|Pierre concassée|Pierre concassée|concassé|OUI|**OUI (obligatoire si connue)**|—|Pierre concassée 0-3/4 (+gran. 0-3/4), 0-3/4, 0 3/4, zéro trois-quarts|OUI|132|standard|OUI|NON|
|19|`pierre-nette`|Pierre nette|Pierre nette|concassé|OUI|**OUI**|—|Pierre concassée 3/4 net (+gran. 3/4 net), 3/4 net, pierre nette 3/4|OUI|112|standard|OUI|NON|
|20|`poussiere-de-pierre`|Poussière de pierre|Poussière de pierre|fin|OUI|NON|sec|poussiere, poussière|OUI|95|standard|OUI|NON|
|21|`criblure`|Criblure|Criblure (screening)|fin|OUI|NON|—|screening, criblures|NON|0|standard|NON|NON|
|22|`granulat-naturel`|Granulat naturel|Granulat|naturel|OUI|OUI|—|granulat|NON|0|standard|NON|NON|
|23|`granulat-recycle`|Granulat recyclé|Granulat recyclé|recyclé|OUI|OUI|mélange, béton, asphalte|granulats recyclés|NON|0|validation_requise|NON|NON|

Note : `MG-20`, `MG-56` **non créés** — aucune équivalence technique tant qu'elle n'est pas validée par référentiel interne.

### Famille ROCHE / ENROCHEMENT

| # | slug | Nom canonique | Nom client | Sous-famille | Mat. | Gran. | Conditions | Alias | Hist. | Occ. | Rég. | Vis. | Qual. |
|--|--|--|--|--|--|--|--|--|--|--|--|--|--|
|24|`roche`|Roche|Roche / roches|naturel|OUI|NON (dim. min/max)|dimension max|roche, roches, Roches, Roc|OUI|92|standard|OUI|NON|
|25|`roche-dynamitee`|Roche dynamitée|Roche dynamitée|naturel|OUI|NON (dim.)|dimension max|roc dynamité|NON|0|standard|NON|NON|
|26|`roc-excave`|Roc excavé|Roc excavé|naturel|OUI|NON (dim.)|dimension max|roche excavée|NON|0|standard|NON|NON|
|27|`roches-concassees`|Roches concassées|Roches concassées|concassé|OUI|OUI|—|roche-concassee, roches concassée, Roches concasées, roches concasées, roche concassée|OUI|78|standard|OUI|NON|
|28|`enrochement`|Enrochement|Enrochement|gros calibre|OUI|NON (dim. min/max)|dimension min/max|pierre d'enrochement|NON|0|standard|NON|NON|
|29|`blocs-de-roche`|Blocs de roche|Gros blocs / grosses pierres|gros calibre|OUI|NON (dim.)|dimension max, gros blocs|blocs, grosses pierres|NON|0|standard|OUI (mode simple : « gros blocs »)|NON|

### Famille BÉTON / MAÇONNERIE (recyclé construction)

| # | slug | Nom canonique | Nom client | Sous-famille | Mat. | Gran. | Conditions | Alias | Hist. | Occ. | Rég. | Vis. | Qual. |
|--|--|--|--|--|--|--|--|--|--|--|--|--|--|
|30|`beton`|Béton|Béton|béton|OUI|NON|armature, dimension max|béton, Béton, beton|OUI|29|validation_requise|OUI|NON|
|31|`beton-concasse`|Béton concassé|Béton concassé|béton|OUI|OUI|armature|béton recyclé, béton broyé|NON|0|validation_requise|NON|NON|
|32|`brique`|Brique|Brique|maçonnerie|OUI|NON|—|briques|NON|0|validation_requise|NON|NON|
|33|`brique-concassee`|Brique concassée|Brique concassée|maçonnerie|OUI|OUI|—|—|NON|0|validation_requise|NON|NON|
|34|`maconnerie`|Maçonnerie|Maçonnerie / blocs de béton|maçonnerie|OUI|NON|armature|bloc de béton, blocs béton|NON|0|validation_requise|NON|NON|

Décisions : « Béton recyclé » = ALIAS de `beton-concasse`. « Béton avec/sans armature » = **CONDITION** (`armature` oui/non/inconnu). « Bloc de béton concassé » = `maconnerie` + condition concassé. « Mélange béton/brique » et « mélange béton/asphalte » = **COMPOSITES**.

### Famille ASPHALTE

| # | slug | Nom canonique | Nom client | Sous-famille | Mat. | Gran. | Conditions | Alias | Hist. | Occ. | Rég. | Vis. | Qual. |
|--|--|--|--|--|--|--|--|--|--|--|--|--|--|
|35|`asphalte`|Asphalte|Asphalte|asphalte|OUI|NON|dimension max|asphalte, Asphalte, asphaltes|OUI|41|validation_requise|OUI|NON|
|36|`asphalte-concasse`|Asphalte concassé|Asphalte concassé|asphalte|OUI|OUI|—|asphalte recyclé, asphalte broyé|NON|0|validation_requise|NON|NON|
|37|`planage-asphalte`|Planage d'asphalte|Planage / fraisat|asphalte|OUI|OUI|—|fraisat, fraisage, planage|NON (texte libre)|0|validation_requise|NON|NON|

Décision : « Asphalte recyclé » = ALIAS de `asphalte-concasse`. « Mélange asphalte/granulat » = COMPOSITE.

### Famille VÉGÉTAUX / ORGANIQUES

| # | slug | Nom canonique | Nom client | Sous-famille | Mat. | Gran. | Conditions | Alias | Hist. | Occ. | Rég. | Vis. | Qual. |
|--|--|--|--|--|--|--|--|--|--|--|--|--|--|
|38|`souches`|Souches|Souches|bois|OUI|NON|souches permises, dimension max|souche|OUI|5|validation_requise|OUI|NON|
|39|`branches`|Branches|Branches|bois|OUI|NON|—|branchage|NON|0|validation_requise|NON|NON|
|40|`bois-non-traite`|Bois naturel non traité|Bois non traité|bois|OUI|NON|—|bois naturel|NON|0|documentation_requise|NON|NON|
|41|`residus-vegetaux`|Résidus végétaux|Résidus végétaux|végétal|OUI|NON|organique|résidus verts|NON|0|validation_requise|NON|NON|
|42|`copeaux-paillis`|Copeaux / paillis|Copeaux, paillis|végétal|OUI|NON|—|paillis, copeaux|NON|0|standard|NON|NON|
|43|`racines`|Racines|Racines|végétal|OUI|NON|—|racine|NON|0|validation_requise|NON|NON|
|44|`matiere-organique`|Matière organique|Matière organique|végétal|OUI|NON|organique|organique|NON|0|documentation_requise|NON|NON|

Ces 7 matières portent un attribut **`destination_types`** (remblai / recyclage / compostage / autre) — champ prévu, **non implémenté** dans cette étape.

### Famille INCONNU

| # | slug | Nom canonique | Nom client | Sous-famille | Mat. | Gran. | Conditions | Alias | Hist. | Occ. | Rég. | Vis. | Qual. |
|--|--|--|--|--|--|--|--|--|--|--|--|--|--|
|45|`materiau-non-identifie`|Matériau non identifié|Je ne sais pas exactement|—|NON|NON|toutes|Autre, autre, remplissage, mélangé, ne-sais-pas, Je ne suis pas certain, Tout ce qu'on a en option, There|OUI|58|validation_requise|OUI|**OUI**|

## C. Familles et sous-familles

7 familles internes (TERRE, SABLE, GRANULATS, ROCHE, BETON_MACONNERIE, ASPHALTE, ORGANIQUE) + INCONNU, regroupées en **7 cartes client** (Béton/maçonnerie + Asphalte fusionnés en « ♻ Béton / asphalte »). Sous-familles listées ci-dessus.

## D. Attributs (jamais des matériaux)

`granulometry_id`, `size_min_mm`, `size_max_mm`, `is_recycled`, `composition_notes`, `environmental_status`, `regulatory_level`, `destination_types`.

## E. Granulométries (table de référence, 12 entrées)

`0-1/4`, `0-3/4`, `0-1`, `0-2 1/2`, `net 1/4`, `net 1/2`, `net 3/4`, `net 1"`, `net 1 1/2`, `net 2"`, `autre`, `inconnue`.
Rétrocompatibilité garantie : « Pierre concassée 0-3/4 » = `pierre-concassee` + `0-3/4`; « Pierre concassée 3/4 net » = `pierre-nette` + `net 3/4`; « Poussière de pierre » = `poussiere-de-pierre` sans granulométrie.

## F. Conditions (17, valeurs oui / non / inconnu)

`propre_exige`, `caracterisation_exigee`, `glaise`, `souches`, `beton`, `asphalte`, `brique`, `armature`, `organique`, `racines`, `melange`, `materiau_sec_exige`, `humidite`, `gros_blocs`, `dimension_max`, `dimension_min`, `autre_restriction`.

## G. Alias

~95 alias proposés (toutes les variantes historiques + variantes d'écriture courantes + termes clients : `top soil`, `gravelle`, `screening`, `fraisat`, `3/4`, `0 3/4`, `zéro trois-quarts`). Chaque alias porte `confidence` et `human_validated`. Aucun alias technique incertain (MG-xx) créé.

## H. Composites

Table `submission_load_components` (ou `load_components`) : une charge = plusieurs composants `(material_id, granulometry_id?, percentage?)`, pourcentage facultatif.
Aucun matériau « Terre et pierre ». Le matching futur exigera : dompe accepte chaque composant **et** condition `melange` ≠ `non`.

## I. Éléments environnementaux

`environmental_status` ∈ `inconnu`, `non_caracterise`, `caracterise`, `autre_statut_reglementaire` + documents, provenance, traçabilité, destination autorisée. **Aucune déduction à partir du nom du matériau.** Strictement séparé de matériau / conditions / documents / destination.

## J. Matières nécessitant une autre destination

`souches`, `branches`, `bois-non-traite`, `residus-vegetaux`, `racines`, `copeaux-paillis`, `matiere-organique` (7). Conservées dans l'écosystème, restreintes via `destination_types` (prévu, non implémenté).

## K. Tableau de classification des éléments évoqués

| Élément | Classe |
|--|--|
| Terre, Terre mélangée, Terre tamisée, Terre végétale, Terre noire, Terre de remplissage, Sol excavé, Argile/glaise, Silt/limon | KEEP (9) |
| Sable, Sable de compaction, Sable à béton, Sable filtrant, Sable tamisé, Sable recyclé | KEEP (6) |
| Gravier, Pierre, Pierre concassée, Pierre nette, Poussière de pierre, Criblure, Granulat naturel, Granulat recyclé | KEEP (8) |
| Roche, Roche dynamitée, Roc excavé, Roches concassées, Enrochement, Blocs de roche | KEEP (6) |
| Béton, Béton concassé, Brique, Brique concassée, Maçonnerie | KEEP (5) |
| Asphalte, Asphalte concassé, Planage d'asphalte | KEEP (3) |
| Souches, Branches, Bois non traité, Résidus végétaux, Racines, Copeaux/paillis, Matière organique | KEEP + OTHER_DESTINATION (7) |
| Matériau non identifié | KEEP (1) |
| Sol naturel, Sable naturel, Sable de remplissage, Sable de drainage, Béton recyclé, Asphalte recyclé, Fraisat, Pierre d'enrochement, Grosses pierres, Roc, top soil, gravelle, screening | ALIAS (13) |
| Sol sableux, Sol argileux, granulométries, dimensions min/max, origine recyclée | ATTRIBUTE (5) |
| Terre propre, Béton avec/sans armature, sans glaise, sans souches, sec, humide, maximum 8 pouces, caractérisation exigée | CONDITION (8) |
| Terre + pierre, Terre + sable, Sable + gravier, Pierre + roche, Béton + asphalte, Mélange béton/brique, Mélange asphalte/granulat, Terre avec pierres/roche/organique/végétaux | COMPOSITE (11) |
| Bloc de béton concassé (= maçonnerie + concassé), « Roches » vs « Roche » (doublon de casse) | REMOVE / fusion en alias (2) |

## L. Couverture des données historiques (simulation, aucune écriture)

| Mesure | Absolu | % |
|--|--|--|
| Mentions matériaux historiques | 1 789 | 100 % |
| Classables automatiquement avec certitude | 1 731 | **96,8 %** |
| Nécessitant validation humaine (Autre, remplissage, ne-sais-pas, mélangé, There, etc.) | 58 | **3,2 %** |
| Sans correspondance possible | 0 | **0 %** |
| Valeurs distinctes historiques couvertes | 44/44 | 100 % |
| Demandes couvertes par ≥1 matériau | 530/556 | 95,3 % |
| Demandes en file de qualification | 26/556 | 4,7 % |
| Suggestions texte libre → validation humaine | 98 | 100 % (jamais automatiques) |
| Conditions détectées → table conditions | 63 | 100 % |

Détail des 45 avec occurrences : 14 matériaux ont un historique (terre 332, terre mélangée 380, terre tamisée 1, sable 275, gravier 149, pierre concassée 132, pierre nette 112, poussière 95, pierre 11, roche 92, roches concassées 78, béton 29, asphalte 41, souches 5) + 58 mentions non identifiées; 31 matériaux sont nouveaux (occurrence 0) et servent l'extensibilité future.

## M. Maquette MODE SIMPLE

```text
QUE POUVEZ-VOUS RECEVOIR ?   (plusieurs choix possibles)
[ 🌱 Terre ]  [ 🏖 Sable ]  [ 🪨 Pierre / gravier ]  [ ⛰ Roche ]
[ ♻ Béton / asphalte ]  [ 🌳 Végétaux ]  [ ❓ Autre ]

→  « Voulez-vous préciser ? »   (facultatif, sinon on passe)
   Pierre / gravier :  ○ Peu importe  ○ Pierre concassée  ○ Pierre nette
                       ○ Gravier  ○ Poussière de pierre  ○ Autre
   (si Pierre concassée) Calibre ? ○ Peu importe ○ 0-3/4 ○ 0-2 1/2 ○ Autre

→  « Avez-vous des restrictions ? »
   Glaise        [Accepte] [Refuse] [Peu importe]
   Béton         [Accepte] [Refuse] [Peu importe]
   Asphalte      [Accepte] [Refuse] [Peu importe]
   Souches       [Accepte] [Refuse] [Peu importe]
   Matériel humide  [Accepte] [Refuse] [Peu importe]
   Gros blocs       [Accepte] [Refuse] [Peu importe]
   [ + Ajouter une restriction ]

→  « Pouvez-vous aussi accepter… ? »  (familles non cochées, rien de pré-coché)
```
« Peu importe » n'écrit jamais ACCEPTÉ pour tous : il écrit `inconnu`.

## N. Maquette MODE DÉTAILLÉ (entrepreneur, répartiteur, admin)

```text
[ Rechercher un matériau...  « 3/4 », « terre melange », « planage » ]

TERRE ET SOLS              Terre · Terre mélangée · Terre tamisée · Terre végétale
                           Terre noire · Terre de remplissage · Sol excavé
                           Argile/glaise · Silt/limon
SABLE                      6 matériaux
PIERRE ET GRAVIER          8 matériaux  + granulométrie  + % du chargement
ROCHE                      6 matériaux  + dimension min/max
BÉTON / MAÇONNERIE         5 matériaux  + armature oui/non/inconnu
ASPHALTE                   3 matériaux
VÉGÉTAUX                   7 matériaux  + destination compatible
INCONNU                    Décrire le matériau (+ photo) → file de qualification

Chargement (composite) :   Terre 70 %  ·  Pierre concassée 0-3/4 30 %
Par matériau :             ACCEPTÉ / REFUSÉ / INCONNU
Environnement :            inconnu · non caractérisé · caractérisé · autre statut
```
Même taxonomie, aucune duplication. Les 4 usages (propriétaire, entrepreneur, répartiteur, matching) lisent le même catalogue.

## O. Changements exacts au schéma déjà créé (tous additifs)

1. `material_catalog` : + `subfamily`, `display_name`, `abbreviation`, `legacy_key`, `parent_slug`, `regulatory_level`, `search_terms`, `destination_types`, `requires_qualification`, `client_visible`.
2. Nouvelle table `material_granulometries` (12 lignes de référence).
3. `material_aliases` : + `granulometry_id`.
4. `submission_accepted_materials` : + `granulometry_id`, `size_min_mm`, `size_max_mm`, `percentage` (facultatif). Stance `accepted/refused/unknown` déjà présente — inchangée.
5. `submission_material_conditions` : + `regulatory_level`, élargissement de la liste de `condition_key` à 17 valeurs.
6. `submission_environmental_info` : + `environmental_status` contrôlé (4 valeurs) + `documents` déjà présent.
7. Nouvelle fonction de recherche tolérante `material_search(text)` retournant des suggestions (jamais une compatibilité).
8. Aucune suppression, aucun renommage, aucune colonne historique touchée.
