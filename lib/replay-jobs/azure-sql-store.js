const { COLUMN_MAP, mapJobRow } = require('./store');

const SELECT_REPLAY_JOB_COLUMNS = `
  job_id,
  source_topic,
  destination_topic,
  partition_id,
  start_offset,
  end_offset,
  status,
  replay_mode,
  start_timestamp,
  end_timestamp,
  messages_per_second,
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
`;

const NUMERIC_ROW_FIELDS = new Set([
  'dry_run',
  'end_offset',
  'last_replayed_offset',
  'messages_per_second',
  'partition_id',
  'progress_interval',
  'progress_total',
  'replayed_count',
  'start_offset',
]);

function getSqlModule(sqlModule) {
  return sqlModule || require('mssql');
}

function requireConnectionString(connectionString) {
  if (!connectionString) {
    throw new Error(
      'LIGHTHOUSE_SQL_CONNECTION_STRING is required when LIGHTHOUSE_JOB_STORE=azure-sql'
    );
  }
}

function toStoredValue(key, value) {
  if (key === 'dryRun') {
    return value ? 1 : 0;
  }

  return value === undefined ? null : value;
}

function coerceAzureSqlRow(row) {
  if (!row) {
    return null;
  }

  return Object.fromEntries(
    Object.entries(row).map(([key, value]) => {
      if (NUMERIC_ROW_FIELDS.has(key) && value !== null && value !== undefined) {
        return [key, Number(value)];
      }

      return [key, value];
    })
  );
}

function getParameterType(sql, key) {
  if (key === 'dryRun') {
    return sql.Bit;
  }

  if (
    [
      'endOffset',
      'lastReplayedOffset',
      'partition',
      'progressInterval',
      'progressTotal',
      'replayedCount',
      'startOffset',
    ].includes(key)
  ) {
    return sql.BigInt;
  }

  if (key === 'messagesPerSecond' || key === 'limit') {
    return sql.Int;
  }

  if (
    [
      'clientId',
      'completedAt',
      'createdAt',
      'destinationTopic',
      'endTimestamp',
      'jobId',
      'replayMode',
      'sourceTopic',
      'startedAt',
      'startTimestamp',
      'status',
      'updatedAt',
    ].includes(key)
  ) {
    return sql.NVarChar(255);
  }

  if (key === 'errorMessage') {
    return sql.NVarChar(sql.MAX);
  }

  return sql.NVarChar(255);
}

function addInput(request, sql, key, value) {
  request.input(key, getParameterType(sql, key), toStoredValue(key, value));
}

async function ensureAzureSqlReplayJobSchema(pool) {
  await pool.request().query(`
    IF OBJECT_ID(N'dbo.replay_jobs', N'U') IS NULL
    BEGIN
      CREATE TABLE dbo.replay_jobs (
        job_id NVARCHAR(255) NOT NULL PRIMARY KEY,
        source_topic NVARCHAR(255) NOT NULL,
        destination_topic NVARCHAR(255) NOT NULL,
        partition_id BIGINT NOT NULL,
        start_offset BIGINT NOT NULL,
        end_offset BIGINT NOT NULL,
        status NVARCHAR(32) NOT NULL,
        replay_mode NVARCHAR(32) NOT NULL CONSTRAINT DF_replay_jobs_replay_mode DEFAULT 'offset',
        start_timestamp NVARCHAR(255) NULL,
        end_timestamp NVARCHAR(255) NULL,
        messages_per_second INT NULL,
        dry_run BIT NOT NULL CONSTRAINT DF_replay_jobs_dry_run DEFAULT 0,
        replayed_count BIGINT NOT NULL CONSTRAINT DF_replay_jobs_replayed_count DEFAULT 0,
        progress_total BIGINT NOT NULL,
        client_id NVARCHAR(255) NOT NULL,
        progress_interval BIGINT NOT NULL,
        created_at NVARCHAR(255) NOT NULL,
        started_at NVARCHAR(255) NULL,
        completed_at NVARCHAR(255) NULL,
        error_message NVARCHAR(MAX) NULL,
        last_replayed_offset BIGINT NULL,
        updated_at NVARCHAR(255) NOT NULL
      );
    END;

    IF COL_LENGTH('dbo.replay_jobs', 'replay_mode') IS NULL
      ALTER TABLE dbo.replay_jobs ADD replay_mode NVARCHAR(32) NOT NULL CONSTRAINT DF_replay_jobs_replay_mode_legacy DEFAULT 'offset';

    IF COL_LENGTH('dbo.replay_jobs', 'start_timestamp') IS NULL
      ALTER TABLE dbo.replay_jobs ADD start_timestamp NVARCHAR(255) NULL;

    IF COL_LENGTH('dbo.replay_jobs', 'end_timestamp') IS NULL
      ALTER TABLE dbo.replay_jobs ADD end_timestamp NVARCHAR(255) NULL;

    IF COL_LENGTH('dbo.replay_jobs', 'messages_per_second') IS NULL
      ALTER TABLE dbo.replay_jobs ADD messages_per_second INT NULL;
  `);
}

