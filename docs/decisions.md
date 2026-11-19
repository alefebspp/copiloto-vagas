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

**Status:** partially superseded by ADR-003 (2026-11-18). Items 4 (append-only history), 5 (undo), 6 (errors live in the domain, HTTP mapping at the edge) and 7 (time and identity come from outside) still hold.

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

---

## ADR-003: A log of stage events instead of a linear funnel

**Status:** accepted (2026-11-18). Supersedes items 1, 2, 3 and 8 of ADR-002.

### Context

ADR-002 forced a linear funnel. Looking at real hiring processes, that is too rigid: companies run different stages in different orders, and many repeat a stage (an HR call, then a technical call, then a call with the manager). A rigid funnel would push the user to record stages that never happened, which corrupts the statistics it was meant to protect.

### Decision

1. **A job is a log of stage events, not a state machine.** Any stage can follow any other, and the same stage can appear more than once.
2. **Fixed catalog of stage types**, so statistics compare like with like: `APPLIED`, `ONLINE_ASSESSMENT` (automated tests such as logic or personality quizzes), `HR_INTERVIEW`, `TECHNICAL_INTERVIEW`, `TAKE_HOME`, `LIVE_CODING`, `SYSTEM_DESIGN`, `MANAGER_INTERVIEW`, `OFFER`, `OTHER`, and the closing stages `HIRED`, `REJECTED`, `WITHDRAWN` and `NO_RESPONSE`. `NO_RESPONSE` exists because the most common outcome is a company that stops answering; counting it as `REJECTED` would distort the statistics of where the process ends. If the company answers later, the job is reopened. `OTHER` requires a note explaining what happened. If the same note shows up often, it becomes a new type in the catalog.
3. **Closed jobs must be reopened first.** After a closing stage, no new stage can be recorded until the user reopens the job, which records a `REOPENED` event.
4. **Two timestamps per event.** `occurredAt` is when the stage happened and is given by the user; it can be in the past (stages recorded late) but never in the future. `recordedAt` is when it was recorded and comes from `now`. The timeline and the statistics use `occurredAt`. Closing, reopening and undo follow the recording order, so a late `REJECTED` with an old date still closes the job.
5. **Each event is persisted as its own record.** The `JobRepository` port appends and removes single events instead of saving the whole job, so two concurrent writes never overwrite each other. No optimistic lock.
6. **Error codes:** `JOB_NOT_FOUND`, `JOB_CLOSED`, `JOB_NOT_CLOSED`, `NOTE_REQUIRED`, `FUTURE_DATE` and `NOTHING_TO_UNDO`. `INVALID_TRANSITION` no longer exists.

### Consequences

- The model fits real processes and the statistics stay comparable, thanks to the catalog.
- The domain still enforces invariants (closed jobs, notes on `OTHER`, no future dates), so it is not a plain CRUD.
- **Accepted risk:** the "closed jobs must be reopened" rule spans several records. Two concurrent writes (recording `REJECTED` in one tab and another stage in a second tab) can both pass the check and leave a stage after the closing one. For a single-user app this race is rare and harmless. With many users, the fix is a conditional write on a job version (a DynamoDB condition expression).
- The catalog will need new types over time; `OTHER` with a note shows which ones.

---

## ADR-004: Job analysis with an LLM: structured output, boundary validation and a derived fit

**Status:** accepted (2026-11-18)

### Context

The copilot analyzes a job post against the resume with a model on Amazon Bedrock. LLM output is not deterministic, calls cost money per token, and the provider may change (another Bedrock model, or another vendor).

### Decision

