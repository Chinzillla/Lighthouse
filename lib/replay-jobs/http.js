const { createReplayJobStore, resolveReplayDbPath } = require('./store');
const { createValidationError } = require('./service');

const DEFAULT_JOB_LIST_LIMIT = 50;

function applyNoStore(response) {
  response.setHeader('Cache-Control', 'no-store');
}

function sendMethodNotAllowed(response, allowedMethods) {
  response.setHeader('Allow', allowedMethods.join(', '));
  response.status(405).json({ error: 'Method not allowed' });
}

function sendServiceError(response, error) {
  response.status(error?.statusCode || 500).json({
    error: error?.message || 'Internal server error',
  });
}

function expectSingleValue(value, label) {
  if (Array.isArray(value)) {
    throw createValidationError(`${label} must be a single value`);
  }

  return value;
}

function getJobIdFromRequest(request) {
  const rawJobId = expectSingleValue(request?.query?.jobId, 'Job id route parameter');
  const jobId = String(rawJobId || '').trim();

  if (!jobId) {
    throw createValidationError('Job id route parameter is required');
  }

  return jobId;
}

function getListLimitFromRequest(request) {
  const value = expectSingleValue(request?.query?.limit, 'Query parameter "limit"');

  if (value === undefined) {
    return DEFAULT_JOB_LIST_LIMIT;
  }

  return value;
}

async function withReplayJobStore(
  callback,
  { env = process.env, logger = console, now = () => new Date().toISOString() } = {}
) {
  const store = createReplayJobStore({
    dbPath: resolveReplayDbPath(env),
    now,
  });

  try {
    return await callback({
      env,
      logger,
      now,
      store,
    });
  } finally {
    store.close();
  }
}

module.exports = {
  DEFAULT_JOB_LIST_LIMIT,
  applyNoStore,
  getJobIdFromRequest,
  getListLimitFromRequest,
  sendMethodNotAllowed,
  sendServiceError,
  withReplayJobStore,
};
