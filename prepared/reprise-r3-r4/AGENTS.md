# Request and requisition preparation
- SQL is never installed on the shared backend by this task; execute only against the explicitly verified disposable loopback fixture.
- Extend submissions and transport_requests, using existing membership/driver/truck identities and ent_crm_history/transport_request_events; no parallel CRM or trip counter.
- Company bindings are explicit nullable fields; never infer them from a name, email, position or default company, and never backfill historical rows silently.
- Every read/write rechecks active company membership and assigned driver identity; operations are versioned, idempotent and confirmed. Accepted snapshots are immutable; changes require revalidation.
- R4B composes the existing EXEC-02 ledger with exception transitions, preserving snapshots and measured balances; endpoint locks precede reservation locks, and legacy transport edits cannot bypass requisition revalidation.