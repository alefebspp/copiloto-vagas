# Architecture Decision Records

Each ADR records the context, the decision and its consequences, including the bad ones. A superseded decision is not deleted: its status becomes "Superseded by ADR-NNN".

---

## ADR-001: Ports and adapters, in a monorepo

**Status:** accepted (2026-11-16)

### Context

The project will run on Lambda, consume SQS messages, persist to DynamoDB and call Bedrock. If the funnel rules imported those SDKs, they could only be tested against AWS (or SDK mocks) and would be locked into it. The project will also have an API and a web app that share contracts.

### Decision

1. **The domain defines the interfaces (ports) it needs**, in `domain/ports/`. Adapters (`adapters/`) implement those contracts. Dependencies always point inward: infrastructure depends on the domain, never the other way around (dependency inversion).
2. **The rule is enforced by a machine:** ESLint (`no-restricted-imports`) fails if a file in `domain/` imports `application/`, `adapters/`, `presentation/`, `@aws-sdk/*`, `fastify` or `zod`.
3. **pnpm workspaces monorepo** (`apps/*`): one lockfile, tests and CI in a single run, and atomic commits when a contract and its consumer change together.

### Consequences

- Business rules run the same in a Lambda, a script or a test, and domain tests are fast and deterministic, with no network.
- Replacing DynamoDB with Postgres means writing a new `JobRepository` adapter. The domain and the use cases do not change.
- Cost: more files and one layer of indirection. It would be overkill for a trivial CRUD; here it pays off because of the number of external services.
- The monorepo does **not** centralize deploys: the API (Lambda) and the web app (S3 + CloudFront) deploy independently, triggered only when that app changes.

---

## ADR-002: The funnel as a state machine with an append-only history

**Status:** accepted (2026-11-16)

### Context

Hiring processes are informal: sometimes the screening and the technical interview happen before the job is updated. At the same time, the copilot's value lies in search metrics (at which stage am I rejected most often? how long does each stage take?), which requires knowing the path of each job, not just where it is now.

### Decision

1. **Linear funnel:** a job moves forward one stage at a time, without skipping. Stages that happened without being recorded are recorded one by one.
2. **Exits:** `REJECTED` and `WITHDRAWN` can be reached from any active stage.
3. **Reopen:** from `REJECTED` or `WITHDRAWN` to a stage chosen by the user. It is the only transition that can skip stages.
4. **Append-only history:** a job keeps its list of transitions (`from`, `to`, `at`). The current stage is derived from the last transition. Reopening appends a transition; the rejection stays in the history.
5. **Undo:** removes only the most recent transition, one at a time. It is the only exception to append-only, to fix mistakes without polluting the metrics.
6. **Errors:** an invalid transition throws a `DomainError` with a semantic code (`INVALID_TRANSITION`, `JOB_NOT_FOUND`). The domain knows nothing about HTTP: the presentation layer maps the code to a status (422, 404), and any other error becomes a generic 500, with details only in the logs.
7. **Time and identity come from outside:** the domain never calls `new Date()` or generates IDs. The application layer provides `now` and the ID (a ULID, sortable by time). Dates are stored in UTC (ISO 8601) and converted only in the UI.
8. **Signature:** `moveStage(job, target, now)` returns a **new** job (immutable) with the transition appended, or throws a `DomainError`.

The exact list of stages will be settled when the domain is implemented (M1, part 2).

### Consequences

- Conversion and time-per-stage metrics come straight from the history.
- Tests pin `now` and the ID, so they are deterministic.
- Recording stages one by one costs the user a few extra clicks. Accepted in exchange for a faithful history.
- Undo breaks strict immutability of the history. Accepted because it is limited to the last transition.
- Exceptions do not show up in the function signature. Mitigation: a single type (`DomainError`) with typed codes, handled in one place at the edge.
