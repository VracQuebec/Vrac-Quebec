# Fonctions serveur

- Anti-doublon public : réservation guard_claim → guard_complete (après création réelle) / guard_release (échec), par id exact; seul l'état « done » vaut doublon — un échec ne bloque jamais une nouvelle tentative.
- Même mécanisme pour submit-parcours et quote-submit (module dedupe par fonction, portée guard distincte); la référence renvoyée en doublon vient du résultat mémorisé, jamais d'une recherche par courriel.
