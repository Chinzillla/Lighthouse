/** @jest-environment node */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { JOB_STATUSES, createReplayJobStore } = require('../store');
const {
  cancelReplayJob,
  createReplayJob,
  listReplayJobs,
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
  it('creates draft jobs from replay options and lists them', () => {
    const { cleanup, store } = createTempStore();

    try {
      const job = createReplayJob(
        {
          destination: 'orders-replay',
          'dry-run': true,
          end: '25',
          'job-id': 'job-123',
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
        partition: 0,
        progressInterval: 25,
        progressTotal: 16,
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

  it('marks jobs completed and persists progress when the replay runner succeeds', async () => {
    const { cleanup, store } = createTempStore();

    try {
      createReplayJob(
        {
          destination: 'orders-replay',
          end: '12',
          'job-id': 'job-complete',
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

      const updatedJob = await startReplayJob('job-complete', {
        env: {
          KAFKA_BROKERS: 'localhost:19092',
        },
        now: () => '2026-04-28T13:55:00.000Z',
        replayRunner: async (_options, { onProgress }) => {
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
        completedAt: '2026-04-28T13:55:00.000Z',
        errorMessage: null,
        jobId: 'job-complete',
        lastReplayedOffset: 12,
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
      createReplayJob(
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
      createReplayJob(
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
});
