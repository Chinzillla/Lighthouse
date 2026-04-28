# Lighthouse Rebuild Roadmap

## Current Status

Completed:

- Phase 0 foundation stabilization
- Phase 0.5 dependency modernization
- Phase 1 replay CLI prototype
- Phase 2 safety and traceability for dry-run preview and replay headers

Next focus:

- Phase 3 replay jobs and local persistence

## Phase 0: Foundation

Goal: make the existing project credible and maintainable before adding new
features.

- Replace brittle dashboard code paths
- Keep Prometheus access server-side
- Add a local Docker Kafka stack for demos and development
- Support external Kafka and Confluent Cloud connection settings
- Add reproducible CI checks
- Harden Docker support
- Refresh documentation

Deliverable: a stable dashboard branch that passes lint, tests, and build.

## Phase 0.5: Dependency Modernization

Goal: reduce framework risk before the replay engine grows.

- Upgrade from Next 12 to a supported Next.js release
- Replace deprecated API packages with a fetch-based metrics route
- Re-run Docker, unit, build, and Playwright checks after the migration

Deliverable: production dependency audit findings are resolved without changing
the user-facing workflow.

## Phase 1: Replay CLI Prototype

Goal: prove deterministic offset-range replay without adding UI complexity.

- Connect to Kafka
- Read one source topic, one partition, and one offset range
- Write replayed messages to a separate destination topic
- Log replay progress

Deliverable: a runnable CLI command with local Kafka setup notes.

## Phase 2: Safety and Traceability

Goal: make replay behavior safe enough to demo and reason about.

- Reject source and destination topic collisions
- Validate partition and offset input
- Add dry-run preview
- Attach replay metadata headers:
  - `x-replayed`
  - `x-replay-job-id`
  - `x-original-topic`
  - `x-original-partition`
  - `x-original-offset`

Deliverable: replay commands fail early on unsafe inputs and mark replayed
records clearly.

## Phase 3: Replay Jobs

Goal: turn replay from a script into a trackable workflow.

- Store job id, source, destination, partition, offsets, status, counts, and errors
- Persist progress locally with SQLite
- Model statuses such as `draft`, `running`, `completed`, `failed`, and `cancelled`

Deliverable: replay jobs survive process restarts and expose useful state.

## Phase 4: API Layer

Goal: expose replay workflows through backend contracts.

- `POST /jobs`
- `GET /jobs`
- `GET /jobs/:id`
- `POST /jobs/:id/start`
- `POST /jobs/:id/cancel`
- `GET /jobs/:id/preview`

Deliverable: replay jobs can be created, started, previewed, and inspected
without watching terminal logs.

## Phase 5: Minimal Replay UI

Goal: make the replay workflow demoable without turning the project into a
generic dashboard.

- Create replay jobs
- Preview messages
- Start replay
- View job status and replay progress

Deliverable: one focused screen for replay setup and monitoring.

## Phase 6: Operational Controls

Goal: make replay safer in realistic debugging workflows.

- Timestamp-to-offset replay
- Message-per-second throttling
- Job cancellation
- Better progress metrics

Deliverable: controlled replay for failure windows instead of only known offsets.

## Non-Goals for the Near Term

- Multi-cluster replay
- Auth and RBAC
- Schema Registry integration
- Exactly-once replay guarantees
- Kubernetes deployment
- Automated summaries or root cause generation
