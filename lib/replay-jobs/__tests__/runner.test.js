/** @jest-environment node */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { createReplayJobStore, JOB_STATUSES } = require('../store');
const { createReplayJob } = require('../service');
const { createInMemoryReplayJobRunner } = require('../runner');

function createTempStore() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lighthouse-replay-runner-'));
  const dbPath = path.join(tempDir, 'jobs.sqlite');
  const store = createReplayJobStore({ dbPath });

  return {
    cleanup: () => {
      store.close();
      fs.rmSync(tempDir, { force: true, recursive: true });
    },
    dbPath,
    store,
  };
}

describe('Replay job runner', () => {
  it('starts jobs in the background and persists the completed result', async () => {
    const { cleanup, dbPath, store } = createTempStore();

    try {
      createReplayJob(
        {
          destination: 'orders-replay',
          end: '12',
          'job-id': 'job-background',
          partition: '0',
          source: 'orders',
          start: '11',
        },
        {
          env: {
            KAFKA_BROKERS: 'localhost:19092',
          },
          now: () => '2026-04-28T16:00:00.000Z',
          store,
        }
      );

      const runner = createInMemoryReplayJobRunner();
      const runningJob = runner.start('job-background', {
        env: {
          KAFKA_BROKERS: 'localhost:19092',
          LIGHTHOUSE_DB_PATH: dbPath,
        },
        now: () => '2026-04-28T16:05:00.000Z',
        replayRunner: async (_options, { onProgress }) => {
          await onProgress({ lastReplayedOffset: 11, replayedCount: 1 });
          await onProgress({ lastReplayedOffset: 12, replayedCount: 2 });

          return {
            lastReplayedOffset: 12,
            replayedCount: 2,
          };
        },
      });

      expect(runningJob).toMatchObject({
        jobId: 'job-background',
        startedAt: '2026-04-28T16:05:00.000Z',
        status: JOB_STATUSES.RUNNING,
      });
      expect(runner.isRunning('job-background')).toBe(true);

      await runner.waitForJob('job-background');

      const completedJob = store.getJob('job-background');
      expect(completedJob).toMatchObject({
        completedAt: '2026-04-28T16:05:00.000Z',
        lastReplayedOffset: 12,
        replayedCount: 2,
        status: JOB_STATUSES.COMPLETED,
      });
      expect(runner.isRunning('job-background')).toBe(false);
    } finally {
      cleanup();
    }
  });
});
