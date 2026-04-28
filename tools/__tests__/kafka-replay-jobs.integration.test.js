/** @jest-environment node */

process.env.KAFKAJS_NO_PARTITIONER_WARNING = '1';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { createReplayJobStore } = require('../../lib/replay-jobs/store');
const { createReplayJob, startReplayJob } = require('../../lib/replay-jobs/service');
const {
  TEST_BROKERS,
  createKafkaTestClient,
  getNextOffset,
  readMatchingMessages,
  uniqueId,
} = require('./kafka-test-helpers');

jest.setTimeout(45000);

const integrationEnabled = process.env.KAFKA_INTEGRATION === '1';
const describeIfKafka = integrationEnabled ? describe : describe.skip;

function createTempStore() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lighthouse-replay-jobs-'));
  const store = createReplayJobStore({
    dbPath: path.join(tempDir, 'jobs.sqlite'),
  });

  return {
    cleanup: () => {
      store.close();
      fs.rmSync(tempDir, { force: true, recursive: true });
    },
    store,
  };
}

describeIfKafka('Replay jobs integration', () => {
  it('persists a replay job and marks it completed after a live Kafka replay', async () => {
    const { cleanup, store } = createTempStore();
    const kafka = createKafkaTestClient('lighthouse-replay-jobs-integration');
    const admin = kafka.admin();
    const producer = kafka.producer();
    const sourceTopic = 'payments';
    const destinationTopic = 'orders-replay';
    const partition = 0;
    const runId = `jobs-${uniqueId()}`;

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

      const job = createReplayJob(
        {
          destination: destinationTopic,
          end: String(sourceNextOffsetBefore + 2),
          'job-id': `job-${uniqueId()}`,
          partition: String(partition),
          source: sourceTopic,
          start: String(sourceNextOffsetBefore + 1),
        },
        {
          env: {
            KAFKA_BROKERS: TEST_BROKERS,
          },
          store,
        }
      );

      const completedJob = await startReplayJob(job.jobId, {
        env: {
          KAFKA_BROKERS: TEST_BROKERS,
        },
        logger: {
          log: jest.fn(),
        },
        store,
      });

      expect(completedJob).toMatchObject({
        destinationTopic,
        errorMessage: null,
        jobId: job.jobId,
        replayedCount: 2,
        sourceTopic,
        status: 'completed',
      });
      expect(store.getJob(job.jobId)).toMatchObject({
        completedAt: expect.any(String),
        replayedCount: 2,
        status: 'completed',
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

      expect(replayedMessages[0].headers['x-replay-job-id'].toString()).toBe(job.jobId);
      expect(replayedMessages[0].headers['x-original-offset'].toString()).toBe(
        String(sourceNextOffsetBefore + 1)
      );
      expect(replayedMessages[1].headers['x-original-offset'].toString()).toBe(
        String(sourceNextOffsetBefore + 2)
      );
    } finally {
      await producer.disconnect();
      await admin.disconnect();
      cleanup();
    }
  });
});
