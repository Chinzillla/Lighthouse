# Replay UI

Phase 5 adds a minimal replay-specific workflow to the Lighthouse application.

## What Exists Today

The replay workspace supports:

- entering source topic, destination topic, partition, and offset range
- switching between offset replay and timestamp-window replay
- setting an optional max messages-per-second cap for replay execution
- saving a draft replay job through the existing API
- selecting a persisted job from the recent jobs table
- previewing structured records before replay
- starting replay from the selected draft
- cancelling draft, failed, or running jobs
- polling recent job state every few seconds
- progress bars with percent complete, current offset, observed throughput,
  elapsed time, and ETA when available

The UI is intentionally narrow. It focuses on the replay path and avoids
becoming a generic dashboard-builder surface.

## Where It Lives

The replay workspace is part of the main application shell:

```text
http://localhost:3000/#replay
```

The existing top navigation now links directly to the replay section.

## Recommended Demo Flow

1. start the local sample stack:

   ```bash
   npm run docker:sample
   ```

2. open Lighthouse:

   ```text
   http://localhost:3000
   ```

3. in the replay workspace, save a draft with:

   - source topic: `orders`
   - destination topic: `orders-replay`
   - partition: `0`
   - start offset: `0`
   - end offset: `5`

4. preview the selected draft to inspect the payloads and replay headers
5. start the replay job
6. watch status, percent complete, throughput, and ETA update in the selected
   job panel and recent jobs table

For timestamp replay, switch the create form to `Time window` and enter ISO
timestamps such as:

- start timestamp: `2026-04-28T14:03:00.000Z`
- end timestamp: `2026-04-28T14:08:00.000Z`

The UI sends those timestamps to the API, which resolves them to offsets before
the draft is saved.

For throttled replay, enter a value in `Max messages/sec`. Leave it blank for
unthrottled replay. The cap is stored on the job and applied when the replay is
started.

## Interaction Model

The replay UI is split into three panels:

- `Create draft`: persists a replay request through `POST /api/jobs`
- `Selected job`: shows resolved offsets, throttle setting, and runs preview,
  progress metrics, start, or cancel actions for the active job
- `Recent jobs`: shows the latest persisted jobs, status, and progress bar

Preview results are shown in a separate output panel with:

- source topic and partition
- source offset
- key
- value
- replay metadata headers

## Current Limits

- replay execution still runs in-process in the Next.js app
- there is no replay comparison or filtering UI yet