function createAzureSqlReplayJobStore({
  connectionString,
  now = () => new Date().toISOString(),
  pool: providedPool,
  sql: providedSql,
} = {}) {
  const sql = getSqlModule(providedSql);
  let poolPromise;
  let ownsPool = false;

  async function getPool() {
    if (!poolPromise) {
      if (providedPool) {
        poolPromise = Promise.resolve(providedPool);
      } else {
        requireConnectionString(connectionString);
        const pool = new sql.ConnectionPool(connectionString);
        ownsPool = true;
        poolPromise = pool.connect();
      }

      const pool = await poolPromise;
      await ensureAzureSqlReplayJobSchema(pool);
    }

    return poolPromise;
  }

  async function getJob(jobId) {
    const pool = await getPool();
    const request = pool.request();
    addInput(request, sql, 'jobId', jobId);

    const result = await request.query(`
      SELECT ${SELECT_REPLAY_JOB_COLUMNS}
      FROM dbo.replay_jobs
      WHERE job_id = @jobId
    `);

    return mapJobRow(coerceAzureSqlRow(result.recordset?.[0]));
  }

  async function listJobs({ limit = 50 } = {}) {
    const pool = await getPool();
    const request = pool.request();
    addInput(request, sql, 'limit', Number(limit));

    const result = await request.query(`
      SELECT TOP (@limit) ${SELECT_REPLAY_JOB_COLUMNS}
      FROM dbo.replay_jobs
      ORDER BY created_at DESC, job_id DESC
    `);

    return (result.recordset || []).map((row) => mapJobRow(coerceAzureSqlRow(row)));
  }

  async function createJob(job) {
    const pool = await getPool();
    const request = pool.request();
    const parameters = {
      endTimestamp: null,
      messagesPerSecond: null,
      replayMode: 'offset',
      startTimestamp: null,
      ...job,
    };

    Object.entries(parameters).forEach(([key, value]) => {
      addInput(request, sql, key, value);
    });

    await request.query(`
      INSERT INTO dbo.replay_jobs (
        job_id,
        source_topic,
        destination_topic,
        partition_id,
        start_offset,
        end_offset,
        status,
        replay_mode,
        start_timestamp,
        end_timestamp,
        messages_per_second,
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
        @replayMode,
        @startTimestamp,
        @endTimestamp,
        @messagesPerSecond,
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

    return getJob(job.jobId);
  }

  async function updateJob(jobId, updates) {
    const entries = Object.entries(updates).filter(([, value]) => value !== undefined);

    if (entries.length === 0) {
      return getJob(jobId);
    }

    const pool = await getPool();
    const request = pool.request();
    addInput(request, sql, 'jobId', jobId);

    const assignments = entries.map(([key, value]) => {
      const columnName = COLUMN_MAP[key];

      if (!columnName) {
        throw new Error(`Unknown replay job field "${key}"`);
      }

      addInput(request, sql, key, value);
      return `${columnName} = @${key}`;
    });

    if (!Object.prototype.hasOwnProperty.call(updates, 'updatedAt')) {
      addInput(request, sql, 'updatedAt', now());
      assignments.push('updated_at = @updatedAt');
    }

    await request.query(`
      UPDATE dbo.replay_jobs
      SET ${assignments.join(', ')}
      WHERE job_id = @jobId
    `);

    return getJob(jobId);
  }

  async function close() {
    if (!ownsPool || !poolPromise) {
      return;
    }

    const pool = await poolPromise;
    await pool.close();
  }

  return {
    close,
    createJob,
    getJob,
    listJobs,
    updateJob,
  };
}

module.exports = {
  createAzureSqlReplayJobStore,
  ensureAzureSqlReplayJobSchema,
};
