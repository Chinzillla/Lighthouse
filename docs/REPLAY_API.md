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
- timestamp-window job creation with resolved offsets
- optional `messages-per-second` throttling for replay execution
- derived progress metrics for percent complete, remaining messages, current
  offset, elapsed time, throughput, and ETA

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
  -d '{"source":"orders","destination":"orders-replay","partition":"0","start":"10","end":"25","messages-per-second":"10","job-id":"incident-2026-04-28"}'
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
    "endOffset": 25,
    "messagesPerSecond": 10,
    "progress": {
      "replayedCount": 0,
      "totalCount": 16,
      "remainingCount": 16,
      "percent": 0,
      "currentOffset": null,
      "elapsedMs": null,
      "averageMessagesPerSecond": null,
      "estimatedRemainingMs": null
    }
  }
}
```

Create a timestamp-window job:

```bash
curl -X POST http://localhost:3000/api/jobs \
  -H "content-type: application/json" \
  -d '{"source":"orders","destination":"orders-replay","partition":"0","start-timestamp":"2026-04-28T14:03:00.000Z","end-timestamp":"2026-04-28T14:08:00.000Z","job-id":"incident-window-2026-04-28"}'
```

Timestamp windows use inclusive start and exclusive end semantics. Job creation
resolves the time window to concrete source offsets before the draft is saved.
If the window has no retained messages, the API returns a validation error.

## Throttling

Add `messages-per-second` to the create payload to cap actual replay writes:

```json
{
  "source": "orders",
  "destination": "orders-replay",
  "partition": "0",
  "start": "10",
  "end": "25",
  "messages-per-second": "10"
}
```

The API stores the cap on the job. Preview endpoints remain dry-run reads; the
cap is enforced when a job is started and writes to the destination topic.

## List and Read Jobs

```bash
curl http://localhost:3000/api/jobs
curl http://localhost:3000/api/jobs/incident-2026-04-28
```

`GET /api/jobs` accepts an optional `limit` query parameter.

## Job Progress

Every job response includes the persisted counters and a derived `progress`
object:

- `replayedCount`: messages replayed so far
- `totalCount`: total messages in the resolved range
- `remainingCount`: messages not replayed yet
- `percent`: completion percentage capped at `100`
- `currentOffset`: last replayed source offset, or `null`
- `elapsedMs`: elapsed runtime from start to latest update or completion
- `averageMessagesPerSecond`: observed replay throughput
- `estimatedRemainingMs`: ETA for running jobs when throughput is known

The API derives those values from SQLite state on read. No migration is
required for existing local databases.

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
- there is no authentication or RBAC layer yet
