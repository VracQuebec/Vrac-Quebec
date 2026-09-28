---
name: Cycle de vie des demandes entrepreneur
description: Règles officielles changements critiques, annulation, compatibilité bloquante, demandes sans compte
type: feature
---
- Changements critiques → nouvelle version + revalidation + invalidation confirmation : dompe, adresse chantier, point de chargement, camion, remorque, configuration camion, matériau, date, quantité, nb voyages, conditions d'accès, tout ce qui touche compatibilité/disponibilité.
- Annulation : directe avant transport prêt ET avant transporteur assigné; admin notifié immédiatement si dompe confirmée; ensuite seulement « demande d'annulation » traitée par admin. Conserver original, motif, date/heure, acteur. Aucun voyage actif sur demande annulée sans validation admin.
- Compatibilité (matériau, camion, capacité, accès) BLOQUANTE : reste « À valider »; dérogation admin seulement avec justification journalisée.
- Demandes sans compte : liste « À identifier », rattachement manuel après vérification d'identité, jamais par ressemblance; toute nouvelle demande liée au compte authentifié.
