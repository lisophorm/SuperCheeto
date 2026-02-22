# ADR 0002: Keep Benchmark History in JSON/Local Storage for MVP

## Status
Accepted

## Context
We need benchmark history retention and quick visibility of latest model results in the Settings UI.
The question was whether to introduce Prisma-backed DB storage now or keep lightweight JSON storage.
Current application scope is single-user desktop usage with no shared backend data requirements.

## Decision
- Keep benchmark history persistence as JSON in frontend local storage for now.
- Do not introduce Prisma/database migration in this phase.
- Build the Settings "Latest Result Per Model" summary from local benchmark history.

## Alternatives considered
- Option A: Introduce Prisma + relational database now.
  - Pros: stronger queryability, shared persistence path, easier analytics growth.
  - Cons: significant setup/migration overhead for MVP, extra operational complexity.
- Option B: Backend file-based JSON persistence.
  - Pros: app-local persistence independent of browser storage.
  - Cons: new API surface and file locking/consistency concerns, still not multi-user robust.

## Consequences
- Faster delivery and lower maintenance burden in MVP.
- History remains client-local and not automatically shared across devices.
- Future migration path remains open: add export/import JSON first, then introduce DB only when query/reporting requirements justify it.
