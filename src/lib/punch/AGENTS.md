# Punch integration rules

- EXEC-06 extends pun_entries/pun_log with guarded correction requests, frozen approved-hour exports and existing project/task context; prepared SQL and identity fixtures run only in verified disposable loopback databases, never hosted by a client flag. Offline punch capture is unavailable; do not imply unsaved events are queued.

- Punch : pun_entries/pun_log, écritures par RPC seulement (pun_in/out/break/manual/decide); correction = nouvelle entrée + ancienne archivée; heures pour la paie via pun_summary — jamais de paie calculée hors de ce relevé approuvé.
