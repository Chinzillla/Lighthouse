# Replay CLI

The replay CLI is the current execution surface for Lighthouse's replay engine.
It replays one closed offset range from one source topic partition into one
destination topic partition.

## Current Scope

Implemented today:

- one source topic per run
- one partition per run
- one closed offset range per run
- one existing destination topic per run
- dry-run preview mode
- replay metadata headers for traceability

Not implemented yet:

- timestamp-based replay
- key-based filtering
- throttling
- cancellation
- persisted replay jobs

## Command Shape

```bash
npm run replay:cli -- --source <topic> --destination <topic> --partition <id> --start <offset> --end <offset>
```

Required flags:

```text
--source <topic>
--destination <topic>
--partition <id>
--start <offset>
--end <offset>
```

Optional flags:

```text
--brokers <host:port,...>
--client-id <id>
--job-id <id>
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
