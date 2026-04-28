/** @jest-environment node */

process.env.KAFKAJS_NO_PARTITIONER_WARNING = '1';

const { createKafka } = require('../kafka-config');
const { runReplay } = require('../kafka-replay');

jest.setTimeout(45000);

const integrationEnabled = process.env.KAFKA_INTEGRATION === '1';
const describeIfKafka = integrationEnabled ? describe : describe.skip;
const TEST_BROKERS =
  process.env.KAFKA_BROKERS || 'localhost:19092,localhost:19093,localhost:19094';

function uniqueId() {
  return `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}

async function readMatchingMessages(kafka, topic, expectedCount, matchesMessage) {
  const consumer = kafka.consumer({
    groupId: `lighthouse-replay-readback-${uniqueId()}`,
  });
  const matches = [];
  let stopRequested = false;

  let resolveCompletion;
  let rejectCompletion;
  const completion = new Promise((resolve, reject) => {
    resolveCompletion = resolve;
    rejectCompletion = reject;
  });

  await consumer.connect();

  try {
    await consumer.subscribe({ fromBeginning: true, topic });
    consumer.on(consumer.events.STOP, () => {
      resolveCompletion(matches);
    });
    consumer.on(consumer.events.CRASH, (event) => {
      rejectCompletion(event?.payload?.error || new Error('Kafka consumer crashed'));
    });

    consumer
      .run({
        autoCommit: false,
        eachMessage: async ({ message, partition }) => {
          const normalizedMessage = {
            headers: message.headers || {},
            key: message.key ? message.key.toString() : null,
            offset: Number(message.offset),
            partition,
            value: message.value ? message.value.toString() : null,
          };

          if (!matchesMessage(normalizedMessage)) {
            return;
          }

          matches.push(normalizedMessage);

          if (matches.length === expectedCount && !stopRequested) {
            stopRequested = true;
            consumer.stop().catch((error) => {
              rejectCompletion(error);
            });
          }
        },
      })
      .catch((error) => {
        rejectCompletion(error);
      });

    let timeoutId;

    try {
      const collectedMessages = await Promise.race([
        completion,
        new Promise((_, reject) => {
          timeoutId = setTimeout(() => {
            reject(new Error(`Timed out waiting for ${expectedCount} messages from ${topic}`));
          }, 20000);
        }),
      ]);

      return collectedMessages;
    } finally {
      clearTimeout(timeoutId);
    }
  } finally {
    await consumer.disconnect();
  }
}

async function getNextOffset(admin, topic, partition) {
  const partitionOffsets = await admin.fetchTopicOffsets(topic);
  const match = partitionOffsets.find((entry) => entry.partition === partition);

  if (!match) {
    throw new Error(`Topic ${topic} does not have partition ${partition}`);
  }

  return Number(match.high || match.offset || 0);
}

describeIfKafka('Kafka replay integration', () => {
  it('copies the requested offset range into the destination topic with replay headers', async () => {
    const kafka = createKafka({
      ...process.env,
      KAFKA_BROKERS: TEST_BROKERS,
      KAFKA_CLIENT_ID: 'lighthouse-replay-integration',
    });
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
    const kafka = createKafka({
      ...process.env,
      KAFKA_BROKERS: TEST_BROKERS,
      KAFKA_CLIENT_ID: 'lighthouse-replay-dry-run-integration',
    });
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
});
