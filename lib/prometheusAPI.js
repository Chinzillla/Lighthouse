const { RESTDataSource } = require('apollo-datasource-rest');

const METRIC_EXPRESSIONS = {
  brokerCount:
    'max(lighthouse_kafka_broker_count) or max(confluent_kafka_server_active_connection_count)',
  exporterUp:
    'max(lighthouse_kafka_exporter_up) or max(confluent_kafka_server_successful_authentication_count)',
  partitionCount:
    'sum(lighthouse_kafka_partition_count) or sum(confluent_kafka_server_partition_count)',
  topicCount:
    'max(lighthouse_kafka_topic_count) or count(count by (topic) (confluent_kafka_server_retained_bytes))',
  totalLogEndOffset:
    'sum(lighthouse_kafka_total_log_end_offset) or sum(confluent_kafka_server_received_records)',
};

function firstPrometheusValue(response) {
  return response?.data?.result?.find((entry) => entry?.value?.[1] !== undefined)
    ?.value?.[1] ?? '0';
}

function readEnv(name) {
  // Resolve at request time because the Next server bundle can snapshot process.env.
  const runtimeEnv = Function('return process.env')();

  return runtimeEnv[name];
}

export class PrometheusAPI extends RESTDataSource {
  getBaseURL() {
    const apiUrl = readEnv('PROMETHEUS_API');

    return apiUrl ? `${apiUrl.replace(/\/$/, '')}/` : undefined;
  }

  async queryMetric(metricName, secondsAgo) {
    this.baseURL = this.getBaseURL();

    if (!this.baseURL) {
      throw new Error('PROMETHEUS_API is not configured for Lighthouse runtime');
    }

    const timestamp = Math.floor(Date.now() / 1000) - secondsAgo;
    const query = encodeURIComponent(metricName);

    return this.get(`api/v1/query?query=${query}&time=${timestamp}`);
  }

  async getDashboardMetrics() {
    const [
      brokerCount,
      exporterUp,
      partitionCount,
      topicCount,
      totalLogEndOffset,
    ] = await Promise.all([
      this.queryMetric(METRIC_EXPRESSIONS.brokerCount, 60),
      this.queryMetric(METRIC_EXPRESSIONS.exporterUp, 60),
      this.queryMetric(METRIC_EXPRESSIONS.partitionCount, 60),
      this.queryMetric(METRIC_EXPRESSIONS.topicCount, 60),
      this.queryMetric(METRIC_EXPRESSIONS.totalLogEndOffset, 60),
    ]);

    return {
      status: 'ok',
      brokerCount: firstPrometheusValue(brokerCount),
      exporterUp: firstPrometheusValue(exporterUp),
      partitionCount: firstPrometheusValue(partitionCount),
      topicCount: firstPrometheusValue(topicCount),
      totalLogEndOffset: firstPrometheusValue(totalLogEndOffset),
    };
  }
}

export { firstPrometheusValue, METRIC_EXPRESSIONS, readEnv };
