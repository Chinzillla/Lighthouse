const { createReplayJobStore } = require('../lib/replay-jobs/store');
const {
  cancelReplayJob,
  createReplayJob,
  getReplayJob,
  listReplayJobs,
  startReplayJob,
} = require('../lib/replay-jobs/service');
const { formatUsage, parseCliArgs } = require('./kafka-replay');

function formatJobsUsage() {
  return [
    'Usage:',
    '  node tools/kafka-replay-jobs.js create --source <topic> --destination <topic> --partition <id> --start <offset> --end <offset> [--dry-run] [--job-id <id>]',
    '  node tools/kafka-replay-jobs.js create --source <topic> --destination <topic> --partition <id> --start-timestamp <timestamp> --end-timestamp <timestamp> [--dry-run] [--job-id <id>]',
    '  node tools/kafka-replay-jobs.js start --job-id <id>',
    '  node tools/kafka-replay-jobs.js list [--limit <count>]',
    '  node tools/kafka-replay-jobs.js show --job-id <id>',
    '  node tools/kafka-replay-jobs.js cancel --job-id <id>',
    '',
    'Replay create options mirror the replay CLI:',
    formatUsage(),
  ].join('\n');
}

function requireJobId(parsedArgs) {
  if (!parsedArgs['job-id']) {
    throw new Error('Missing required argument "--job-id"');
  }

  return parsedArgs['job-id'];
}

function printJob(job) {
  console.log(JSON.stringify(job, null, 2));
}

function printJobList(jobs) {
  if (jobs.length === 0) {
    console.log('No replay jobs found.');
    return;
  }

  console.table(
    jobs.map((job) => ({
      completedAt: job.completedAt,
      createdAt: job.createdAt,
      dryRun: job.dryRun,
      jobId: job.jobId,
      replayedCount: `${job.replayedCount}/${job.progressTotal}`,
      source: `${job.sourceTopic}[${job.partition}]`,
      status: job.status,
      target: `${job.destinationTopic}[${job.partition}]`,
    }))
  );
}

async function main(argv = process.argv.slice(2)) {
  const [command, ...commandArgs] = argv;

  if (!command || command === '--help' || command === '-h') {
    console.log(formatJobsUsage());
    return null;
  }

  const store = createReplayJobStore();

  try {
    if (command === 'create') {
      const parsedArgs = parseCliArgs(commandArgs);
      const job = await createReplayJob(parsedArgs, { store });
      console.log(`Created replay job ${job.jobId} in status ${job.status}`);
      printJob(job);
      return job;
    }

    if (command === 'start') {
      const parsedArgs = parseCliArgs(commandArgs);
      const jobId = requireJobId(parsedArgs);
      const job = await startReplayJob(jobId, { store });
      console.log(`Replay job ${job.jobId} finished with status ${job.status}`);
      printJob(job);
      return job;
    }

    if (command === 'list') {
      const parsedArgs = parseCliArgs(commandArgs);
      const limit = parsedArgs.limit ? Number(parsedArgs.limit) : 50;
      const jobs = listReplayJobs({ limit, store });
      printJobList(jobs);
      return jobs;
    }

    if (command === 'show') {
      const parsedArgs = parseCliArgs(commandArgs);
      const jobId = requireJobId(parsedArgs);
      const job = getReplayJob(jobId, { store });
      printJob(job);
      return job;
    }

    if (command === 'cancel') {
      const parsedArgs = parseCliArgs(commandArgs);
      const jobId = requireJobId(parsedArgs);
      const job = cancelReplayJob(jobId, { store });
      console.log(`Replay job ${job.jobId} is now ${job.status}`);
      printJob(job);
      return job;
    }

    throw new Error(`Unknown command "${command}"`);
  } catch (error) {
    console.error(error.message);
    console.error('');
    console.error(formatJobsUsage());
    process.exitCode = 1;
    return null;
  } finally {
    store.close();
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  formatJobsUsage,
  main,
  printJobList,
};
