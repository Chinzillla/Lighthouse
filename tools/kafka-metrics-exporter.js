const http = require('http');
const { createKafka } = require('./kafka-config');

const METRICS_PORT = Number(process.env.METRICS_PORT || 9308);
const INTERNAL_TOPICS = new Set(['__consumer_offsets']);

function escapeLabel(value) {
  return String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function renderMetric(name, value, labels = {}) {
  const labelPairs = Object.entries(labels);
  const renderedLabels = labelPairs.length
    ? `{${labelPairs
        .map(([key, labelValue]) => `${key}="${escapeLabel(labelValue)}"`)
        .join(',')}}`
    : '';

  return `${name}${renderedLabels} ${Number(value) || 0}`;
}

async function collectKafkaMetrics(kafkaFactory = createKafka, env = process.env) {
  const startedAt = Date.now();
  const kafka = kafkaFactory({
    ...env,
    KAFKA_CLIENT_ID: env.KAFKA_CLIENT_ID || 'lighthouse-metrics',
  });
  const admin = kafka.admin();

  await admin.connect();

  try {
    const cluster = await admin.describeCluster();
    const topics = (await admin.listTopics()).filter(
      (topic) => !INTERNAL_TOPICS.has(topic)
    );

    const lines = [
      '# HELP lighthouse_kafka_exporter_up Whether the Lighthouse Kafka exporter can reach Kafka.',
      '# TYPE lighthouse_kafka_exporter_up gauge',
      renderMetric('lighthouse_kafka_exporter_up', 1),
      '# HELP lighthouse_kafka_broker_count Number of brokers visible to the Kafka client.',
      '# TYPE lighthouse_kafka_broker_count gauge',
      renderMetric('lighthouse_kafka_broker_count', cluster.brokers.length),
      '# HELP lighthouse_kafka_topic_count Number of non-internal Kafka topics.',
      '# TYPE lighthouse_kafka_topic_count gauge',
      renderMetric('lighthouse_kafka_topic_count', topics.length),
      '# HELP lighthouse_kafka_topic_partition_count Partitions per non-internal Kafka topic.',
      '# TYPE lighthouse_kafka_topic_partition_count gauge',
      '# HELP lighthouse_kafka_topic_log_end_offset Sum of latest offsets per topic.',
      '# TYPE lighthouse_kafka_topic_log_end_offset gauge',
      '# HELP lighthouse_kafka_partition_current_offset Latest offset for a topic partition.',
      '# TYPE lighthouse_kafka_partition_current_offset gauge',
    ];

    let totalPartitions = 0;
    let totalLogEndOffset = 0;

    for (const topic of topics) {
      const offsets = await admin.fetchTopicOffsets(topic);
      const topicLogEndOffset = offsets.reduce(
        (sum, partition) => sum + Number(partition.offset || 0),
        0
      );

      totalPartitions += offsets.length;
      totalLogEndOffset += topicLogEndOffset;

      lines.push(
        renderMetric('lighthouse_kafka_topic_partition_count', offsets.length, {
          topic,
        })
      );
      lines.push(
        renderMetric('lighthouse_kafka_topic_log_end_offset', topicLogEndOffset, {
          topic,
        })
      );

      offsets.forEach((partition) => {
        lines.push(
          renderMetric(
            'lighthouse_kafka_partition_current_offset',
            partition.offset,
            {
              topic,
              partition: partition.partition,
            }
          )
        );
      });
    }

    lines.push(
      '# HELP lighthouse_kafka_partition_count Number of non-internal Kafka topic partitions.'
    );
    lines.push('# TYPE lighthouse_kafka_partition_count gauge');
    lines.push(renderMetric('lighthouse_kafka_partition_count', totalPartitions));
    lines.push(
      '# HELP lighthouse_kafka_total_log_end_offset Sum of latest offsets across all non-internal topics.'
    );
    lines.push('# TYPE lighthouse_kafka_total_log_end_offset gauge');
    lines.push(renderMetric('lighthouse_kafka_total_log_end_offset', totalLogEndOffset));
    lines.push(
      '# HELP lighthouse_kafka_scrape_duration_seconds Time spent collecting Kafka metadata.'
    );
    lines.push('# TYPE lighthouse_kafka_scrape_duration_seconds gauge');
    lines.push(
      renderMetric(
        'lighthouse_kafka_scrape_duration_seconds',
        (Date.now() - startedAt) / 1000
      )
    );

    return `${lines.join('\n')}\n`;
  } finally {
    await admin.disconnect();
  }
}

function renderErrorMetrics(error) {
  const message = error.message || 'unknown error';

  return [
    '# HELP lighthouse_kafka_exporter_up Whether the Lighthouse Kafka exporter can reach Kafka.',
    '# TYPE lighthouse_kafka_exporter_up gauge',
    renderMetric('lighthouse_kafka_exporter_up', 0, { error: message }),
    '',
  ].join('\n');
}

function createMetricsServer({ collectMetrics = collectKafkaMetrics } = {}) {
  return http.createServer(async (request, response) => {
    if (request.url !== '/metrics') {
      response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      response.end('Not found\n');
      return;
    }

    try {
      const metrics = await collectMetrics();
      response.writeHead(200, {
        'content-type': 'text/plain; version=0.0.4; charset=utf-8',
      });
      response.end(metrics);
    } catch (error) {
      response.writeHead(200, {
        'content-type': 'text/plain; version=0.0.4; charset=utf-8',
      });
      response.end(renderErrorMetrics(error));
    }
  });
}

function startMetricsServer({ port = METRICS_PORT, host = '0.0.0.0' } = {}) {
  const server = createMetricsServer();

  server.listen(port, host, () => {
    console.log(`Kafka metrics exporter listening on :${port}/metrics`);
  });

  return server;
}

if (require.main === module) {
  startMetricsServer();
}

module.exports = {
  collectKafkaMetrics,
  createMetricsServer,
  escapeLabel,
  renderErrorMetrics,
  renderMetric,
  startMetricsServer,
};
