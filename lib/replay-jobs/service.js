const {
  normalizeReplayOptions,
  resolveReplayPlanWithKafka,
  REPLAY_MODES,
  runReplay,
  validateReplayOptions,
} = require('../../tools/kafka-replay');
const { JOB_STATUSES } = require('./store');

const MAX_JOB_LIST_LIMIT = 200;
const REPLAY_VALIDATION_PATTERNS = [
  /^"--.+"/,
  /^Destination topic ".+" does not exist$/,
  /^End offset \d+ must be lower than the next unread offset \d+/,
  /^Kafka client id must not be empty$/,
  /^Missing required argument "--.+"/,
  /^Replay job id must not be empty$/,
  /^Source and destination topics must be different$/,
  /^Source topic ".+" does not exist$/,
  /^Start offset \d+ is before the earliest available offset \d+/,
  /^Timestamp window .+ resolved to no messages/,
  /^Use either "--start"\/"--end" or "--start-timestamp"\/"--end-timestamp"/,
];

function createServiceError(message, { code = 'REPLAY_JOB_ERROR', statusCode = 400 } = {}) {
  const error = new Error(message);
  error.name = 'ReplayJobError';
  error.code = code;
  error.statusCode = statusCode;
  return error;
}

function createValidationError(message) {
  return createServiceError(message, {
    code: 'REPLAY_JOB_VALIDATION_ERROR',
    statusCode: 400,
  });
}

function createNotFoundError(message) {
  return createServiceError(message, {
    code: 'REPLAY_JOB_NOT_FOUND',
    statusCode: 404,
  });
}

function createConflictError(message) {
  return createServiceError(message, {
    code: 'REPLAY_JOB_STATE_CONFLICT',
    statusCode: 409,
  });
}

function normalizeJobListLimit(limit) {
  const normalizedLimit = Number(limit);

  if (!Number.isInteger(normalizedLimit) || normalizedLimit < 1) {
    throw createValidationError('Replay job list limit must be a positive integer');
  }

  if (normalizedLimit > MAX_JOB_LIST_LIMIT) {
    throw createValidationError(
      `Replay job list limit must be less than or equal to ${MAX_JOB_LIST_LIMIT}`
    );
  }

  return normalizedLimit;
}

function wrapReplayExecutionError(error) {
  if (error?.name === 'ReplayJobError') {
    return error;
  }

  const message = error?.message || 'Replay operation failed';

  if (REPLAY_VALIDATION_PATTERNS.some((pattern) => pattern.test(message))) {
    return createValidationError(message);
  }

  return createServiceError(message, {
    code: 'REPLAY_RUNTIME_ERROR',
    statusCode: 502,
  });
}

async function createReplayJob(
  rawOptions,
  {
    env = process.env,
    now = () => new Date().toISOString(),
    replayPlanResolver = resolveReplayPlanWithKafka,
    store,
  } = {}
) {
  if (!store) {
    throw createServiceError('Replay job store is required', {
      code: 'REPLAY_JOB_STORE_REQUIRED',
      statusCode: 500,
    });
  }

  let options;

  try {
    options = normalizeReplayOptions(rawOptions, env);
    validateReplayOptions(options);
  } catch (error) {
    throw wrapReplayExecutionError(error);
  }

  let resolvedRange = {
    endOffset: options.endOffset,
    progressTotal: options.endOffset - options.startOffset + 1,
    startOffset: options.startOffset,
  };

  if (options.replayMode === REPLAY_MODES.TIMESTAMP) {
    try {
      const replayPlan = await replayPlanResolver(options, { env });
      resolvedRange = {
        endOffset: replayPlan.endOffset,
        progressTotal: replayPlan.totalMessages,
        startOffset: replayPlan.startOffset,
      };
    } catch (error) {
      throw wrapReplayExecutionError(error);
    }
  }

  const timestamp = now();

  return store.createJob({
    clientId: options.clientId,
    completedAt: null,
    createdAt: timestamp,
    destinationTopic: options.destinationTopic,
    dryRun: options.dryRun,
    endOffset: resolvedRange.endOffset,
    endTimestamp: options.endTimestamp,
    errorMessage: null,
    jobId: options.replayJobId,
    lastReplayedOffset: null,
    partition: options.partition,
    progressInterval: options.progressInterval,
    progressTotal: resolvedRange.progressTotal,
    replayMode: options.replayMode,
    replayedCount: 0,
    sourceTopic: options.sourceTopic,
    startedAt: null,
    startOffset: resolvedRange.startOffset,
    startTimestamp: options.startTimestamp,
    status: JOB_STATUSES.DRAFT,
    updatedAt: timestamp,
  });
}

function getReplayJob(jobId, { store } = {}) {
  if (!store) {
    throw createServiceError('Replay job store is required', {
      code: 'REPLAY_JOB_STORE_REQUIRED',
      statusCode: 500,
    });
  }

  const job = store.getJob(jobId);
  if (!job) {
    throw createNotFoundError(`Replay job "${jobId}" was not found`);
  }

  return job;
}

function listReplayJobs({ limit = 50, store } = {}) {
  if (!store) {
    throw createServiceError('Replay job store is required', {
      code: 'REPLAY_JOB_STORE_REQUIRED',
      statusCode: 500,
    });
  }

  return store.listJobs({ limit: normalizeJobListLimit(limit) });
}

