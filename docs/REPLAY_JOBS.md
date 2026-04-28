# Replay Jobs

Phase 3 turns replay from a single fire-and-forget CLI command into a
trackable workflow with local persistence.

## What Exists Today

Lighthouse now supports:

- persisted replay job records in SQLite
- statuses for `draft`, `running`, `completed`, `failed`, and `cancelled`
- replay progress updates while a job is running
- CLI commands to create, start, list, show, and cancel jobs
- API endpoints to create, inspect, preview, start, and cancel persisted jobs
- timestamp-window jobs that resolve to concrete offsets at creation time
- optional message-per-second throttling stored with each job

The replay worker still executes a deterministic offset range. Timestamp jobs
resolve their time window before persistence, then store the resolved offsets.

## Database Location

By default, replay jobs are stored in:

```text
data/lighthouse.sqlite
```

Override the path with:

```text
LIGHTHOUSE_DB_PATH=/absolute/path/to/lighthouse.sqlite
```

The `data/` directory is ignored by git.

## Commands

Create a draft replay job:

```bash
npm run replay:jobs -- create --source orders --destination orders-replay --partition 0 --start 10 --end 25 --job-id incident-2026-04-28
```

Create a draft from a timestamp window:

```bash
npm run replay:jobs -- create --source orders --destination orders-replay --partition 0 --start-timestamp 2026-04-28T14:03:00.000Z --end-timestamp 2026-04-28T14:08:00.000Z --job-id incident-window-2026-04-28
```

Create a throttled draft:

```bash
npm run replay:jobs -- create --source orders --destination orders-replay --partition 0 --start 10 --end 25 --messages-per-second 10 --job-id incident-throttled-2026-04-28
```

Start the job:

```bash
npm run replay:jobs -- start --job-id incident-2026-04-28
```

Preview without writing:

```bash
npm run replay:jobs -- create --source orders --destination orders-replay --partition 0 --start 10 --end 25 --dry-run --job-id preview-2026-04-28
npm run replay:jobs -- start --job-id preview-2026-04-28
```

Inspect jobs:

```bash
npm run replay:jobs -- list
npm run replay:jobs -- show --job-id incident-2026-04-28
```

Cancel a draft job:

```bash
npm run replay:jobs -- cancel --job-id preview-2026-04-28
```

## Stored Fields

Each replay job stores:

- job id
- source topic
- destination topic
- partition
- replay mode
- resolved start offset
- resolved end offset
- original start timestamp for timestamp jobs
- original end timestamp for timestamp jobs
- status
- dry-run flag
- optional messages-per-second cap
- replayed count
- total message count for the requested range
- created time
- started time
- completed time
- error message
- last replayed offset

## Current Limits

The persisted workflow still keeps orchestration intentionally local and simple:

- jobs are stored locally on one machine
- running job cancellation is not implemented yet
- the API starts replay work in the same application process

Those remain the main concerns for the rest of Phase 6.
