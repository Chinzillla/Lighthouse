# MVP Acceptance Pass

Phase 6.5 proves the replay MVP works end to end before alpha release quality
control begins.

## Current Status

Accepted locally on 2026-04-28.

Verification completed:

- `npm run verify`
- `npm run e2e`
- `KAFKA_INTEGRATION=1 KAFKA_BROKERS=localhost:19092,localhost:19093,localhost:19094 npm run test:kafka:integration`
- `npm run docker:config`

The live Kafka integration suite currently emits a non-blocking
`TimeoutNegativeWarning` from the Kafka client path while still passing. Track
it as alpha cleanup if it remains reproducible.

## Acceptance Checklist

| Area | Evidence |
| --- | --- |
| Offset replay works end to end | `tools/__tests__/kafka-replay.integration.test.js` copies a bounded offset range into a live destination topic and verifies replay headers. |
| Timestamp replay works end to end | `tools/__tests__/kafka-replay.integration.test.js` creates isolated topics, writes timestamped records, resolves a time window, and verifies only matching records are replayed. |
| Dry-run never produces | The live Kafka integration test captures the destination offset before and after dry-run preview and expects no offset change. |
| Source and destination topic safety | Unit coverage rejects source/destination collisions before replay begins; CLI and API docs document the same rule. |
| Local Docker sample is accurate | `npm run docker:config` validates the Compose files; the sample stack exposes Lighthouse, Prometheus, exporter metrics, and three Kafka brokers on the documented ports. |
| External Kafka docs are accurate | `docs/KAFKA_CONFIGURATION.md` documents `KAFKA_BROKERS`, optional TLS/SASL settings, and `docker:external`. |
| Confluent Cloud docs are accurate | `docs/KAFKA_CONFIGURATION.md` documents TLS plus SASL/PLAIN settings and warns not to commit credentials. |
| README and GitHub Pages match the app | README and `site/` document the same replay modes, safety model, API routes, UI workflow, and operational limits. |

## Verification Commands

Run the sample stack before live Kafka acceptance:

```bash
npm run docker:sample:detached
```

Run the main quality gate:

```bash
npm run verify
```

Run browser workflow checks:

```bash
npm run e2e
```

Run live Kafka acceptance checks:

```powershell
$env:KAFKA_INTEGRATION="1"
$env:KAFKA_BROKERS="localhost:19092,localhost:19093,localhost:19094"
npm.cmd run test:kafka:integration
```

Validate Docker Compose configuration:

```bash
npm run docker:config
```

## Acceptance Notes

- Dry-run preview validates the same Kafka plan as actual replay, but never
  creates a producer.
- Timestamp replay uses inclusive start and exclusive end semantics, then
  stores the resolved offsets on the job.
- Cancellation is cooperative. API-started jobs abort through the in-process
  runner; CLI-started jobs observe persisted cancellation during progress
  checks.
- Multi-cluster replay, RBAC, Schema Registry integration, Kubernetes
  deployment, and exactly-once replay guarantees remain outside the MVP.
