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
- Responsive operations console for partition, connection, record, and byte metrics
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

Build and run with Docker Compose:

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
