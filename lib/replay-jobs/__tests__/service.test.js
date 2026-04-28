/** @jest-environment node */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { JOB_STATUSES, createReplayJobStore } = require('../store');
const {
  cancelReplayJob,
  createReplayJob,
  listReplayJobs,
  previewReplayJob,
  startReplayJob,
} = require('../service');

function createTempStore() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lighthouse-replay-service-'));
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

describe('Replay job service', () => {
  it('creates draft jobs from replay options and lists them', async () => {
    const { cleanup, store } = createTempStore();

    try {
      const job = await createReplayJob(
        {
          destination: 'orders-replay',
          'dry-run': true,
          end: '25',
          'job-id': 'job-123',
          'messages-per-second': '15',
          partition: '0',
          source: 'orders',
          start: '10',
        },
        {
          env: {
            KAFKA_BROKERS: 'localhost:19092',
          },
          now: () => '2026-04-28T13:45:00.000Z',
          store,
        }
      );

      expect(job).toMatchObject({
        destinationTopic: 'orders-replay',
        dryRun: true,
        endOffset: 25,
        jobId: 'job-123',
        messagesPerSecond: 15,
        partition: 0,
        progressInterval: 25,
        progressTotal: 16,
        replayMode: 'offset',
        replayedCount: 0,
        sourceTopic: 'orders',
        startOffset: 10,
        status: JOB_STATUSES.DRAFT,
      });
      expect(listReplayJobs({ store })).toEqual([job]);
    } finally {
      cleanup();
    }
  });

  it('resolves timestamp jobs before persisting the draft', async () => {
    const { cleanup, store } = createTempStore();
    const replayPlanResolver = jest.fn().mockResolvedValue({
      endOffset: 104,
      startOffset: 100,
      totalMessages: 5,
    });

    try {
      const job = await createReplayJob(
        {
          destination: 'orders-replay',
          'end-timestamp': '2026-04-28T14:08:00.000Z',
          'job-id': 'job-timestamp',
          partition: '0',
          source: 'orders',
          'start-timestamp': '2026-04-28T14:03:00.000Z',
        },
        {
          env: {
            KAFKA_BROKERS: 'localhost:19092',
          },
          now: () => '2026-04-28T14:02:00.000Z',
          replayPlanResolver,
          store,
        }
      );

      expect(replayPlanResolver).toHaveBeenCalledWith(
        expect.objectContaining({
          replayMode: 'timestamp',
          sourceTopic: 'orders',
        }),
        {
          env: {
            KAFKA_BROKERS: 'localhost:19092',
          },
        }
      );
      expect(job).toMatchObject({
        endOffset: 104,
        endTimestamp: '2026-04-28T14:08:00.000Z',
        jobId: 'job-timestamp',
        progressTotal: 5,
        replayMode: 'timestamp',
        startOffset: 100,
        startTimestamp: '2026-04-28T14:03:00.000Z',
        status: JOB_STATUSES.DRAFT,
      });
    } finally {
      cleanup();
    }
  });

  it('marks jobs completed and persists progress when the replay runner succeeds', async () => {
    const { cleanup, store } = createTempStore();

    try {
      await createReplayJob(
        {
          destination: 'orders-replay',
          end: '12',
          'job-id': 'job-complete',
          'messages-per-second': '8',
          partition: '0',
          source: 'orders',
          start: '11',
        },
        {
          env: {
            KAFKA_BROKERS: 'localhost:19092',
          },
          now: () => '2026-04-28T13:50:00.000Z',
          store,
        }
      );
      const replayTimestamps = [
        '2026-04-28T13:55:00.000Z',
        '2026-04-28T13:55:02.000Z',
        '2026-04-28T13:55:04.000Z',
        '2026-04-28T13:55:05.000Z',
      ];
      const now = jest.fn(() => replayTimestamps.shift());

      const updatedJob = await startReplayJob('job-complete', {
        env: {
          KAFKA_BROKERS: 'localhost:19092',
        },
        now,
        replayRunner: async (options, { onProgress }) => {
          expect(options['messages-per-second']).toBe('8');
          await onProgress({ lastReplayedOffset: 11, replayedCount: 1 });
          await onProgress({ lastReplayedOffset: 12, replayedCount: 2 });

          return {
            lastReplayedOffset: 12,
            replayedCount: 2,
          };
        },
        store,
      });

      expect(updatedJob).toMatchObject({
        completedAt: '2026-04-28T13:55:05.000Z',
        errorMessage: null,
        jobId: 'job-complete',
        lastReplayedOffset: 12,
        progress: {
          averageMessagesPerSecond: 0.4,
          currentOffset: 12,
          elapsedMs: 5000,
          estimatedRemainingMs: null,
          percent: 100,
          remainingCount: 0,
          replayedCount: 2,
          totalCount: 2,
        },
        replayedCount: 2,
        startedAt: '2026-04-28T13:55:00.000Z',
        status: JOB_STATUSES.COMPLETED,
      });
    } finally {
      cleanup();
    }
  });

  it('marks jobs failed on replay errors and can cancel draft jobs', async () => {
    const { cleanup, store } = createTempStore();

    try {
      await createReplayJob(
        {
          destination: 'orders-replay',
          end: '12',
          'job-id': 'job-failed',
          partition: '0',
          source: 'orders',
          start: '11',
        },
        {
          env: {
            KAFKA_BROKERS: 'localhost:19092',
          },
          now: () => '2026-04-28T14:00:00.000Z',
          store,
        }
      );
      await createReplayJob(
        {
          destination: 'payments-replay',
          end: '5',
          'job-id': 'job-cancel',
          partition: '1',
          source: 'payments',
          start: '0',
        },
        {
          env: {
            KAFKA_BROKERS: 'localhost:19092',
          },
          now: () => '2026-04-28T14:01:00.000Z',
          store,
        }
      );

      await expect(
        startReplayJob('job-failed', {
          env: {
            KAFKA_BROKERS: 'localhost:19092',
          },
          now: () => '2026-04-28T14:05:00.000Z',
          replayRunner: async () => {
            throw new Error('Kafka unavailable');
          },
          store,
        })
      ).rejects.toThrow('Kafka unavailable');

      expect(store.getJob('job-failed')).toMatchObject({
        completedAt: '2026-04-28T14:05:00.000Z',
        errorMessage: 'Kafka unavailable',
        status: JOB_STATUSES.FAILED,
      });

      expect(
        cancelReplayJob('job-cancel', {
          now: () => '2026-04-28T14:06:00.000Z',
          store,
        })
      ).toMatchObject({
        completedAt: '2026-04-28T14:06:00.000Z',
        jobId: 'job-cancel',
        status: JOB_STATUSES.CANCELLED,
      });
    } finally {
      cleanup();
    }
  });

  it('returns structured dry-run previews for persisted jobs', async () => {
    const { cleanup, store } = createTempStore();

    try {
      await createReplayJob(
        {
          destination: 'orders-replay',
          end: '12',
          'job-id': 'job-preview',
          partition: '0',
          source: 'orders',
          start: '10',
        },
        {
          env: {
            KAFKA_BROKERS: 'localhost:19092',
          },
          now: () => '2026-04-28T14:10:00.000Z',
          store,
        }
      );

      const preview = await previewReplayJob('job-preview', {
        env: {
          KAFKA_BROKERS: 'localhost:19092',
        },
        replayRunner: async (_options, { onPreviewMessage }) => {
          await onPreviewMessage({
            destinationTopic: 'orders-replay',
            headers: { 'x-replayed': 'true' },
            key: 'order-10',
            offset: 10,
            partition: 0,
            sourceTopic: 'orders',
            timestamp: '1714310000000',
            value: '{"orderId":"order-10"}',
          });

          return {
            destinationTopic: 'orders-replay',
            dryRun: true,
            endOffset: 12,
            lastReplayedOffset: 10,
            partition: 0,
            replayJobId: 'job-preview',
            replayedCount: 1,
            sourceTopic: 'orders',
            startOffset: 10,
            totalMessages: 3,
          };
        },
        store,
      });

      expect(preview.job).toMatchObject({
        jobId: 'job-preview',
        status: JOB_STATUSES.DRAFT,
      });
      expect(preview.previewMessages).toEqual([
        {
          destinationTopic: 'orders-replay',
          headers: { 'x-replayed': 'true' },
          key: 'order-10',
          offset: 10,
          partition: 0,
          sourceTopic: 'orders',
          timestamp: '1714310000000',
          value: '{"orderId":"order-10"}',
        },
      ]);
      expect(preview.summary).toMatchObject({
        dryRun: true,
        replayedCount: 1,
        totalMessages: 3,
      });
    } finally {
      cleanup();
    }
  });

  it('rejects invalid replay job list limits', () => {
    const { cleanup, store } = createTempStore();

    try {
      expect(() => listReplayJobs({ limit: 0, store })).toThrow(
        'Replay job list limit must be a positive integer'
      );
    } finally {
      cleanup();
    }
  });
});
