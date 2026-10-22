# Inactive standalone portal package
- Never import or copy this directory into an active deployment path without separate authorization; index.ts starts a server only if explicitly executed.
- Keep the pinned dependency versions and regenerate manifest hashes after reviewed changes; the package must not depend on project src or generated browser database types.
- Preserve current runtime flags and atomic mail adapter; isolated tests block external delivery and use an independent private storage service.