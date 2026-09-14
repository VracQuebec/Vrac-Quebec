# Frontière de qualification → matching (préparée au LOT 17, utilisée au LOT 18)

Module : `src/lib/qualification/lot17.ts` (pur, sans écriture, sans réseau).

## Chaîne prévue

```text
réponse de qualification (OUI / NON / ÇA DÉPEND / JE NE SAIS PAS / PASSER)
        ↓  toNormalizedConstraint()
contrainte normalisée (NormalizedConstraint)
        ↓  QualificationBoundary.persist()      → refusée tant que le LOT 18 n'est pas autorisé
        ↓  QualificationBoundary.recomputeMatches() → point d'accroche du LOT 18
recalcul des matchs
```

## Contrainte normalisée

| Champ | Contenu |
| --- | --- |
| `request_id` | identifiant de la demande de remblai existante |
| `material` | clé matériau (`terre`, `sable`, `argile`, `pierre`, `roche`, `beton`, `asphalte`, …) |
| `material_family` | famille (`terre`, `sable`, `argile`, `pierre`, `beton`, `asphalte`, `organique`, `inconnu`) |
| `mixture_components` | composants du mélange non refusés |
| `granulometry` | `max_inches` / `min_inches` |
| `reinforcement` | `WITH` / `WITHOUT` / `UNKNOWN` (béton armé) |
| `acceptance_state` | `CONFIRMED` / `POSSIBLE` / `REJECTED` / `UNKNOWN` |
| `confidence` | `HAUTE` / `MOYENNE` / `INCONNU` |
| `source` | `qualification_test_mode` (LOT 17) ou `qualification_queue_v2` |
| `confirmed_by` / `confirmed_at` | toujours `null` en mode test |

Aucune migration destructive n'est requise : ces noms décrivent le contrat en mémoire et
seront projetés sur le schéma existant (`submission_accepted_materials`,
`submission_material_conditions`, `qualification_confirmations`) au LOT 18.

## Garanties du mode test (LOT 17)

- `guardMutation()` refuse toute écriture : confirmation, statut CRM, disponibilité,
  suppression, réactivation, matching public, courriel, SMS, notification client.
- Les réponses vivent en mémoire de session (`recordSessionAnswer`), marquées `simulated: true`.
- Bandeau permanent : « MODE TEST — AUCUNE DONNÉE RÉELLE MODIFIÉE ».
