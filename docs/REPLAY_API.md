# Replay API

Phase 4 exposes the replay workflow through HTTP so jobs can be created,
previewed, started, and inspected without relying on terminal output.

## What Exists Today

Lighthouse now supports:

- `POST /api/jobs` to create a persisted replay job
- `GET /api/jobs` to list recent jobs
- `GET /api/jobs/:jobId` to fetch one job
- `GET /api/jobs/:jobId/preview` to run a dry-run preview and return structured messages
- `POST /api/jobs/:jobId/start` to start the job in-process and return `running`
- `POST /api/jobs/:jobId/cancel` to cancel draft or failed jobs

The API is built on the same replay engine and SQLite job store used by the CLI.
Validation, safety rules, and job status transitions are shared.

## Startup Paths

The replay API is available any time the Next.js app is running.

Recommended local setup with the sample Kafka stack:

```bash
npm run docker:sample
```

For local app development with the sample Kafka stack detached:

```powershell
npm ci
npm run docker:sample:detached
$env:PROMETHEUS_API="http://localhost:9090"
$env:PROMETHEUS_ALLOWED_HOSTS="localhost:9090"
npm.cmd run dev
```

The API will then be reachable at:

```text
http://localhost:3000/api/jobs
```

## Create a Job

```bash
curl -X POST http://localhost:3000/api/jobs \
  -H "content-type: application/json" \
  -d '{"source":"orders","destination":"orders-replay","partition":"0","start":"10","end":"25","job-id":"incident-2026-04-28"}'
```

Response:

```json
{
  "job": {
    "jobId": "incident-2026-04-28",
    "status": "draft",
    "sourceTopic": "orders",
    "destinationTopic": "orders-replay",
    "partition": 0,
    "startOffset": 10,
    "endOffset": 25
  }
}
```

## List and Read Jobs

```bash
curl http://localhost:3000/api/jobs
curl http://localhost:3000/api/jobs/incident-2026-04-28
```

`GET /api/jobs` accepts an optional `limit` query parameter.

## Preview a Job

```bash
curl http://localhost:3000/api/jobs/incident-2026-04-28/preview
```

Preview is always a dry run. It validates the Kafka plan and returns structured
messages plus a replay summary without writing to the destination topic.

## Start a Job

```bash
curl -X POST http://localhost:3000/api/jobs/incident-2026-04-28/start
```

The start endpoint returns the job in `running` state immediately and launches
the replay worker in the Lighthouse application process. Progress and final
state are written back to SQLite, so callers can poll `GET /api/jobs/:jobId`.

## Cancel a Job

```bash
curl -X POST http://localhost:3000/api/jobs/incident-2026-04-28/cancel
```

Current behavior:

- draft jobs can be cancelled
- failed jobs can be cancelled
- running job cancellation is not implemented yet
- completed jobs cannot be cancelled

## Status Codes

- `200` for successful reads, previews, and cancellation
- `201` for successful job creation
- `202` for successful job start
- `400` for validation errors
- `404` when a job id is not found
- `409` for invalid state transitions
- `502` for Kafka-side replay or preview failures surfaced through the API

## Current Limits

- replay execution is in-process, not distributed
- running-job cancellation is not implemented yet
- there is no replay-specific UI yet
- there is no authentication or RBAC layer yet
