const { RESTDataSource } = require('apollo-datasource-rest');

const EMPTY_PROMETHEUS_RESPONSE = {
  status: 'success',
  data: {
    resultType: 'vector',
    result: [],
  },
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
    return this.queryMetric('confluent_kafka_server_partition_count', 180);
  }
  
  async getReceivedBytes(){
    return this.queryMetric('confluent_kafka_server_received_bytes', 500);
  }

  async getRetainedBytes(){
    return this.queryMetric('confluent_kafka_server_retained_bytes', 500);
  }

  async getSentBytes(){
    return this.queryMetric('confluent_kafka_server_sent_bytes', 540);
  }

  async getSentRecords(){
    return this.queryMetric('confluent_kafka_server_sent_records', 540);
  }

  async getReceivedRecords(){
    return this.queryMetric('confluent_kafka_server_received_records', 180);
  }

  async getAuthCount(){
    return this.queryMetric('confluent_kafka_server_successful_authentication_count', 180);
  }

  async getActiveConnectionCount(){
    return this.queryMetric('confluent_kafka_server_active_connection_count', 180);
  }
}