function cancelReplayJob(jobId, { now = () => new Date().toISOString(), store } = {}) {
  const job = getReplayJob(jobId, { store });

  if (job.status === JOB_STATUSES.RUNNING) {
    throw createConflictError('Running job cancellation is not available yet');
  }

  if (job.status === JOB_STATUSES.COMPLETED) {
    throw createConflictError('Completed replay jobs cannot be cancelled');
  }

  if (job.status === JOB_STATUSES.CANCELLED) {
    return job;
  }

  const timestamp = now();

  return store.updateJob(jobId, {
    completedAt: timestamp,
    errorMessage: null,
    status: JOB_STATUSES.CANCELLED,
    updatedAt: timestamp,
  });
}

function prepareReplayJobStart(
  jobId,
  { now = () => new Date().toISOString(), store } = {}
) {
  if (!store) {
    throw createServiceError('Replay job store is required', {
      code: 'REPLAY_JOB_STORE_REQUIRED',
      statusCode: 500,
    });
  }

  const job = getReplayJob(jobId, { store });

  if (![JOB_STATUSES.DRAFT, JOB_STATUSES.FAILED].includes(job.status)) {
    throw createConflictError(
      `Replay job "${jobId}" cannot start from status "${job.status}"`
    );
  }

  const startedAt = now();

  return store.updateJob(jobId, {
    completedAt: null,
    errorMessage: null,
    lastReplayedOffset: null,
    replayedCount: 0,
    startedAt,
    status: JOB_STATUSES.RUNNING,
    updatedAt: startedAt,
  });
}

async function executeReplayJob(
  jobId,
  {
    env = process.env,
    logger = console,
    now = () => new Date().toISOString(),
    replayRunner = runReplay,
    store,
  } = {}
) {
  if (!store) {
    throw createServiceError('Replay job store is required', {
      code: 'REPLAY_JOB_STORE_REQUIRED',
      statusCode: 500,
    });
  }

  const job = getReplayJob(jobId, { store });
  if (job.status !== JOB_STATUSES.RUNNING) {
    throw createConflictError(
      `Replay job "${jobId}" cannot execute from status "${job.status}"`
    );
  }

  const startedAt = job.startedAt || now();

  try {
    const summary = await replayRunner(
      {
        destination: job.destinationTopic,
        'dry-run': job.dryRun,
        end: String(job.endOffset),
        'job-id': job.jobId,
        partition: String(job.partition),
        'progress-every': String(job.progressInterval),
        source: job.sourceTopic,
        start: String(job.startOffset),
      },
      {
        env: {
          ...env,
          KAFKA_CLIENT_ID: job.clientId,
        },
        logger,
        onProgress: async ({ lastReplayedOffset, replayedCount }) => {
          store.updateJob(jobId, {
            lastReplayedOffset,
            replayedCount,
            updatedAt: now(),
          });
        },
      }
    );

    const completedAt = now();

    return store.updateJob(jobId, {
      completedAt,
      errorMessage: null,
      lastReplayedOffset: summary.lastReplayedOffset,
      replayedCount: summary.replayedCount,
      startedAt,
      status: JOB_STATUSES.COMPLETED,
      updatedAt: completedAt,
    });
  } catch (error) {
    const completedAt = now();

    store.updateJob(jobId, {
      completedAt,
      errorMessage: error.message,
      status: JOB_STATUSES.FAILED,
      updatedAt: completedAt,
    });

    throw error;
  }
}

async function startReplayJob(
  jobId,
  {
    env = process.env,
    logger = console,
    now = () => new Date().toISOString(),
    replayRunner = runReplay,
    store,
  } = {}
) {
  prepareReplayJobStart(jobId, { now, store });

  return executeReplayJob(jobId, {
    env,
    logger,
    now,
    replayRunner,
    store,
  });
}

async function previewReplayJob(
  jobId,
  {
    env = process.env,
    logger = console,
    replayRunner = runReplay,
    store,
  } = {}
) {
  if (!store) {
    throw createServiceError('Replay job store is required', {
      code: 'REPLAY_JOB_STORE_REQUIRED',
      statusCode: 500,
    });
  }

  const job = getReplayJob(jobId, { store });
  const previewMessages = [];

  try {
    const summary = await replayRunner(
      {
        destination: job.destinationTopic,
        'dry-run': true,
        end: String(job.endOffset),
        'job-id': job.jobId,
        partition: String(job.partition),
        'progress-every': String(job.progressInterval),
        source: job.sourceTopic,
        start: String(job.startOffset),
      },
      {
        env: {
          ...env,
          KAFKA_CLIENT_ID: job.clientId,
        },
        logger,
        onPreviewMessage: async (previewMessage) => {
          previewMessages.push(previewMessage);
        },
      }
    );

    return {
      job,
      previewMessages,
      summary,
    };
  } catch (error) {
    throw wrapReplayExecutionError(error);
  }
}

module.exports = {
  cancelReplayJob,
  createConflictError,
  createReplayJob,
  createNotFoundError,
  createServiceError,
  createValidationError,
  executeReplayJob,
  getReplayJob,
  listReplayJobs,
  MAX_JOB_LIST_LIMIT,
  normalizeJobListLimit,
  prepareReplayJobStart,
  previewReplayJob,
  startReplayJob,
  wrapReplayExecutionError,
};
