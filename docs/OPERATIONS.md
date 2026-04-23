# Operations Notes

This document covers the stable run paths for the current Lighthouse foundation:
the dashboard, Prometheus, Docker sample Kafka, and CI checks.

## Local Demo Stack

Start the full sample environment:

```bash
npm run docker:sample
```

This starts:

- Lighthouse on `http://localhost:3000`
- Prometheus on `http://localhost:9090`
- Kafka exporter metrics on `http://localhost:9308/metrics`
- three local Kafka brokers on `localhost:19092,localhost:19093,localhost:19094`
- demo producer writing to the `orders` topic

Stop the sample environment:

```bash
npm run docker:sample:down
```

For an existing Kafka or Confluent Cloud cluster, set the Kafka variables in
`.env` and run:

```bash
npm run docker:external
```

## Local App Development

Use this when editing the Next.js app while the Docker sample stack provides
Prometheus and Kafka:

```powershell
npm ci
npm run docker:sample:detached
$env:PROMETHEUS_API="http://localhost:9090"
$env:PROMETHEUS_ALLOWED_HOSTS="localhost:9090"
npm.cmd run dev
```

The dashboard calls `/api/dashboard-metrics`. The browser never calls
Prometheus directly.

## Health Checks

Application health:

```bash
curl http://localhost:3000/api/health
```

Dashboard metrics API:

```bash
curl http://localhost:3000/api/dashboard-metrics
```

Prometheus readiness:

```bash
curl http://localhost:9090/-/ready
```

Kafka exporter metrics:

```bash
curl http://localhost:9308/metrics
```

## Troubleshooting

### Prometheus Unavailable

This means Lighthouse is running, but the server-side metrics API cannot query
Prometheus.

Check that Prometheus is running:

```bash
docker ps
curl http://localhost:9090/-/ready
```

If you are running the Next.js dev server outside Docker, make sure these
variables are set in the same shell:

```powershell
$env:PROMETHEUS_API="http://localhost:9090"
$env:PROMETHEUS_ALLOWED_HOSTS="localhost:9090"
```

If you are running the app inside Docker Compose, use:

```bash
npm run docker:sample
```

### Metrics Stay At Zero

The dashboard can be healthy while Kafka has not produced messages yet. Check
that the demo producer and exporter are running:

```bash
docker compose -f docker-compose.yml -f docker-compose.local-kafka.yml ps
curl http://localhost:9308/metrics
```

Offsets should increase after the demo producer has been running for a few
scrape intervals.

## CI Parity

Run the main local gate:

```bash
npm run verify
```

Run the browser gate after a production build:

```bash
npm run build
npm run e2e
```

Validate Docker Compose files:

```bash
npm run docker:config
```
