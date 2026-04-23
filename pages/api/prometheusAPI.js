const { RESTDataSource } = require('apollo-datasource-rest');

const EMPTY_PROMETHEUS_RESPONSE = {
  status: 'success',
  data: {
    resultType: 'vector',
    result: [],
  },
};

const METRIC_EXPRESSIONS = {
  activeConnectionCount:
    'lighthouse_kafka_broker_count or confluent_kafka_server_active_connection_count',
  authCount:
    'lighthouse_kafka_exporter_up or confluent_kafka_server_successful_authentication_count',
  partitionCount:
    'lighthouse_kafka_partition_count or confluent_kafka_server_partition_count',
  receivedBytes:
    'lighthouse_kafka_total_log_end_offset or confluent_kafka_server_received_bytes',
  receivedRecords:
    'lighthouse_kafka_total_log_end_offset or confluent_kafka_server_received_records',
  retainedBytes:
    'lighthouse_kafka_topic_count or confluent_kafka_server_retained_bytes',
  sentBytes: 'confluent_kafka_server_sent_bytes',
  sentRecords: 'confluent_kafka_server_sent_records',
};

export class PrometheusAPI extends RESTDataSource {
  constructor() {
    super();
    const apiUrl = process.env.PROMETHEUS_API;
    this.baseURL = apiUrl ? `${apiUrl.replace(/\/$/, '')}/` : undefined;
  }

  async queryMetric(metricName, secondsAgo) {
    if (!this.baseURL) return EMPTY_PROMETHEUS_RESPONSE;

    const timestamp = Math.floor(Date.now() / 1000) - secondsAgo;
    const query = encodeURIComponent(metricName);

    return this.get(`api/v1/query?query=${query}&time=${timestamp}`);
  }
  
  async getPartitionCount() {
    return this.queryMetric(METRIC_EXPRESSIONS.partitionCount, 180);
  }
  
  async getReceivedBytes(){
    return this.queryMetric(METRIC_EXPRESSIONS.receivedBytes, 500);
  }

  async getRetainedBytes(){
    return this.queryMetric(METRIC_EXPRESSIONS.retainedBytes, 500);
  }

  async getSentBytes(){
    return this.queryMetric(METRIC_EXPRESSIONS.sentBytes, 540);
  }

  async getSentRecords(){
    return this.queryMetric(METRIC_EXPRESSIONS.sentRecords, 540);
  }

  async getReceivedRecords(){
    return this.queryMetric(METRIC_EXPRESSIONS.receivedRecords, 180);
  }

  async getAuthCount(){
    return this.queryMetric(METRIC_EXPRESSIONS.authCount, 180);
  }

  async getActiveConnectionCount(){
    return this.queryMetric(METRIC_EXPRESSIONS.activeConnectionCount, 180);
  }
}
