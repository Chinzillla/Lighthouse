# Replay Jobs

Phase 3 turns replay from a single fire-and-forget CLI command into a
trackable workflow with local persistence.

## What Exists Today

Lighthouse now supports:

- persisted replay job records in SQLite
- statuses for `draft`, `running`, `completed`, `failed`, and `cancelled`
- replay progress updates while a job is running
- CLI commands to create, start, list, show, and cancel jobs

The replay engine itself is still the same bounded offset-range worker from
Phase 2. Phase 3 adds orchestration and state around it.

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
- start offset
- end offset
- status
- dry-run flag
- replayed count
- total message count for the requested range
- created time
- started time
- completed time
- error message
- last replayed offset

## Current Limits

Phase 3 keeps orchestration intentionally local and simple:

- jobs are stored locally on one machine
- running job cancellation is not implemented yet
- jobs are started manually through the CLI
- there is no API or UI surface for jobs yet

Those are the concerns for Phase 4 and Phase 6.
