const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

const JOB_STATUSES = Object.freeze({
  CANCELLED: 'cancelled',
  COMPLETED: 'completed',
  DRAFT: 'draft',
  FAILED: 'failed',
  RUNNING: 'running',
});

const DEFAULT_DB_PATH = path.join(
  /* turbopackIgnore: true */ process.cwd(),
  'data',
  'lighthouse.sqlite'
);

const COLUMN_MAP = {
  clientId: 'client_id',
  completedAt: 'completed_at',
  createdAt: 'created_at',
  destinationTopic: 'destination_topic',
  dryRun: 'dry_run',
  endOffset: 'end_offset',
  errorMessage: 'error_message',
  jobId: 'job_id',
  lastReplayedOffset: 'last_replayed_offset',
  partition: 'partition_id',
  progressInterval: 'progress_interval',
  progressTotal: 'progress_total',
  replayedCount: 'replayed_count',
  sourceTopic: 'source_topic',
  startedAt: 'started_at',
  startOffset: 'start_offset',
  status: 'status',
  updatedAt: 'updated_at',
};

function resolveReplayDbPath(env = process.env) {
  return path.resolve(env.LIGHTHOUSE_DB_PATH || DEFAULT_DB_PATH);
}

function ensureParentDirectory(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function toStoredValue(key, value) {
  if (value === undefined) {
    return value;
  }

  if (key === 'dryRun') {
    return value ? 1 : 0;
  }

  return value;
}

function mapJobRow(row) {
  if (!row) {
    return null;
  }

  return {
    clientId: row.client_id,
    completedAt: row.completed_at,
    createdAt: row.created_at,
    destinationTopic: row.destination_topic,
    dryRun: Boolean(row.dry_run),
    endOffset: row.end_offset,
    errorMessage: row.error_message,
    jobId: row.job_id,
    lastReplayedOffset: row.last_replayed_offset,
    partition: row.partition_id,
    progressInterval: row.progress_interval,
    progressTotal: row.progress_total,
    replayedCount: row.replayed_count,
    sourceTopic: row.source_topic,
    startedAt: row.started_at,
    startOffset: row.start_offset,
    status: row.status,
    updatedAt: row.updated_at,
  };
}

function createReplayJobStore({
  dbPath = resolveReplayDbPath(),
  now = () => new Date().toISOString(),
} = {}) {
  ensureParentDirectory(dbPath);

  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.exec(`
    CREATE TABLE IF NOT EXISTS replay_jobs (
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
    )
  `);

  const selectJobStatement = db.prepare(`
    SELECT
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
      started_at,
      completed_at,
      error_message,
      last_replayed_offset,
      updated_at
    FROM replay_jobs
    WHERE job_id = ?
  `);
  const listJobsStatement = db.prepare(`
    SELECT
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
      started_at,
      completed_at,
      error_message,
      last_replayed_offset,
      updated_at
    FROM replay_jobs
    ORDER BY created_at DESC, job_id DESC
    LIMIT ?
  `);
  const insertJobStatement = db.prepare(`
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
      started_at,
      completed_at,
      error_message,
      last_replayed_offset,
      updated_at
    ) VALUES (
      @jobId,
      @sourceTopic,
      @destinationTopic,
      @partition,
      @startOffset,
      @endOffset,
      @status,
      @dryRun,
      @replayedCount,
      @progressTotal,
      @clientId,
      @progressInterval,
      @createdAt,
      @startedAt,
      @completedAt,
      @errorMessage,
      @lastReplayedOffset,
      @updatedAt
    )
  `);

  function getJob(jobId) {
    return mapJobRow(selectJobStatement.get(jobId));
  }

  function listJobs({ limit = 50 } = {}) {
    return listJobsStatement.all(limit).map(mapJobRow);
  }

  function createJob(job) {
    insertJobStatement.run({
      ...job,
      dryRun: job.dryRun ? 1 : 0,
    });

    return getJob(job.jobId);
  }

  function updateJob(jobId, updates) {
    const entries = Object.entries(updates).filter(([, value]) => value !== undefined);

    if (entries.length === 0) {
      return getJob(jobId);
    }

    const parameters = { jobId };
    const assignments = entries.map(([key, value]) => {
      const columnName = COLUMN_MAP[key];

      if (!columnName) {
        throw new Error(`Unknown replay job field "${key}"`);
      }

      parameters[key] = toStoredValue(key, value);
      return `${columnName} = @${key}`;
    });

    if (!Object.prototype.hasOwnProperty.call(updates, 'updatedAt')) {
      parameters.updatedAt = now();
      assignments.push('updated_at = @updatedAt');
    }

    db.prepare(
      `UPDATE replay_jobs SET ${assignments.join(', ')} WHERE job_id = @jobId`
    ).run(parameters);

    return getJob(jobId);
  }

  function close() {
    db.close();
  }

  return {
    close,
    createJob,
    dbPath,
    getJob,
    listJobs,
    updateJob,
  };
}

module.exports = {
  COLUMN_MAP,
  DEFAULT_DB_PATH,
  JOB_STATUSES,
  createReplayJobStore,
  mapJobRow,
  resolveReplayDbPath,
};
