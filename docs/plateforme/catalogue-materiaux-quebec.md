# Catalogue des matériaux — Vrac Québec (PROPOSITION, aucune donnée modifiée)

État actuel : catalogue de 15 entrées (`material_catalog`), 30 alias, termes ambigus, tables de relations **vides**.
Ce document est une proposition d'architecture. Aucune migration n'a été exécutée, `submission_accepted_materials` reste vide.

## 1. Arborescence proposée (3 niveaux + attributs)

```text
FAMILLE (visible UX)        SOUS-FAMILLE (écran 2)        ATTRIBUTS (jamais des matériaux)
Terre et sols               terre, terre mélangée,        granulométrie (n/a)
                            terre végétale, terre         qualité environnementale
                            tamisée, terre de             conditions (sans glaise, sec…)
                            remplissage, argile/glaise,
                            silt/limon, sol excavé
Sable                       sable, sable de compaction,   granulométrie optionnelle
                            sable à béton, sable
                            filtrant, sable tamisé,
                            sable recyclé
Pierre et gravier           gravier, pierre concassée,    granulométrie OBLIGATOIRE-optionnelle
                            pierre nette, poussière de    (0-1/4, 0-3/4, 0-2 1/2, 1/4, 1/2,
                            pierre, criblure,             3/4, 1", 1 1/2, 2", autre)
                            pierre de drainage
Roche / enrochement         roche, roche dynamitée,       dimension min/max (attribut)
                            roc excavé, roches
                            concassées, enrochement,
                            blocs de roche
Matériaux recyclés          béton, béton concassé,        origine recyclée (attribut)
                            asphalte, planage/fraisat,    compatibilité EXPLICITE requise
                            brique, granulat recyclé,
                            mélange béton/asphalte
Végétaux / organiques       souches, branches, bois       destination restreinte
                            non traité, résidus
                            végétaux, paillis,
                            terre avec racines
Autre / Je ne sais pas      description libre + photo     → file de qualification
```

Principe : **matériau ≠ granulométrie ≠ condition ≠ qualité environnementale**. On ne multiplie pas les matériaux canoniques par dimension.

## 2. Catalogue canonique complet (proposé)

Familles : `TERRE`, `SABLE`, `GRANULATS`, `ROCHE`, `RECYCLE`, `ORGANIQUE`, `INCONNU`.

| Famille | Matériaux canoniques |
|---|---|
| TERRE | terre, terre-melangee, terre-tamisee, terre-vegetale, terre-noire, terre-remplissage, sol-excave, argile-glaise, silt-limon |
| SABLE | sable, sable-compaction, sable-beton, sable-filtrant, sable-tamise, sable-recycle |
| GRANULATS | gravier, pierre, pierre-concassee, pierre-nette, poussiere-de-pierre, criblure, pierre-drainage, pierre-recyclee |
| ROCHE | roche, roches, roche-dynamitee, roc-excave, roches-concassees, enrochement, blocs-de-roche |
| RECYCLE | beton, beton-concasse, asphalte, asphalte-concasse, planage-asphalte, brique, brique-concassee, melange-beton-asphalte, granulat-recycle |
| ORGANIQUE | souches, branches, bois-non-traite, residus-vegetaux, paillis-copeaux, terre-avec-racines, matiere-organique |
| INCONNU | materiau-non-identifie (jamais matché automatiquement) |

Notes d'analyse demandées :
- « sol naturel », « sol sableux », « sol argileux », « terre propre » = **caractéristiques**, pas des matériaux → conditions/attributs, pas d'entrée canonique.
- « terre de remplissage » = usage courant fréquent au Québec → conservée comme matériau affiché, mais marquée comme synonyme souple de terre/terre mélangée.
- « Remblai / remplissage / n'importe quoi / mélangé » restent des **termes ambigus** (jamais un matériau).

## 3. Catalogue simplifié visible (UX)

Écran 1 (7 cartes, multi-sélection) : 🌱 Terre et sols · 🏖 Sable · 🪨 Pierre et gravier · ⛰ Roche / grosses pierres · ♻ Matériaux recyclés · 🌳 Végétaux · ❓ Autre / Je ne sais pas.
Écran 2 : 4 à 6 sous-types maximum par famille choisie + « Autre ».
Écran 3 : conditions (Accepte / Refuse / Peu importe).
Relance facultative : « Pouvez-vous aussi accepter… » sur les familles non choisies. **Aucune case pré-cochée.**

## 4. Alias (exemples, tous rattachés au canonique, jamais visibles)

