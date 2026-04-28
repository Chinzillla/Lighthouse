const { resolveReplayDbPath, createReplayJobStore } = require('./store');
const {
  createConflictError,
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
      store,
    }).finally(() => {
      activeJobs.delete(jobId);
      store.close();
    });

    activeJobs.set(jobId, task);

    return runningJob;
  }

  function isRunning(jobId) {
    return activeJobs.has(jobId);
  }

  function waitForJob(jobId) {
    return activeJobs.get(jobId) || null;
  }

  return {
    isRunning,
    start,
    waitForJob,
  };
}

const defaultReplayJobRunner = createInMemoryReplayJobRunner();

function startReplayJobInBackground(jobId, options) {
  return defaultReplayJobRunner.start(jobId, options);
}

module.exports = {
  createInMemoryReplayJobRunner,
  startReplayJobInBackground,
};
