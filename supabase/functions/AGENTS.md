# Fonctions serveur

- Anti-doublon public : réservation guard_claim → guard_complete (après création réelle) / guard_release (échec), par id exact; seul l'état « done » vaut doublon — un échec ne bloque jamais une nouvelle tentative.