- terre : `terre`, `Terre`, `There` (faute constatée → à valider humainement)
- terre mélangée : `terre mélangé`, `terre melangé`, `terre mélamgé`, `terre mélanger`, `Terre mélangé`
- pierre concassée + granulo 0-3/4 : `Pierre concassée 0-3/4`, `0-3/4`, `0 3/4`, `zéro trois-quarts`
- pierre nette + granulo 3/4 : `Pierre concassée 3/4 net`, `3/4 net`, `pierre nette 3/4`
- roches concassées : `roche-concassee`, `roches concassée`, `Roches concasées`, `roches concasées`
- béton / asphalte : variantes de casse et pluriels (`asphaltes`)
- `MG-20`, `MG-56` : **non créés**. Aucune équivalence technique tant qu'elle n'est pas validée par un référentiel interne.

Champs alias : `alias_raw`, `alias_norm`, `material_id`, `granulometry_id` (nouveau), `match_type`, `confidence`, `human_validated`.

## 5. Granulométries (table de référence séparée)

`0-1/4`, `0-3/4`, `0-2 1/2`, `net 1/4`, `net 1/2`, `net 3/4`, `net 1"`, `net 1 1/2`, `net 2"`, `autre`, `inconnue`.
Rattachée à la relation demande↔matériau (`granulometry_id` nullable), pas au catalogue.
Dimension min/max pour l'enrochement = attributs numériques séparés (`size_min_mm`, `size_max_mm`).

## 6. Conditions (jamais des matériaux)

`propre_exige`, `caracterisation_exigee`, `glaise`, `souches`, `beton`, `asphalte`, `organique`, `melange`, `materiau_sec_exige`, `humidite`, `dimension_max`, `dimension_min`, `granulometrie`, `autre_restriction`.
Valeurs : `oui` / `non` / `inconnu` (+ `detail` texte, `original_text` conservé).

## 7. Règles environnementales à prévoir

Dimension **séparée** du matériau : `environmental_status` ∈ `inconnu`, `non_caracterise`, `caracterise`, `autre_statut_reglementaire`.
Champs complémentaires : documents de caractérisation, provenance, traçabilité, restrictions, notes.
Règle absolue : **jamais de déduction automatique** d'une qualité environnementale; uniquement une information ou un document explicite.

## 8. Éléments réglementés / à validation (administrable)

Sur le matériau ET sur la condition : `regulatory_level` ∈ `standard`, `validation_requise`, `documentation_requise`, `non_admissible_a_cette_destination`.
Administrable en base, aucune conclusion réglementaire codée en dur.

## 9. Impact sur les 44 valeurs historiques

- 100 % des 44 valeurs restent lisibles : elles demeurent intactes dans `submissions.materials` (source de vérité de rollback).
- ~30 valeurs → alias haute confiance vers un canonique (+ granulométrie pour 2 d'entre elles).
- ~8 valeurs (Autre, remplissage, ne-sais-pas, mélangé, Juste pas de glaise…) → restent termes ambigus / file de qualification.
- ~6 valeurs deviennent alias + condition (ex. « Juste pas de glaise » → condition `glaise = non`).
- Aucune valeur écrasée, aucune fusion destructive.

## 10. Impact sur les 1 724 relations simulées

- Le nombre de relations reste du même ordre (~1 724), mais la répartition change : « Pierre concassée 0-3/4 » et « Pierre concassée 3/4 net » deviennent 2 matériaux + granulométrie au lieu de 2 canoniques distincts.
- L'artefact de +112 sur « Pierre 3/4 net » disparaît (simple renommage d'étiquette).
- ~63 occurrences détectées deviennent des **conditions**, pas des relations matériaux.
- Les relations restent **non peuplées** tant que vous ne l'autorisez pas.

## 11. Changements de schéma nécessaires (additifs)

1. `material_catalog` : + `parent_slug`, `display_name`, `abbreviation`, `legacy_key`, `subfamily`, `regulatory_level`, `search_terms`.
2. Nouvelle `material_granulometries` (référence) + `granulometry_id` sur alias et relations.
3. `submission_accepted_materials` : + `granulometry_id`, `size_min_mm`, `size_max_mm`.
4. `submission_material_conditions` : + `regulatory_level`.
5. `submission_environmental_info` : + `environmental_status` contrôlé + documents.
6. Fonction de recherche tolérante (`material_search(text)`) retournant des suggestions — jamais une compatibilité.
Tout est additif, réversible, sans toucher aux colonnes historiques.

## 12. Changements UX proposés

- Formulaire propriétaire (dompe) : 3 écrans (familles → sous-types → restrictions), multi-sélection, relance facultative.
- Formulaire entrepreneur (évacuation) : même vocabulaire, famille → matériau → granulométrie facultative.
- Recherche tolérante dans les deux sens (« 3/4 », « roche », « terre noir »).
- « Je ne sais pas exactement » présent partout → description libre (+ photo plus tard) → file de qualification.
- Les surfaces publiques, la carte, le CRM et le matching actuels restent inchangés jusqu'à autorisation de bascule.
