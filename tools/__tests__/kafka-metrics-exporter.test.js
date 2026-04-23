const http = require('http');
const {
  collectKafkaMetrics,
  createMetricsServer,
  renderErrorMetrics,
  renderMetric,
} = require('../kafka-metrics-exporter');

function requestServer(server, path) {
  return new Promise((resolve, reject) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();

      const request = http.get(
        {
          host: '127.0.0.1',
          path,
          port,
        },
        (response) => {
          let body = '';

          response.setEncoding('utf8');
          response.on('data', (chunk) => {
            body += chunk;
          });
          response.on('end', () => {
            server.close(() => {
              resolve({
                body,
                headers: response.headers,
                statusCode: response.statusCode,
              });
            });
          });
        }
      );

      request.on('error', (error) => {
        server.close(() => reject(error));
      });
    });
  });
}

describe('Kafka metrics exporter', () => {
  it('renders Prometheus labels with escaped quotes and backslashes', () => {
    expect(
      renderMetric('lighthouse_test_metric', 7, {
        topic: 'orders"primary\\0',
      })
    ).toBe('lighthouse_test_metric{topic="orders\\"primary\\\\0"} 7');
  });

  it('collects broker, topic, partition, and offset metrics from Kafka admin metadata', async () => {
    const admin = {
      connect: jest.fn().mockResolvedValue(undefined),
      describeCluster: jest.fn().mockResolvedValue({
        brokers: [{ nodeId: 1 }, { nodeId: 2 }, { nodeId: 3 }],
      }),
      disconnect: jest.fn().mockResolvedValue(undefined),
      fetchTopicOffsets: jest.fn((topic) => {
        const offsetsByTopic = {
          orders: [
            { offset: '10', partition: 0 },
            { offset: '5', partition: 1 },
          ],
          payments: [{ offset: '2', partition: 0 }],
        };

        return Promise.resolve(offsetsByTopic[topic]);
      }),
      listTopics: jest
        .fn()
        .mockResolvedValue(['orders', '__consumer_offsets', 'payments']),
    };
    const kafkaFactory = jest.fn().mockReturnValue({
      admin: () => admin,
    });

    const metrics = await collectKafkaMetrics(kafkaFactory, {
      KAFKA_CLIENT_ID: '',
    });

    expect(kafkaFactory).toHaveBeenCalledWith(
      expect.objectContaining({
        KAFKA_CLIENT_ID: 'lighthouse-metrics',
      })
    );
    expect(admin.connect).toHaveBeenCalledTimes(1);
    expect(admin.fetchTopicOffsets).toHaveBeenCalledTimes(2);
    expect(admin.fetchTopicOffsets).toHaveBeenNthCalledWith(1, 'orders');
    expect(admin.fetchTopicOffsets).toHaveBeenNthCalledWith(2, 'payments');
    expect(admin.disconnect).toHaveBeenCalledTimes(1);

    expect(metrics).toContain('lighthouse_kafka_exporter_up 1');
    expect(metrics).toContain('lighthouse_kafka_broker_count 3');
    expect(metrics).toContain('lighthouse_kafka_topic_count 2');
    expect(metrics).toContain('lighthouse_kafka_topic_partition_count{topic="orders"} 2');
    expect(metrics).toContain('lighthouse_kafka_topic_log_end_offset{topic="orders"} 15');
    expect(metrics).toContain(
      'lighthouse_kafka_partition_current_offset{topic="payments",partition="0"} 2'
    );
    expect(metrics).toContain('lighthouse_kafka_partition_count 3');
    expect(metrics).toContain('lighthouse_kafka_total_log_end_offset 17');
  });

  it('disconnects the admin client when metadata collection fails', async () => {
    const admin = {
      connect: jest.fn().mockResolvedValue(undefined),
      describeCluster: jest.fn().mockRejectedValue(new Error('metadata failed')),
      disconnect: jest.fn().mockResolvedValue(undefined),
    };
    const kafkaFactory = jest.fn().mockReturnValue({
      admin: () => admin,
    });

    await expect(collectKafkaMetrics(kafkaFactory)).rejects.toThrow(
      'metadata failed'
    );

    expect(admin.disconnect).toHaveBeenCalledTimes(1);
  });

  it('returns Prometheus error metrics without failing the scrape request', async () => {
    const server = createMetricsServer({
      collectMetrics: jest
        .fn()
        .mockRejectedValue(new Error('bad "auth" \\ failure')),
    });

    const response = await requestServer(server, '/metrics');

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain('text/plain');
    expect(response.body).toContain(
      'lighthouse_kafka_exporter_up{error="bad \\"auth\\" \\\\ failure"} 0'
    );
  });

  it('returns 404 for non-metrics routes', async () => {
    const server = createMetricsServer();

    const response = await requestServer(server, '/healthz');

    expect(response.statusCode).toBe(404);
    expect(response.body).toBe('Not found\n');
  });

  it('renders unknown errors with a stable fallback label', () => {
    expect(renderErrorMetrics({})).toContain(
      'lighthouse_kafka_exporter_up{error="unknown error"} 0'
    );
  });
});
