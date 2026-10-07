# Phase 3C — Parcours réel d'une demande (TEST, non publié)
- Bloc « Parcours de la demande » dans la fiche demande : matériau, quantité, sens, site/dompe, transport, voyage, étape.
- Relations : submissions.selected_site_id / site_validated_at; transport_requests.origin_submission_id OU dump_submission_id; cpn_trips.submission_id (non annulés, côtés reçu/livré séparés).
- dump_name et adresses jamais utilisés comme preuve de lien. Aucun voyage ⇒ jamais « En cours ».
- Lecture unique via EntrepreneurDataProvider (ajout des colonnes dump_submission_id, side, count).
- Tests : src/test/demande-parcours.test.ts (A–J), 393×852 / 320×667 / 1440×1000 sans débordement ni écriture.
- Aucune donnée, table, migration, RLS, auth ou publication modifiée.
