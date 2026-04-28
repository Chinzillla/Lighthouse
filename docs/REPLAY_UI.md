# Replay UI

Phase 5 adds a minimal replay-specific workflow to the Lighthouse application.

## What Exists Today

The replay workspace supports:

- entering source topic, destination topic, partition, and offset range
- saving a draft replay job through the existing API
- selecting a persisted job from the recent jobs table
- previewing structured records before replay
- starting replay from the selected draft
- cancelling draft or failed jobs
- polling recent job state every few seconds

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
6. watch status and progress update in the recent jobs table

## Interaction Model

The replay UI is split into three panels:

- `Create draft`: persists a replay request through `POST /api/jobs`
- `Selected job`: runs preview, start, and cancel actions for the active job
- `Recent jobs`: shows the latest persisted jobs and their current state

Preview results are shown in a separate output panel with:

- source topic and partition
- source offset
- key
- value
- replay metadata headers

## Current Limits

- replay execution still runs in-process in the Next.js app
- running-job cancellation is not implemented yet
- there is no replay comparison or filtering UI yet
- timestamp-based replay is not implemented yet
