# Replay CLI

The replay CLI is the current execution surface for Lighthouse's replay engine.
It replays either one closed offset range or one timestamp window from a source
topic partition into a destination topic partition.

## Current Scope

Implemented today:

- one source topic per run
- one partition per run
- one closed offset range or one timestamp window per run
- one existing destination topic per run
- dry-run preview mode
- replay metadata headers for traceability
- timestamp-to-offset resolution before replay
- optional message-per-second throttling for actual replay writes
- persisted replay jobs can be cancelled while running

Not implemented yet:

- key-based filtering

## Command Shape

```bash
npm run replay:cli -- --source <topic> --destination <topic> --partition <id> --start <offset> --end <offset>
npm run replay:cli -- --source <topic> --destination <topic> --partition <id> --start-timestamp <timestamp> --end-timestamp <timestamp>
```

Required flags:

```text
--source <topic>
--destination <topic>
--partition <id>
--start <offset>
--end <offset>
```

For time-window replay, replace `--start` and `--end` with:

```text
--start-timestamp <ISO timestamp or epoch milliseconds>
--end-timestamp <ISO timestamp or epoch milliseconds>
```

Optional flags:

```text
--brokers <host:port,...>
--client-id <id>
--job-id <id>
--messages-per-second <count>
--dry-run
--progress-every <count>
```

## Examples

Replay a slice into the seeded local sandbox topic:

```bash
npm run replay:cli -- --source orders --destination orders-replay --partition 0 --start 10 --end 25 --brokers localhost:19092,localhost:19093,localhost:19094
```

Preview the same slice without producing anything:

```bash
npm run replay:cli -- --source orders --destination orders-replay --partition 0 --start 10 --end 25 --dry-run --job-id incident-2026-04-28
```

Replay the slice with a write cap of 10 messages per second:

```bash
npm run replay:cli -- --source orders --destination orders-replay --partition 0 --start 10 --end 25 --messages-per-second 10 --job-id incident-throttled-2026-04-28
```

Replay a failure window by timestamp. The start timestamp is inclusive and the
end timestamp is exclusive:

```bash
npm run replay:cli -- --source orders --destination orders-replay --partition 0 --start-timestamp 2026-04-28T14:03:00.000Z --end-timestamp 2026-04-28T14:08:00.000Z --job-id incident-window-2026-04-28
```

Use the shared Kafka environment variables instead of passing brokers inline:

```bash
KAFKA_BROKERS=pkc-example.us-east-1.aws.confluent.cloud:9092 npm run replay:cli -- --source orders --destination orders-replay --partition 0 --start 10 --end 25
```

## Dry-Run Behavior

`--dry-run` connects to Kafka, validates the request, reads the requested
records, and prints a preview of the messages that would be replayed.

Dry-run does not:

- connect a producer
- publish to the destination topic
- change the destination topic offsets

Dry-run still validates:

- source topic exists
- destination topic exists
- destination topic differs from source topic
- source and destination both contain the requested partition
- requested offsets are within the retained range
- requested timestamp windows resolve to at least one retained message

## Timestamp Window Behavior

Timestamp replay resolves the requested time window into concrete Kafka offsets
before reading any messages.

Semantics:

- `--start-timestamp` is inclusive
- `--end-timestamp` is exclusive
- both flags accept ISO-8601 timestamps or epoch milliseconds
- resolved offsets are validated against the retained source partition range
- a window that resolves to no messages fails before replay starts

The replay summary and persisted jobs store the resolved offsets. That keeps
execution deterministic after the job is created.

## Throttling Behavior

`--messages-per-second` caps actual replay writes to the destination topic. The
first message can be written immediately; later writes are paced so the replay
does not exceed the configured rate.

Throttling applies to replay execution, not preview-only reads. This keeps
preview responsive while still protecting downstream sandbox consumers during
an actual replay.

## Replay Headers

Actual replay writes preserve the source message key, value, timestamp, and any
existing headers. Lighthouse adds these headers:

| Header | Meaning |
| --- | --- |
| `x-replayed` | Marks the record as replayed |
| `x-replay-job-id` | Stable identifier for the replay run |
| `x-original-topic` | Source topic name |
| `x-original-partition` | Source partition number |
| `x-original-offset` | Source offset |

These headers make replayed records easier to inspect in downstream consumers,
logs, and sandbox processing flows.

## Safety Model

The CLI currently enforces the following rules before replay begins:

- destination topic must already exist
- destination topic must be different from source topic
- source partition must exist
- destination partition must exist
- start offset must be greater than or equal to the retained earliest offset
- end offset must be lower than the source topic's next unread offset
- timestamp windows must resolve to a non-empty offset range
- messages-per-second, when set, must be a positive integer

## Verification

The replay engine has two levels of test coverage:

- unit tests for CLI parsing, validation, dry-run behavior, and header injection
- live Kafka integration tests against the local Docker sample cluster

Run the integration test with the sample cluster up:

```powershell
$env:KAFKA_INTEGRATION="1"
$env:KAFKA_BROKERS="localhost:19092,localhost:19093,localhost:19094"
npm.cmd run test:kafka:integration
```
