/** @jest-environment node */

const fs = require('fs');
const os = require('os');
const path = require('path');
const Database = require('better-sqlite3');
const {
  JOB_STATUSES,
  createProgressSnapshot,
  createReplayJobStore,
} = require('../store');

function createTempDbPath() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lighthouse-replay-store-'));
  return {
    cleanup: () => fs.rmSync(tempDir, { force: true, recursive: true }),
    dbPath: path.join(tempDir, 'jobs.sqlite'),
  };
}

describe('Replay job store', () => {
  it('creates and reads persisted replay jobs', () => {
    const { cleanup, dbPath } = createTempDbPath();
    const store = createReplayJobStore({ dbPath });

    try {
      const createdJob = store.createJob({
        clientId: 'lighthouse-replay-cli',
        completedAt: null,
        createdAt: '2026-04-28T13:20:00.000Z',
        destinationTopic: 'orders-replay',
        dryRun: true,
        endOffset: 25,
        endTimestamp: null,
        errorMessage: null,
        jobId: 'job-1',
        lastReplayedOffset: null,
        messagesPerSecond: 20,
        partition: 0,
        progressInterval: 25,
        progressTotal: 16,
        replayMode: 'offset',
        replayedCount: 0,
        sourceTopic: 'orders',
        startedAt: null,
        startOffset: 10,
        startTimestamp: null,
        status: JOB_STATUSES.DRAFT,
        updatedAt: '2026-04-28T13:20:00.000Z',
      });

      expect(createdJob).toEqual({
        clientId: 'lighthouse-replay-cli',
        completedAt: null,
        createdAt: '2026-04-28T13:20:00.000Z',
        destinationTopic: 'orders-replay',
        dryRun: true,
        endOffset: 25,
        endTimestamp: null,
        errorMessage: null,
        jobId: 'job-1',
        lastReplayedOffset: null,
        messagesPerSecond: 20,
        partition: 0,
        progressInterval: 25,
        progress: {
          averageMessagesPerSecond: null,
          currentOffset: null,
          elapsedMs: null,
          estimatedRemainingMs: null,
          percent: 0,
          remainingCount: 16,
          replayedCount: 0,
          totalCount: 16,
        },
        progressTotal: 16,
        replayMode: 'offset',
        replayedCount: 0,
        sourceTopic: 'orders',
        startedAt: null,
        startOffset: 10,
        startTimestamp: null,
        status: JOB_STATUSES.DRAFT,
        updatedAt: '2026-04-28T13:20:00.000Z',
      });
      expect(store.getJob('job-1')).toEqual(createdJob);
    } finally {
      store.close();
      cleanup();
    }
  });

  it('updates replay job progress and lists the newest jobs first', () => {
    const { cleanup, dbPath } = createTempDbPath();
    const store = createReplayJobStore({
      dbPath,
      now: () => '2026-04-28T13:30:00.000Z',
    });

    try {
      store.createJob({
        clientId: 'lighthouse-replay-cli',
        completedAt: null,
        createdAt: '2026-04-28T13:00:00.000Z',
        destinationTopic: 'orders-replay',
        dryRun: false,
        endOffset: 5,
        errorMessage: null,
        jobId: 'job-old',
        lastReplayedOffset: null,
        partition: 0,
        progressInterval: 25,
        progressTotal: 6,
        replayedCount: 0,
        sourceTopic: 'orders',
        startedAt: null,
        startOffset: 0,
        status: JOB_STATUSES.DRAFT,
        updatedAt: '2026-04-28T13:00:00.000Z',
      });
      store.createJob({
        clientId: 'lighthouse-replay-cli',
        completedAt: null,
        createdAt: '2026-04-28T13:10:00.000Z',
        destinationTopic: 'payments-replay',
        dryRun: true,
        endOffset: 15,
        errorMessage: null,
        jobId: 'job-new',
        lastReplayedOffset: null,
        partition: 1,
        progressInterval: 10,
        progressTotal: 6,
        replayedCount: 0,
        sourceTopic: 'payments',
        startedAt: null,
        startOffset: 10,
        status: JOB_STATUSES.DRAFT,
        updatedAt: '2026-04-28T13:10:00.000Z',
      });

      const runningJob = store.updateJob('job-new', {
        replayedCount: 3,
        startedAt: '2026-04-28T13:25:00.000Z',
        status: JOB_STATUSES.RUNNING,
      });

      expect(runningJob).toMatchObject({
        jobId: 'job-new',
        replayedCount: 3,
        startedAt: '2026-04-28T13:25:00.000Z',
        status: JOB_STATUSES.RUNNING,
        updatedAt: '2026-04-28T13:30:00.000Z',
        progress: {
          averageMessagesPerSecond: 0.01,
          currentOffset: null,
          elapsedMs: 300000,
          estimatedRemainingMs: 300000,
          percent: 50,
          remainingCount: 3,
          replayedCount: 3,
          totalCount: 6,
        },
      });
      expect(store.listJobs({ limit: 5 }).map((job) => job.jobId)).toEqual([
        'job-new',
        'job-old',
      ]);
    } finally {
      store.close();
      cleanup();
    }
  });

  it('adds replay mode columns when opening an older job database', () => {
    const { cleanup, dbPath } = createTempDbPath();
    const legacyDb = new Database(dbPath);

    legacyDb.exec(`
      CREATE TABLE replay_jobs (
        job_id TEXT PRIMARY KEY,
        source_topic TEXT NOT NULL,
        destination_topic TEXT NOT NULL,
        partition_id INTEGER NOT NULL,
        start_offset INTEGER NOT NULL,
        end_offset INTEGER NOT NULL,
        status TEXT NOT NULL,
        dry_run INTEGER NOT NULL DEFAULT 0,
        replayed_count INTEGER NOT NULL DEFAULT 0,
        progress_total INTEGER NOT NULL,
        client_id TEXT NOT NULL,
        progress_interval INTEGER NOT NULL,
        created_at TEXT NOT NULL,
        started_at TEXT,
        completed_at TEXT,
        error_message TEXT,
        last_replayed_offset INTEGER,
        updated_at TEXT NOT NULL
      );
      INSERT INTO replay_jobs (
        job_id,
        source_topic,
        destination_topic,
        partition_id,
        start_offset,
        end_offset,
        status,
        dry_run,
        replayed_count,
        progress_total,
        client_id,
        progress_interval,
        created_at,
        updated_at
      ) VALUES (
        'legacy-job',
        'orders',
        'orders-replay',
        0,
        1,
        2,
        'draft',
        0,
        0,
        2,
        'lighthouse-replay-cli',
        25,
        '2026-04-28T13:40:00.000Z',
        '2026-04-28T13:40:00.000Z'
      );
    `);
    legacyDb.close();

    const store = createReplayJobStore({ dbPath });

    try {
      expect(store.getJob('legacy-job')).toMatchObject({
        endTimestamp: null,
        jobId: 'legacy-job',
        messagesPerSecond: null,
        replayMode: 'offset',
        startTimestamp: null,
      });
    } finally {
      store.close();
      cleanup();
    }
  });

  it('creates derived progress snapshots from persisted replay job state', () => {
    expect(
      createProgressSnapshot({
        completedAt: null,
        lastReplayedOffset: 12,
        progressTotal: 4,
        replayedCount: 3,
        startedAt: '2026-04-28T13:25:00.000Z',
        status: JOB_STATUSES.RUNNING,
        updatedAt: '2026-04-28T13:25:03.000Z',
      })
    ).toEqual({
      averageMessagesPerSecond: 1,
      currentOffset: 12,
      elapsedMs: 3000,
      estimatedRemainingMs: 1000,
      percent: 75,
      remainingCount: 1,
      replayedCount: 3,
      totalCount: 4,
    });

    expect(
      createProgressSnapshot({
        completedAt: '2026-04-28T13:25:08.000Z',
        lastReplayedOffset: 13,
        progressTotal: 4,
        replayedCount: 4,
        startedAt: '2026-04-28T13:25:00.000Z',
        status: JOB_STATUSES.COMPLETED,
        updatedAt: '2026-04-28T13:25:08.000Z',
      })
    ).toMatchObject({
      averageMessagesPerSecond: 0.5,
      currentOffset: 13,
      elapsedMs: 8000,
      estimatedRemainingMs: null,
      percent: 100,
      remainingCount: 0,
    });
  });
});
