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
- GraphQL API route that proxies Prometheus queries from the server
- Responsive operations console for broker, partition, topic, and offset signals
- Local Docker Kafka stack with three brokers, Prometheus, and a demo producer
- Kafka metrics exporter that supports local Kafka and SASL/SSL clusters
- Jest component tests
- GitHub Actions workflow for lint, test, and build
- Multi-stage Dockerfile and Docker Compose support

Planned next:

- Offset-range Kafka replay CLI
- Dry-run preview and replay metadata headers
- Persistent replay job model
- REST API for replay job creation, status, preview, and cancellation
- Minimal UI for replay creation and job monitoring

## Architecture

```text
Browser
  -> Next.js page
  -> Apollo Client
  -> /api/graphql
  -> PrometheusAPI data source
  -> Prometheus HTTP API
```

The frontend never calls Prometheus directly. Prometheus access stays on the
server side through `PROMETHEUS_API`.

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
docker compose -f docker-compose.yml -f docker-compose.local-kafka.yml up --build
```

Open:

- Lighthouse UI: `http://localhost:3000`
- Prometheus: `http://localhost:9090`
- Kafka exporter metrics: `http://localhost:9308/metrics`

The local cluster exposes these host bootstrap ports:

```text
localhost:19092,localhost:19093,localhost:19094
```

### Option 2: Lighthouse With Existing Kafka

Use this when you already have a plain Kafka-compatible cluster.

Create a local `.env` file:

```env
KAFKA_BROKERS=broker1:9092,broker2:9092
KAFKA_SSL=false
KAFKA_SASL_USERNAME=
KAFKA_SASL_PASSWORD=
PROMETHEUS_API=http://localhost:9090
```

Start Lighthouse, Prometheus, and the Kafka metrics exporter:

```bash
docker compose up --build
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
PROMETHEUS_API=http://localhost:9090
```

Then start Lighthouse:

```bash
docker compose up --build
```

Open `http://localhost:3000`.

Do not commit real Confluent credentials. `.env` is ignored by git.

## Local Development

Use this when working on the Next.js app itself.

Prerequisites:

- Node.js 20
- npm

Install dependencies:

```bash
npm ci
```

Run the app locally:

```bash
npm run dev
```

If Prometheus is running locally, set `PROMETHEUS_API=http://localhost:9090`.
On PowerShell:

```powershell
$env:PROMETHEUS_API="http://localhost:9090"
npm.cmd run dev
```

See [docs/KAFKA_CONFIGURATION.md](docs/KAFKA_CONFIGURATION.md) for the full
Kafka configuration guide.

## Quality Gates

Run these before opening a pull request:

```bash
npm run lint
npm run test:ci
npm run build
```

The same checks run in GitHub Actions on pull requests and pushes to `main`,
`feature/**`, `fix/**`, or `chore/**` branches.

## Branching Workflow

- `main` should stay releasable.
- Feature work should happen on short-lived branches such as
  `feature/revamp-foundation`, `feature/replay-cli`, or `fix/prometheus-errors`.
- Each branch should keep a focused scope and pass CI before merge.
- Larger work should be split into small commits that map to the roadmap.

## Roadmap

See [docs/ROADMAP.md](docs/ROADMAP.md) for the phased rebuild plan.

## License

This project is licensed under the MIT License.
