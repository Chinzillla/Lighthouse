const { resolveReplayDbPath, createReplayJobStore } = require('./store');
const {
  createConflictError,
  cancelReplayJob,
  createReplayJobCancelledError,
  executeReplayJob,
  prepareReplayJobStart,
} = require('./service');

function createInMemoryReplayJobRunner() {
  const activeJobs = new Map();

  function start(
    jobId,
    {
      env = process.env,
      logger = console,
      now = () => new Date().toISOString(),
      replayRunner,
    } = {}
  ) {
    if (activeJobs.has(jobId)) {
      throw createConflictError(`Replay job "${jobId}" is already running`);
    }

    const store = createReplayJobStore({
      dbPath: resolveReplayDbPath(env),
      now,
    });
    const controller = new AbortController();

    let runningJob;

    try {
      runningJob = prepareReplayJobStart(jobId, { now, store });
    } catch (error) {
      store.close();
      throw error;
    }

    const task = executeReplayJob(jobId, {
      env,
      logger,
      now,
      replayRunner,
      signal: controller.signal,
      store,
    }).finally(() => {
      activeJobs.delete(jobId);
      store.close();
    });

    task.catch(() => {});
    activeJobs.set(jobId, {
      controller,
      task,
    });

    return runningJob;
  }

  function cancel(
    jobId,
    {
      env = process.env,
      now = () => new Date().toISOString(),
    } = {}
  ) {
    const activeJob = activeJobs.get(jobId);
    const store = createReplayJobStore({
      dbPath: resolveReplayDbPath(env),
      now,
    });

    try {
      const cancelledJob = cancelReplayJob(jobId, { now, store });

      if (activeJob && !activeJob.controller.signal.aborted) {
        activeJob.controller.abort(createReplayJobCancelledError(jobId));
      }

      return cancelledJob;
    } finally {
      store.close();
    }
  }

  function isRunning(jobId) {
    return activeJobs.has(jobId);
  }

  function waitForJob(jobId) {
    return activeJobs.get(jobId)?.task || null;
  }

  return {
    cancel,
    isRunning,
    start,
    waitForJob,
  };
}

const defaultReplayJobRunner = createInMemoryReplayJobRunner();

function startReplayJobInBackground(jobId, options) {
  return defaultReplayJobRunner.start(jobId, options);
}

function cancelReplayJobInBackground(jobId, options) {
  return defaultReplayJobRunner.cancel(jobId, options);
}

module.exports = {
  cancelReplayJobInBackground,
  createInMemoryReplayJobRunner,
  startReplayJobInBackground,
};
