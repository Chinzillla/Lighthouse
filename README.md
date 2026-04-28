# Lighthouse

Lighthouse is a Kafka debugging workbench in active rebuild. The current
application is a read-only Kafka metrics console backed by Prometheus and
Next.js. The roadmap expands it into a safe replay engine for inspecting and
replaying Kafka event windows into sandbox topics.

The rebuild is intentionally incremental: stabilize the existing dashboard,
add CI and Docker support, then build replay functionality behind clear APIs
and tests.

## Current Scope

Implemented today:

- Next.js dashboard for Kafka cluster metrics exposed through Prometheus
- Fetch-based API route that proxies Prometheus queries from the server
- Responsive operations console for broker, partition, topic, and offset signals
- Local Docker Kafka stack with three brokers, Prometheus, and a demo producer
- Kafka metrics exporter that supports local Kafka and SASL/SSL clusters
- Offset-range and timestamp-window Kafka replay for one topic partition
- Optional message-per-second throttling for replay writes
- Dry-run replay preview and replay metadata headers for traceability
- Replay job workflow with SQLite persistence, status tracking, and progress metrics
- Replay job REST API for creation, listing, preview, start, cancel, and status reads
- Running replay job cancellation for persisted jobs
- Minimal replay workspace in the Next.js UI for draft creation, preview, start, cancel, and monitoring
- Static GitHub Pages documentation site source in `site/`
- Jest component tests
- GitHub Actions workflow for dependency audit, lint, tests, build, and Docker checks
- Multi-stage Dockerfile and Docker Compose support

Planned next:

- Alpha release quality control and hardening

## Architecture

```text
Browser
  -> Next.js page
  -> /api/dashboard-metrics
  -> Prometheus fetch client
  -> Prometheus HTTP API
```

The frontend never calls Prometheus directly. Prometheus access stays on the
server side through `PROMETHEUS_API`.

```text
HTTP client
  -> /api/jobs
  -> replay job service
  -> SQLite job store

HTTP client
  -> /api/jobs/:id/start
  -> in-process replay runner
  -> Kafka replay engine
  -> Kafka source and destination topics
```

The repo also includes a static docs site in `site/` for GitHub Pages
deployment. It covers getting started, replay usage, architecture, and
operations.

## Quick Start

Choose one of three run modes:

1. local sample Kafka cluster for demos
2. existing Kafka endpoint
3. Confluent Cloud cluster

The default demo does not require a Google VM, Confluent Cloud account, or
pre-existing Kafka infrastructure.

### Option 1: Lighthouse With Sample Kafka

Use this when you want the full demo environment on your machine.

Prerequisite:

- Docker Desktop or Docker Engine

Start Lighthouse with a local three-broker Kafka cluster, seeded topics,
sample producer, metrics exporter, and Prometheus:

```bash
npm run docker:sample
```

Open:

- Lighthouse UI: `http://localhost:3000`
- Prometheus: `http://localhost:9090`
- Kafka exporter metrics: `http://localhost:9308/metrics`

The local cluster exposes these host bootstrap ports:

```text
localhost:19092,localhost:19093,localhost:19094
```

Replay a slice of Kafka history into the seeded `orders-replay` topic:

```bash
npm run replay:cli -- --source orders --destination orders-replay --partition 0 --start 0 --end 5 --brokers localhost:19092,localhost:19093,localhost:19094
```

Preview the same replay without producing:

```bash
npm run replay:cli -- --source orders --destination orders-replay --partition 0 --start 0 --end 5 --brokers localhost:19092,localhost:19093,localhost:19094 --dry-run --job-id sample-preview
```

### Option 2: Lighthouse With Existing Kafka

Use this when you already have a plain Kafka-compatible cluster.

Create a local `.env` file:

```env
KAFKA_BROKERS=broker1:9092,broker2:9092
KAFKA_SSL=false
KAFKA_SASL_USERNAME=
KAFKA_SASL_PASSWORD=
```

If Kafka is running directly on your host machine and the exporter is running
through Docker Compose, use `host.docker.internal:9092` instead of
`localhost:9092`.

Start Lighthouse, Prometheus, and the Kafka metrics exporter:

```bash
npm run docker:external
```

Open `http://localhost:3000`.

### Option 3: Lighthouse With Confluent Cloud

Use this when your Kafka cluster is hosted on Confluent Cloud.

