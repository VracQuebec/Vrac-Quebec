# Fonctions serveur

- Anti-doublon public : réservation guard_claim → guard_complete (après création réelle) / guard_release (échec), par id exact; seul l'état « done » vaut doublon — un échec ne bloque jamais une nouvelle tentative.
- Même mécanisme pour submit-parcours et quote-submit (module dedupe par fonction, portée guard distincte); la référence renvoyée en doublon vient du résultat mémorisé, jamais d'une recherche par courriel.
- submit-parcours attend la confirmation client et renvoie email_status (queued/failed/not_sent) d'après la vraie réponse du service d'envoi; un nouvel essai repasse par l'anti-doublon avec resend_confirmation (même dossier, un seul lien par demande).
- send-transactional-email : modèles hors PUBLIC_TEMPLATES réservés à la clé de service exacte (fonctions serveur); tout autre jeton est refusé, car ces modèles acceptent destinataire et contenu fournis.
- site-assistant : public volontaire, borné par quotas par IP, par session et plafond global journalier — toute nouvelle fonction IA publique doit garder un plafond global.
