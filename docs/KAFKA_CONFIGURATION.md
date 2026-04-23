# Kafka Configuration

Lighthouse should be easy to run against either a local Docker Kafka cluster or
an existing Kafka-compatible cluster. The project uses one configuration model:
Kafka connection settings feed the Lighthouse metrics exporter, Prometheus
scrapes that exporter, and the Next.js app reads from Prometheus.

## Local Docker Kafka

Use this for demos and local development:

```bash
docker compose -f docker-compose.yml -f docker-compose.local-kafka.yml up --build
```

This starts:

- three Kafka brokers running in KRaft mode
- a topic initializer for `orders`, `payments`, and `orders-replay`
- a demo producer that writes sample `orders` events
- Lighthouse Kafka metrics exporter
- Prometheus
- Lighthouse UI

Host ports:

- Lighthouse UI: `3000`
- Prometheus: `9090`
- Kafka metrics exporter: `9308`
- Kafka brokers: `19092`, `19093`, `19094`

Use this bootstrap list from host tools:

```bash
localhost:19092,localhost:19093,localhost:19094
```

Use this bootstrap list from containers:

```bash
kafka-1:9092,kafka-2:9092,kafka-3:9092
```

## Existing Plain Kafka Cluster

For a non-SASL Kafka cluster, set only the bootstrap endpoints:

```bash
KAFKA_BROKERS=broker1:9092,broker2:9092 docker compose up --build
```

For local Node development, run the exporter directly:

```bash
KAFKA_BROKERS=localhost:19092,localhost:19093,localhost:19094 npm run metrics:exporter
```

## Confluent Cloud

Create a Confluent Cloud API key and secret for the cluster, then run:

```bash
KAFKA_BROKERS=pkc-example.us-east-1.aws.confluent.cloud:9092 \
KAFKA_SSL=true \
KAFKA_SASL_MECHANISM=plain \
KAFKA_SASL_USERNAME="<api-key>" \
KAFKA_SASL_PASSWORD="<api-secret>" \
docker compose up --build
```

The same values can be placed in a local `.env` file:

```env
KAFKA_BROKERS=pkc-example.us-east-1.aws.confluent.cloud:9092
KAFKA_SSL=true
KAFKA_SASL_MECHANISM=plain
KAFKA_SASL_USERNAME=<api-key>
KAFKA_SASL_PASSWORD=<api-secret>
PROMETHEUS_API=http://localhost:9090
```

Do not commit real API keys or secrets.

## Exported Metrics

The Lighthouse exporter emits generic Kafka metadata metrics:

- `lighthouse_kafka_exporter_up`
- `lighthouse_kafka_broker_count`
- `lighthouse_kafka_topic_count`
- `lighthouse_kafka_partition_count`
- `lighthouse_kafka_topic_partition_count`
- `lighthouse_kafka_topic_log_end_offset`
- `lighthouse_kafka_partition_current_offset`
- `lighthouse_kafka_total_log_end_offset`

These metrics are intentionally portable. They come from the Kafka Admin API,
so they work for local Kafka, managed Kafka, and Confluent Cloud without
requiring broker-side JMX configuration.