Create a local `.env` file:

```env
KAFKA_BROKERS=pkc-example.us-east-1.aws.confluent.cloud:9092
KAFKA_SSL=true
KAFKA_SASL_MECHANISM=plain
KAFKA_SASL_USERNAME=<confluent-api-key>
KAFKA_SASL_PASSWORD=<confluent-api-secret>
```

Then start Lighthouse:

```bash
npm run docker:external
```

Open `http://localhost:3000`.

Do not commit real Confluent credentials. `.env` is ignored by git.

## Replay CLI

The replay engine is a focused tool for deterministic offset-range replay.
Version 1 intentionally supports:

- one source topic at a time
- one source partition at a time
- one closed offset range or one timestamp window per run
- replay into an existing destination topic
- preserving key, value, headers, timestamp, and partition number

Required flags:

```text
--source <topic>
--destination <topic>
--partition <id>
--start <offset>
--end <offset>
```

For timestamp-window replay, use these flags instead of `--start` and `--end`:

```text
--start-timestamp <ISO timestamp or epoch milliseconds>
--end-timestamp <ISO timestamp or epoch milliseconds>
```

Optional flags:

```text
--brokers <host:port,...>
--client-id <id>
--job-id <id>
--messages-per-second <count>
--dry-run
--progress-every <count>
```

Examples:

```bash
npm run replay:cli -- --source orders --destination orders-replay --partition 0 --start 10 --end 25 --brokers localhost:19092,localhost:19093,localhost:19094
npm run replay:cli -- --source orders --destination orders-replay --partition 0 --start 10 --end 25
npm run replay:cli -- --source orders --destination orders-replay --partition 0 --start 10 --end 25 --messages-per-second 10
npm run replay:cli -- --source orders --destination orders-replay --partition 0 --start-timestamp 2026-04-28T14:03:00.000Z --end-timestamp 2026-04-28T14:08:00.000Z
```

The second form uses the same `KAFKA_*` environment variables as the metrics
exporter, so it works for:

- the local Docker Kafka sample
- a plain Kafka cluster
- Confluent Cloud

Replay metadata headers added during an actual replay:

- `x-replayed`
- `x-replay-job-id`
- `x-original-topic`
- `x-original-partition`
- `x-original-offset`

Dry-run mode validates the request and previews the records without writing to
the destination topic.

Timestamp windows use inclusive start and exclusive end semantics. Lighthouse
resolves the window to concrete offsets before replay starts.

`--messages-per-second` caps actual replay writes. Preview remains a dry-run
read path and is not slowed by the cap.

## Replay Jobs

Phase 3 adds a job workflow backed by local SQLite persistence.

Create a draft job:

```bash
npm run replay:jobs -- create --source orders --destination orders-replay --partition 0 --start 10 --end 25 --job-id incident-2026-04-28
```

Create a draft job from a timestamp window:

```bash
npm run replay:jobs -- create --source orders --destination orders-replay --partition 0 --start-timestamp 2026-04-28T14:03:00.000Z --end-timestamp 2026-04-28T14:08:00.000Z --job-id incident-window-2026-04-28
```

Create a throttled draft job:

```bash
npm run replay:jobs -- create --source orders --destination orders-replay --partition 0 --start 10 --end 25 --messages-per-second 10 --job-id incident-throttled-2026-04-28
```

Start it:

```bash
npm run replay:jobs -- start --job-id incident-2026-04-28
```

Inspect jobs:

```bash
npm run replay:jobs -- list
npm run replay:jobs -- show --job-id incident-2026-04-28
```

By default, the job store lives at `data/lighthouse.sqlite`. Override it with
`LIGHTHOUSE_DB_PATH` when you need a different location.

## Replay API

Phase 4 exposes the replay workflow through Next.js API routes.

Endpoints:

- `POST /api/jobs`
- `GET /api/jobs`
- `GET /api/jobs/:jobId`
- `GET /api/jobs/:jobId/preview`
- `POST /api/jobs/:jobId/start`
- `POST /api/jobs/:jobId/cancel`

Create a job:

```bash
curl -X POST http://localhost:3000/api/jobs \
  -H "content-type: application/json" \
  -d '{"source":"orders","destination":"orders-replay","partition":"0","start":"10","end":"25","job-id":"incident-2026-04-28"}'
```

