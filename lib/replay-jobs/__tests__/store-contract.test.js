/** @jest-environment node */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { createAzureSqlReplayJobStore } = require('../azure-sql-store');
const { COLUMN_MAP, JOB_STATUSES, createReplayJobStore } = require('../store');

const PARAMETER_TO_COLUMN = Object.fromEntries(
  Object.entries(COLUMN_MAP).map(([parameter, column]) => [parameter, column])
);

function createReplayJobFixture(overrides = {}) {
  return {
    clientId: 'lighthouse-replay-cli',
    completedAt: null,
    createdAt: '2026-04-28T18:00:00.000Z',
    destinationTopic: 'orders-replay',
    dryRun: false,
    endOffset: 12,
    endTimestamp: null,
    errorMessage: null,
    jobId: 'job-contract',
    lastReplayedOffset: null,
    messagesPerSecond: null,
    partition: 0,
    progressInterval: 25,
    progressTotal: 3,
    replayMode: 'offset',
    replayedCount: 0,
    sourceTopic: 'orders',
    startedAt: null,
    startOffset: 10,
    startTimestamp: null,
    status: JOB_STATUSES.DRAFT,
    updatedAt: '2026-04-28T18:00:00.000Z',
    ...overrides,
  };
}

function createFakeSqlPool() {
  const rows = new Map();

  function toSqlRow(parameters) {
    return Object.fromEntries(
      Object.entries(PARAMETER_TO_COLUMN).map(([parameter, column]) => [
        column,
        parameters[parameter] ?? null,
      ])
    );
  }

  function execute(query, parameters) {
    if (query.includes('CREATE TABLE')) {
      return { recordset: [] };
    }

    if (query.includes('INSERT INTO dbo.replay_jobs')) {
      rows.set(parameters.jobId, toSqlRow(parameters));
      return { recordset: [] };
    }

    if (query.includes('SELECT TOP')) {
      const sortedRows = [...rows.values()].sort((left, right) =>
        `${right.created_at}:${right.job_id}`.localeCompare(
          `${left.created_at}:${left.job_id}`
        )
      );

      return { recordset: sortedRows.slice(0, parameters.limit) };
    }

    if (query.includes('SELECT') && query.includes('WHERE job_id = @jobId')) {
      return { recordset: rows.has(parameters.jobId) ? [rows.get(parameters.jobId)] : [] };
    }

    if (query.includes('UPDATE dbo.replay_jobs')) {
      const row = rows.get(parameters.jobId);
      const updateClause = query.match(/SET\s+([\s\S]+?)\s+WHERE/i)?.[1] || '';

      updateClause
        .split(',')
        .map((assignment) => assignment.trim())
        .filter(Boolean)
        .forEach((assignment) => {
          const [column, parameter] = assignment.split('=').map((part) => part.trim());
          row[column] = parameters[parameter.slice(1)];
        });

      return { recordset: [] };
    }

    throw new Error(`Unhandled fake SQL query: ${query}`);
  }

  return {
    request() {
      const parameters = {};

      return {
        input(name, _type, value) {
          parameters[name] = value;
          return this;
        },
        query(sql) {
          return Promise.resolve(execute(sql, parameters));
        },
      };
    },
  };
}

function createFakeSqlModule() {
  return {
    BigInt: 'BigInt',
    Bit: 'Bit',
    Int: 'Int',
    MAX: 'MAX',
    NVarChar: (length) => `NVarChar(${length})`,
  };
}

function runStoreContract(label, createStore) {
  describe(label, () => {
    it('creates, reads, lists, and updates replay jobs', async () => {
      const { cleanup, store } = createStore({
        now: () => '2026-04-28T18:05:00.000Z',
      });

      try {
        const createdJob = await store.createJob(createReplayJobFixture());

        expect(createdJob).toMatchObject({
          destinationTopic: 'orders-replay',
          jobId: 'job-contract',
          progressTotal: 3,
          status: JOB_STATUSES.DRAFT,
        });
        await expect(Promise.resolve(store.getJob('job-contract'))).resolves.toEqual(
          createdJob
        );

        const updatedJob = await store.updateJob('job-contract', {
          lastReplayedOffset: 11,
          replayedCount: 2,
          startedAt: '2026-04-28T18:04:00.000Z',
          status: JOB_STATUSES.RUNNING,
        });

        expect(updatedJob).toMatchObject({
          jobId: 'job-contract',
          lastReplayedOffset: 11,
          replayedCount: 2,
          status: JOB_STATUSES.RUNNING,
          updatedAt: '2026-04-28T18:05:00.000Z',
        });

        await store.createJob(
          createReplayJobFixture({
            createdAt: '2026-04-28T18:10:00.000Z',
            jobId: 'job-newer',
            updatedAt: '2026-04-28T18:10:00.000Z',
          })
        );

        await expect(Promise.resolve(store.listJobs({ limit: 2 }))).resolves.toEqual(
          expect.arrayContaining([
            expect.objectContaining({ jobId: 'job-newer' }),
            expect.objectContaining({ jobId: 'job-contract' }),
          ])
        );
      } finally {
        await store.close();
        cleanup();
      }
    });
  });
}

runStoreContract('SQLite replay job store contract', ({ now }) => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lighthouse-store-contract-'));
  const store = createReplayJobStore({
    dbPath: path.join(tempDir, 'jobs.sqlite'),
    now,
  });

  return {
    cleanup: () => fs.rmSync(tempDir, { force: true, recursive: true }),
    store,
  };
});

runStoreContract('Azure SQL replay job store contract', ({ now }) => ({
  cleanup: () => {},
  store: createAzureSqlReplayJobStore({
    now,
    pool: createFakeSqlPool(),
    sql: createFakeSqlModule(),
  }),
}));
