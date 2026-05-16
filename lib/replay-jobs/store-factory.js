const { createAzureSqlReplayJobStore } = require('./azure-sql-store');
const { createReplayJobStore, resolveReplayDbPath } = require('./store');

const JOB_STORE_KINDS = Object.freeze({
  AZURE_SQL: 'azure-sql',
  SQLITE: 'sqlite',
});

function normalizeJobStoreKind(value = process.env.LIGHTHOUSE_JOB_STORE) {
  const normalizedValue = String(value || JOB_STORE_KINDS.SQLITE)
    .trim()
    .toLowerCase();

  if (!normalizedValue) {
    return JOB_STORE_KINDS.SQLITE;
  }

  if (!Object.values(JOB_STORE_KINDS).includes(normalizedValue)) {
    throw new Error(
      `Unsupported LIGHTHOUSE_JOB_STORE "${value}". Use "sqlite" or "azure-sql".`
    );
  }

  return normalizedValue;
}

function createReplayJobStoreFromEnv({
  env = process.env,
  now = () => new Date().toISOString(),
} = {}) {
  const storeKind = normalizeJobStoreKind(env.LIGHTHOUSE_JOB_STORE);

  if (storeKind === JOB_STORE_KINDS.SQLITE) {
    return createReplayJobStore({
      dbPath: resolveReplayDbPath(env),
      now,
    });
  }

  return createAzureSqlReplayJobStore({
    connectionString: env.LIGHTHOUSE_SQL_CONNECTION_STRING,
    now,
  });
}

module.exports = {
  JOB_STORE_KINDS,
  createReplayJobStoreFromEnv,
  normalizeJobStoreKind,
};
