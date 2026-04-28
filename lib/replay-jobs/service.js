const {
  normalizeReplayOptions,
  runReplay,
  validateReplayOptions,
} = require('../../tools/kafka-replay');
const { JOB_STATUSES } = require('./store');

function createServiceError(message) {
  const error = new Error(message);
  error.name = 'ReplayJobError';
  return error;
}

function createReplayJob(
  rawOptions,
  { env = process.env, now = () => new Date().toISOString(), store } = {}
) {
  if (!store) {
    throw createServiceError('Replay job store is required');
  }

  const options = normalizeReplayOptions(rawOptions, env);
  validateReplayOptions(options);
  const timestamp = now();

  return store.createJob({
    clientId: options.clientId,
    completedAt: null,
    createdAt: timestamp,
    destinationTopic: options.destinationTopic,
    dryRun: options.dryRun,
    endOffset: options.endOffset,
    errorMessage: null,
    jobId: options.replayJobId,
    lastReplayedOffset: null,
    partition: options.partition,
    progressInterval: options.progressInterval,
    progressTotal: options.endOffset - options.startOffset + 1,
    replayedCount: 0,
    sourceTopic: options.sourceTopic,
    startedAt: null,
    startOffset: options.startOffset,
    status: JOB_STATUSES.DRAFT,
    updatedAt: timestamp,
  });
}

function getReplayJob(jobId, { store } = {}) {
  if (!store) {
    throw createServiceError('Replay job store is required');
  }

  const job = store.getJob(jobId);
  if (!job) {
    throw createServiceError(`Replay job "${jobId}" was not found`);
  }

  return job;
}

function listReplayJobs({ limit = 50, store } = {}) {
  if (!store) {
    throw createServiceError('Replay job store is required');
  }

  return store.listJobs({ limit });
}

function cancelReplayJob(jobId, { now = () => new Date().toISOString(), store } = {}) {
  const job = getReplayJob(jobId, { store });

  if (job.status === JOB_STATUSES.RUNNING) {
    throw createServiceError('Running job cancellation is not available yet');
  }

  if (job.status === JOB_STATUSES.COMPLETED) {
    throw createServiceError('Completed replay jobs cannot be cancelled');
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
  if (!store) {
    throw createServiceError('Replay job store is required');
  }

  const job = getReplayJob(jobId, { store });

  if (![JOB_STATUSES.DRAFT, JOB_STATUSES.FAILED].includes(job.status)) {
    throw createServiceError(
      `Replay job "${jobId}" cannot start from status "${job.status}"`
    );
  }

  const startedAt = now();

  store.updateJob(jobId, {
    completedAt: null,
    errorMessage: null,
    lastReplayedOffset: null,
    replayedCount: 0,
    startedAt,
    status: JOB_STATUSES.RUNNING,
    updatedAt: startedAt,
  });

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

module.exports = {
  cancelReplayJob,
  createReplayJob,
  createServiceError,
  getReplayJob,
  listReplayJobs,
  startReplayJob,
};
