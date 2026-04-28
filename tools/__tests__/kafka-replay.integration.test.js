/** @jest-environment node */

process.env.KAFKAJS_NO_PARTITIONER_WARNING = '1';

const { runReplay } = require('../kafka-replay');
const {
  TEST_BROKERS,
  createKafkaTestClient,
  getNextOffset,
  readMatchingMessages,
  uniqueId,
} = require('../test-helpers/kafka');

jest.setTimeout(45000);

const integrationEnabled = process.env.KAFKA_INTEGRATION === '1';
const describeIfKafka = integrationEnabled ? describe : describe.skip;

describeIfKafka('Kafka replay integration', () => {
  function sleep(ms) {
    return new Promise((resolve) => {
      setTimeout(resolve, ms);
    });
  }

  async function waitForTopic(admin, topic) {
    let lastError;

    for (let attempt = 0; attempt < 20; attempt += 1) {
      try {
        const offsets = await admin.fetchTopicOffsets(topic);

        if (offsets.some((entry) => entry.partition === 0)) {
          return;
        }
      } catch (error) {
        lastError = error;
      }

      await sleep(500);
    }

    throw lastError || new Error(`Timed out waiting for topic ${topic}`);
  }

  async function createIsolatedReplayTopics(admin, prefix) {
    const sourceTopic = `${prefix}-source-${uniqueId()}`;
    const destinationTopic = `${prefix}-destination-${uniqueId()}`;

    await admin.createTopics({
      waitForLeaders: false,
      topics: [
        {
          numPartitions: 1,
          replicationFactor: 3,
          topic: sourceTopic,
        },
        {
          numPartitions: 1,
          replicationFactor: 3,
          topic: destinationTopic,
        },
      ],
    });
    await Promise.all([
      waitForTopic(admin, sourceTopic),
      waitForTopic(admin, destinationTopic),
    ]);

    return {
      destinationTopic,
      sourceTopic,
    };
  }

  it('copies the requested offset range into the destination topic with replay headers', async () => {
    const kafka = createKafkaTestClient('lighthouse-replay-integration');
    const admin = kafka.admin();
    const producer = kafka.producer();
    const sourceTopic = 'payments';
    const destinationTopic = 'orders-replay';
    const partition = 0;
    const runId = `replay-${uniqueId()}`;
    const replayJobId = `job-${uniqueId()}`;

    await admin.connect();
    await producer.connect();

    try {
      const sourceNextOffsetBefore = await getNextOffset(admin, sourceTopic, partition);

      await producer.send({
        topic: sourceTopic,
        messages: [
          {
            headers: { 'x-replay-integration-run': runId },
            key: `order-${runId}-1`,
            partition,
            value: JSON.stringify({ orderId: `order-${runId}-1`, status: 'created' }),
          },
          {
            headers: { 'x-replay-integration-run': runId },
            key: `order-${runId}-2`,
            partition,
            value: JSON.stringify({ orderId: `order-${runId}-2`, status: 'paid' }),
          },
          {
            headers: { 'x-replay-integration-run': runId },
            key: `order-${runId}-3`,
            partition,
            value: JSON.stringify({ orderId: `order-${runId}-3`, status: 'packed' }),
          },
        ],
      });

      const summary = await runReplay(
        {
          destination: destinationTopic,
          end: String(sourceNextOffsetBefore + 2),
          'job-id': replayJobId,
          partition: String(partition),
          source: sourceTopic,
          start: String(sourceNextOffsetBefore + 1),
        },
        {
          env: {
            ...process.env,
            KAFKA_BROKERS: TEST_BROKERS,
          },
          logger: {
            log: jest.fn(),
          },
        }
      );

      expect(summary).toMatchObject({
        destinationTopic,
        dryRun: false,
        endOffset: sourceNextOffsetBefore + 2,
        partition,
        replayedCount: 2,
        replayJobId,
        sourceTopic,
        startOffset: sourceNextOffsetBefore + 1,
        totalMessages: 2,
      });

      const replayedMessages = await readMatchingMessages(
        kafka,
        destinationTopic,
        2,
        (message) =>
          message.partition === partition &&
          message.headers['x-replay-integration-run'] &&
          message.headers['x-replay-integration-run'].toString() === runId
      );

      expect(replayedMessages).toEqual([
        {
          headers: {
            'x-original-offset': expect.any(Buffer),
            'x-original-partition': expect.any(Buffer),
            'x-original-topic': expect.any(Buffer),
            'x-replay-job-id': expect.any(Buffer),
            'x-replayed': expect.any(Buffer),
            'x-replay-integration-run': expect.any(Buffer),
          },
          key: `order-${runId}-2`,
          offset: expect.any(Number),
          partition,
          value: JSON.stringify({ orderId: `order-${runId}-2`, status: 'paid' }),
        },
        {
          headers: {
            'x-original-offset': expect.any(Buffer),
            'x-original-partition': expect.any(Buffer),
            'x-original-topic': expect.any(Buffer),
            'x-replay-job-id': expect.any(Buffer),
            'x-replayed': expect.any(Buffer),
            'x-replay-integration-run': expect.any(Buffer),
          },
          key: `order-${runId}-3`,
          offset: expect.any(Number),
          partition,
          value: JSON.stringify({ orderId: `order-${runId}-3`, status: 'packed' }),
        },
      ]);
      expect(replayedMessages[0].headers['x-replay-job-id'].toString()).toBe(replayJobId);
      expect(replayedMessages[0].headers['x-replayed'].toString()).toBe('true');
      expect(replayedMessages[0].headers['x-original-topic'].toString()).toBe(sourceTopic);
      expect(replayedMessages[0].headers['x-original-partition'].toString()).toBe('0');
      expect(replayedMessages[0].headers['x-original-offset'].toString()).toBe(
        String(sourceNextOffsetBefore + 1)
      );
      expect(replayedMessages[1].headers['x-original-offset'].toString()).toBe(
        String(sourceNextOffsetBefore + 2)
      );
    } finally {
      await producer.disconnect();
      await admin.disconnect();
    }
  });

  it('does not write to the destination topic during dry-run preview', async () => {
    const kafka = createKafkaTestClient('lighthouse-replay-dry-run-integration');
    const admin = kafka.admin();
    const producer = kafka.producer();
    const sourceTopic = 'payments';
    const destinationTopic = 'orders-replay';
    const partition = 0;
    const runId = `preview-${uniqueId()}`;

    await admin.connect();
    await producer.connect();

    try {
      const sourceNextOffsetBefore = await getNextOffset(admin, sourceTopic, partition);
      const destinationNextOffsetBefore = await getNextOffset(
        admin,
        destinationTopic,
        partition
      );

      await producer.send({
        topic: sourceTopic,
        messages: [
          {
            headers: { 'x-replay-integration-run': runId },
            key: `order-${runId}-1`,
            partition,
            value: JSON.stringify({ orderId: `order-${runId}-1`, status: 'created' }),
          },
          {
            headers: { 'x-replay-integration-run': runId },
            key: `order-${runId}-2`,
            partition,
            value: JSON.stringify({ orderId: `order-${runId}-2`, status: 'paid' }),
          },
        ],
      });

      const summary = await runReplay(
        {
          destination: destinationTopic,
          'dry-run': true,
          end: String(sourceNextOffsetBefore + 1),
          'job-id': `preview-job-${uniqueId()}`,
          partition: String(partition),
          source: sourceTopic,
          start: String(sourceNextOffsetBefore),
        },
        {
          env: {
            ...process.env,
            KAFKA_BROKERS: TEST_BROKERS,
          },
          logger: {
            log: jest.fn(),
          },
        }
      );

      const destinationNextOffsetAfter = await getNextOffset(admin, destinationTopic, partition);

      expect(summary).toMatchObject({
        destinationTopic,
        dryRun: true,
        replayedCount: 2,
        sourceTopic,
      });
      expect(destinationNextOffsetAfter).toBe(destinationNextOffsetBefore);
    } finally {
      await producer.disconnect();
      await admin.disconnect();
    }
  });

  it('resolves timestamp windows and replays only the matching records', async () => {
    const kafka = createKafkaTestClient('lighthouse-replay-timestamp-integration');
    const admin = kafka.admin();
    const producer = kafka.producer();
    const partition = 0;
    const runId = `timestamp-${uniqueId()}`;
    const replayJobId = `timestamp-job-${uniqueId()}`;
    let sourceTopic;
    let destinationTopic;

    await admin.connect();
    await producer.connect();

    try {
      ({ sourceTopic, destinationTopic } = await createIsolatedReplayTopics(
        admin,
        'lighthouse-timestamp'
      ));

      const baseTimestamp = Date.now() + 60000;
      const timestamps = [
        baseTimestamp,
        baseTimestamp + 1000,
        baseTimestamp + 2000,
        baseTimestamp + 3000,
      ];

      await producer.send({
        topic: sourceTopic,
        messages: timestamps.map((timestamp, index) => ({
          headers: { 'x-replay-integration-run': runId },
          key: `timestamp-${runId}-${index}`,
          partition,
          timestamp: String(timestamp),
          value: JSON.stringify({
            orderId: `timestamp-${runId}-${index}`,
            status: `state-${index}`,
          }),
        })),
      });

      const summary = await runReplay(
        {
          destination: destinationTopic,
          'end-timestamp': new Date(timestamps[3]).toISOString(),
          'job-id': replayJobId,
          partition: String(partition),
          source: sourceTopic,
          'start-timestamp': new Date(timestamps[1]).toISOString(),
        },
        {
          env: {
            ...process.env,
            KAFKA_BROKERS: TEST_BROKERS,
          },
          logger: {
            log: jest.fn(),
          },
        }
      );

      expect(summary).toMatchObject({
        destinationTopic,
        dryRun: false,
        endOffset: 2,
        endTimestamp: new Date(timestamps[3]).toISOString(),
        partition,
        replayMode: 'timestamp',
        replayedCount: 2,
        replayJobId,
        sourceTopic,
        startOffset: 1,
        startTimestamp: new Date(timestamps[1]).toISOString(),
        totalMessages: 2,
      });

      const replayedMessages = await readMatchingMessages(
        kafka,
        destinationTopic,
        2,
        (message) =>
          message.partition === partition &&
          message.headers['x-replay-integration-run'] &&
          message.headers['x-replay-integration-run'].toString() === runId
      );

      expect(replayedMessages.map((message) => message.key)).toEqual([
        `timestamp-${runId}-1`,
        `timestamp-${runId}-2`,
      ]);
      expect(replayedMessages[0].headers['x-replay-job-id'].toString()).toBe(
        replayJobId
      );
      expect(replayedMessages[0].headers['x-original-offset'].toString()).toBe('1');
      expect(replayedMessages[1].headers['x-original-offset'].toString()).toBe('2');
    } finally {
      await producer.disconnect();

      if (sourceTopic && destinationTopic) {
        await admin.deleteTopics({
          topics: [sourceTopic, destinationTopic],
        });
      }

      await admin.disconnect();
    }
  });
});
