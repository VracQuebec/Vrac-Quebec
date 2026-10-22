# Prepared durable submission package
- Keep all entrypoints here inactive; imports into active function sources require separately authorized migrations and activation because those sources deploy automatically.
- Use guard_claim_durable without modifying legacy guard_claim semantics; unresolved reservations remain barriers so a timeout cannot authorize a competing insert.
- Release a reservation only on an explicitly proven rejection before the main dossier insert; network failures retain pending because a late commit is possible.
- Operational rollback restores archived code while keeping additive functions, columns and unique indexes; schema removal is not a continuity-preserving rollback.