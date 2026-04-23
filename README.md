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

## Local Development

Prerequisites:

- Node.js 20
- npm
- Optional: Docker Desktop
- Optional: Prometheus endpoint exposing Kafka metrics

Install dependencies:

```bash
npm ci
```

Run the app locally:

```bash
npm run dev
```

With a Prometheus endpoint on PowerShell:

```powershell
$env:PROMETHEUS_API="http://localhost:9090"
npm.cmd run dev
```

The app runs at `http://localhost:3000`.

## Local Kafka Demo

Run a local three-broker Kafka cluster, metrics exporter, Prometheus, demo
producer, and Lighthouse UI:

```bash
docker compose -f docker-compose.yml -f docker-compose.local-kafka.yml up --build
```

Then open:

- Lighthouse: `http://localhost:3000`
- Prometheus: `http://localhost:9090`
- Kafka exporter metrics: `http://localhost:9308/metrics`

The local cluster exposes bootstrap ports `19092`, `19093`, and `19094` on the
host. Containers use `kafka-1:9092,kafka-2:9092,kafka-3:9092`.

## External Kafka

Lighthouse can also monitor an existing Apache Kafka-compatible cluster or
Confluent Cloud cluster by running the metrics exporter with your broker
configuration.

Plain Kafka example:

```bash
KAFKA_BROKERS=broker1:9092,broker2:9092 docker compose up --build
```

Confluent Cloud example:

```bash
KAFKA_BROKERS=pkc-example.us-east-1.aws.confluent.cloud:9092 \
KAFKA_SSL=true \
KAFKA_SASL_MECHANISM=plain \
KAFKA_SASL_USERNAME="<api-key>" \
KAFKA_SASL_PASSWORD="<api-secret>" \
docker compose up --build
```

See [docs/KAFKA_CONFIGURATION.md](docs/KAFKA_CONFIGURATION.md) for the full
configuration guide.

## Quality Gates

Run these before opening a pull request:

```bash
npm run lint
npm run test:ci
npm run build
```

The same checks run in GitHub Actions on pull requests and pushes to `main`
or `codex/**` branches.

## Docker

Build and run the app with Prometheus and the Kafka metrics exporter:

```bash
docker compose up --build
```

Pass a Prometheus endpoint through the environment:

```bash
PROMETHEUS_API=http://localhost:9090 docker compose up --build
```

## Branching Workflow

- `main` should stay releasable.
- Feature work should happen on short-lived branches such as
  `codex/revamp-foundation`, `feature/replay-cli`, or `fix/prometheus-errors`.
- Each branch should keep a focused scope and pass CI before merge.
- Larger work should be split into small commits that map to the roadmap.

## Roadmap

See [docs/ROADMAP.md](docs/ROADMAP.md) for the phased rebuild plan.

## License

This project is licensed under the MIT License.