1. **The application owns the prompt and the output schema.** What to ask and what a valid answer looks like are product knowledge, not infrastructure. The `LanguageModel` port is generic (`generateStructured`), and the Bedrock adapter only translates it to the Converse API.
2. **Structured output through tool use.** The model is forced (`toolChoice`) to fill in a tool whose input is the JSON Schema of the analysis, generated from the same Zod schema used for validation.
3. **Validate at the boundary anyway.** Tool use shapes the answer but does not guarantee it: the model can return an empty list, two bullets instead of three, or skip the tool. The response is parsed with Zod before anything else uses it.
4. **Retry by failure type.** Throttling is transient and is retried by the SDK with exponential backoff (`maxAttempts: 3`); no second retry layer on top. An invalid output is retried **once** in the use case, because a new sample may succeed, but each attempt is paid. A malformed request or missing permission is never retried: it would fail the same way. After two invalid outputs the analysis ends as `ERROR` with the validation message.
5. **The model judges requirements; code derives the fit.** Instead of a 0–100 score (LLMs are inconsistent with numbers), the model lists each requirement, whether the resume meets it and the evidence. The fit (`LOW`, `MEDIUM`, `HIGH`) comes from the share of required items met (≥ 80% high, ≥ 50% medium), so the same judgments always give the same fit, and evals can check each requirement.
6. **Start with the cheapest model; let evals decide.** The model id is configuration (`BEDROCK_MODEL_ID`), not code. A set of real job posts with expected results (P3) compares candidates on accuracy, cost and latency; a more expensive model is adopted only if the cheap one fails the evals.

### Consequences

- Swapping providers or models touches only the adapter or one environment variable.
- Analyses are explainable: every fit comes with the requirements behind it.
- An invalid answer can cost up to two calls. The tokens of both are reported.
- The fit thresholds are a product choice and may change after real use.

## ADR-005: Infrastructure as code with Terraform, keyless deploys through GitHub OIDC, API on Lambda

**Status:** accepted (2026-11-19)

### Context

The API has to run on AWS and be deployed from GitHub on every merge. The repository is public, so anyone can open a pull request. The account is personal and cost-sensitive, and traffic is low and bursty: idle most of the day.

### Decision

1. **All infrastructure is code; the console is read-only.** Every resource is reviewed in a pull request, versioned in git and reproducible in a new environment (staging, production) without repeating manual steps.
2. **Terraform, not CDK.** CDK would keep everything in TypeScript, but Terraform's explicit `plan` shows exactly what will be created, changed or destroyed before anything happens, the state is a visible part of the design, and it is what most job posts ask for. The HCL itself is AWS-specific; what carries to another cloud is the tool and the workflow, not the code.
3. **Two stacks.** `infra/bootstrap` creates what deploys depend on: the state bucket, the GitHub OIDC provider and the `github-deploy` role. It keeps its state locally and is applied once, by hand, by the account owner, because nothing can create the bucket its own state lives in, and a role cannot grant itself permission to exist. `infra/main` holds the application and stores its state in that bucket.
4. **Remote state with a lock, and serialized deploys.** The `main` state lives in S3 with native state locking, so two runs cannot write it at the same time. The deploy job also uses a GitHub Actions concurrency group, so merges queue their deploys instead of racing.
5. **GitHub authenticates through OIDC; no long-lived keys.** Each run exchanges a GitHub-signed token for temporary credentials of `github-deploy`. The role's trust policy requires `aud = sts.amazonaws.com` and `sub = repo:alefebspp/copiloto-vagas:ref:refs/heads/main`: only a run from this repository, on `main`, can assume it. A pull request, including one from a fork, carries a different `sub` and is refused. Without the `sub` condition, any GitHub repository could assume the role.
6. **`plan` on pull requests, `apply` on merge to `main`.** Reviewers see the infrastructure diff before merging; only `main` changes the account.
7. **The API runs on Lambda behind an API Gateway HTTP API.** Lambda scales to zero and is billed per request and duration, which fits idle-most-of-the-day traffic and the free plan. An always-on container would cost money 24 hours a day for nobody.

### Consequences

- Nobody, including CI, holds a credential that does not expire.
- The bootstrap stack is the one manual step, and its local state must not be lost (it can be imported again if it is).
- Cold starts add latency to the first request after idle time; accepted for this traffic.
- HTTP API integrations time out after 30 seconds, and Lambda bills while it waits for Bedrock. Synchronous analysis is fine while it finishes within seconds; long work moves to asynchronous processing (M6).
- Revisit the compute choice if traffic becomes constant (always-on becomes cheaper than per-request), latency must be predictable, or connections must stay open (streaming, websockets).