Timestamp job creation uses `start-timestamp` and `end-timestamp` in the JSON
body and stores the resolved offsets on the job. Add `messages-per-second` to
store a replay write cap.

Preview it without producing:

```bash
curl http://localhost:3000/api/jobs/incident-2026-04-28/preview
```

Start it:

```bash
curl -X POST http://localhost:3000/api/jobs/incident-2026-04-28/start
```

List persisted jobs:

```bash
curl http://localhost:3000/api/jobs
```

The start endpoint launches the replay worker in the application process and
returns the job in `running` state immediately. Progress and final status are
persisted in SQLite, so the job can be polled through `GET /api/jobs/:jobId`.
Every job response includes derived progress metrics for percent complete,
remaining messages, current offset, elapsed time, throughput, and ETA.

## Replay UI

Phase 5 adds the first replay-specific application surface inside the existing
operations console.

The replay workspace supports:

- entering source topic, destination topic, partition, and offset range
- switching to timestamp-window replay when the incident window is known by time
- setting an optional max messages-per-second cap
- saving a persisted draft replay job
- selecting a recent job from the monitor table
- previewing structured messages and replay headers
- starting or cancelling draft, failed, or running jobs
- polling recent job state and progress metrics from the API

Recommended demo flow:

1. start the sample stack with `npm run docker:sample`
2. open `http://localhost:3000`
3. use the `Replay` navigation link
4. save a draft for `orders -> orders-replay`
5. preview the message slice
6. start the replay and watch the job status, progress, throughput, and ETA change

## Local Development

Use this when working on the Next.js app itself.

Prerequisites:

- Node.js 24
- npm

Install dependencies:

```bash
npm ci
npx playwright install chromium
```

Run the app locally:

```bash
npm run dev
```

If Prometheus is running locally, set `PROMETHEUS_API=http://localhost:9090`.
For non-local deployments, set `PROMETHEUS_ALLOWED_HOSTS` to a comma-separated
list of approved Prometheus hosts such as `prometheus:9090`.
On PowerShell:

```powershell
$env:PROMETHEUS_API="http://localhost:9090"
$env:PROMETHEUS_ALLOWED_HOSTS="localhost:9090"
npm.cmd run dev
```

See [docs/KAFKA_CONFIGURATION.md](docs/KAFKA_CONFIGURATION.md) for the full
Kafka configuration guide.
See [docs/REPLAY_CLI.md](docs/REPLAY_CLI.md) for replay semantics, dry-run
behavior, and traceability headers.
See [docs/REPLAY_JOBS.md](docs/REPLAY_JOBS.md) for the persisted job workflow.
See [docs/REPLAY_API.md](docs/REPLAY_API.md) for the replay job HTTP contract.
See [docs/REPLAY_UI.md](docs/REPLAY_UI.md) for the application workflow over the API.
See [docs/MVP_ACCEPTANCE.md](docs/MVP_ACCEPTANCE.md) for the final MVP
acceptance checklist and verification runbook.

## Quality Gates

Run these before opening a pull request:

```bash
npm run lint
npm run test:ci
npm run build
npm run e2e
```

Use the combined local gate when you do not need the browser check:

```bash
npm run verify
```

Run the live Kafka replay integration test against the local sample cluster:

```powershell
$env:KAFKA_INTEGRATION="1"
$env:KAFKA_BROKERS="localhost:19092,localhost:19093,localhost:19094"
npm.cmd run test:kafka:integration
```

The same checks run in GitHub Actions on pull requests and pushes to `main`,
`feature/**`, `fix/**`, or `chore/**` branches. Playwright runs against the
built Next.js app in CI.

For local end-to-end checks, build the app first and then run:

```bash
npm run build
npm run e2e
```

Validate Docker Compose files locally:

```bash
npm run docker:config
```

## Branching Workflow

- `main` should stay releasable.
- Feature work should happen on short-lived branches such as
  `feature/revamp-foundation`, `feature/replay-cli`, or `fix/prometheus-errors`.
- Each branch should keep a focused scope and pass CI before merge.
- Larger work should be split into small commits that map to the roadmap.

## Roadmap

See [docs/ROADMAP.md](docs/ROADMAP.md) for the phased rebuild plan.
See [docs/OPERATIONS.md](docs/OPERATIONS.md) for local run modes, health
checks, and troubleshooting.
See `site/` for the GitHub Pages documentation source.

## License

This project is licensed under the MIT License.
