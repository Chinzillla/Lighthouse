const crypto = require('crypto');
const { createKafka, parseBrokers } = require('./kafka-config');

const DEFAULT_CLIENT_ID = 'lighthouse-replay-cli';
const DEFAULT_PROGRESS_INTERVAL = 25;
const BOOLEAN_ARGS = new Set(['dry-run']);
const REPLAY_MODES = Object.freeze({
  OFFSET: 'offset',
  TIMESTAMP: 'timestamp',
});

function formatUsage() {
  return [
    'Usage:',
    '  node tools/kafka-replay.js --source <topic> --destination <topic> --partition <id> --start <offset> --end <offset> [--brokers <host:port,...>] [--client-id <id>] [--job-id <id>] [--dry-run]',
    '  node tools/kafka-replay.js --source <topic> --destination <topic> --partition <id> --start-timestamp <timestamp> --end-timestamp <timestamp> [--brokers <host:port,...>] [--client-id <id>] [--job-id <id>] [--dry-run]',
    '',
    'Examples:',
    '  node tools/kafka-replay.js --source orders --destination orders-replay --partition 0 --start 10 --end 25',
    '  node tools/kafka-replay.js --source orders --destination orders-replay --partition 0 --start-timestamp 2026-04-28T14:03:00.000Z --end-timestamp 2026-04-28T14:08:00.000Z',
    '  node tools/kafka-replay.js --source orders --destination orders-replay --partition 0 --start 10 --end 25 --brokers localhost:19092,localhost:19093,localhost:19094',
    '  node tools/kafka-replay.js --source orders --destination orders-replay --partition 0 --start 10 --end 25 --dry-run',
    '',
    'Timestamp replay uses a half-open window: start is inclusive, end is exclusive.',
    'Kafka connection settings also honor the existing KAFKA_* environment variables.',
  ].join('\n');
}

function setParsedArg(parsedArgs, key, value) {
  if (Object.prototype.hasOwnProperty.call(parsedArgs, key)) {
    throw new Error(`Duplicate argument "--${key}"`);
  }

  parsedArgs[key] = value;
}

function parseCliArgs(argv) {
  const parsedArgs = {};

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];

    if (token === '--help' || token === '-h') {
      parsedArgs.help = true;
      continue;
    }

    if (!token.startsWith('--')) {
      throw new Error(`Unexpected argument "${token}"`);
    }

    const separatorIndex = token.indexOf('=');
    if (separatorIndex !== -1) {
      const key = token.slice(2, separatorIndex);
      const value = token.slice(separatorIndex + 1);

      if (!value) {
        throw new Error(`Missing value for "--${key}"`);
      }

      setParsedArg(parsedArgs, key, value);
      continue;
    }

    const key = token.slice(2);
    if (BOOLEAN_ARGS.has(key)) {
      setParsedArg(parsedArgs, key, true);
      continue;
    }

    const value = argv[index + 1];

    if (value === undefined || value.startsWith('--')) {
      throw new Error(`Missing value for "--${key}"`);
    }

    setParsedArg(parsedArgs, key, value);
    index += 1;
  }

  return parsedArgs;
}

function parseCliBoolean(name, value, defaultValue = false) {
  if (value === undefined || value === null || value === '') {
    return defaultValue;
  }

  if (value === true || value === false) {
    return value;
  }

  const normalizedValue = String(value).toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalizedValue)) {
    return true;
  }

  if (['0', 'false', 'no', 'off'].includes(normalizedValue)) {
    return false;
  }

  throw new Error(`"--${name}" must be a boolean value`);
}

function parseRequiredInteger(name, value) {
  if (value === undefined || value === null || value === '') {
    throw new Error(`Missing required argument "--${name}"`);
  }

  if (!/^\d+$/.test(String(value))) {
    throw new Error(`"--${name}" must be a non-negative integer`);
  }

  return Number(value);
}

function parseOptionalInteger(name, value, defaultValue) {
  if (value === undefined || value === null || value === '') {
    return defaultValue;
  }

  return parseRequiredInteger(name, value);
}

function hasCliValue(value) {
  return value !== undefined && value !== null && String(value).trim() !== '';
}

function parseRequiredTimestamp(name, value) {
  if (!hasCliValue(value)) {
    throw new Error(`Missing required argument "--${name}"`);
  }

  const rawValue = String(value).trim();
  const timestampMs = /^\d+$/.test(rawValue) ? Number(rawValue) : Date.parse(rawValue);

  if (!Number.isSafeInteger(timestampMs) || timestampMs < 0) {
    throw new Error(`"--${name}" must be an ISO-8601 timestamp or epoch milliseconds`);
  }

  const date = new Date(timestampMs);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`"--${name}" must be an ISO-8601 timestamp or epoch milliseconds`);
  }

  return {
    iso: date.toISOString(),
    ms: timestampMs,
  };
}

function createReplayJobId() {
  return `replay-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
}

function normalizeReplayOptions(input, env = process.env) {
  const usesOffsetRange = hasCliValue(input.start) || hasCliValue(input.end);
  const usesTimestampRange =
    hasCliValue(input['start-timestamp']) || hasCliValue(input['end-timestamp']);

  if (usesOffsetRange && usesTimestampRange) {
    throw new Error(
      'Use either "--start"/"--end" or "--start-timestamp"/"--end-timestamp", not both'
    );
  }

  const replayMode = usesTimestampRange ? REPLAY_MODES.TIMESTAMP : REPLAY_MODES.OFFSET;
  const startTimestamp =
    replayMode === REPLAY_MODES.TIMESTAMP
      ? parseRequiredTimestamp('start-timestamp', input['start-timestamp'])
      : null;
  const endTimestamp =
    replayMode === REPLAY_MODES.TIMESTAMP
      ? parseRequiredTimestamp('end-timestamp', input['end-timestamp'])
      : null;

  return {
    sourceTopic: (input.source || '').trim(),
    destinationTopic: (input.destination || '').trim(),
    partition: parseRequiredInteger('partition', input.partition),
    startOffset:
      replayMode === REPLAY_MODES.OFFSET ? parseRequiredInteger('start', input.start) : null,
    endOffset:
      replayMode === REPLAY_MODES.OFFSET ? parseRequiredInteger('end', input.end) : null,
    replayMode,
    startTimestamp: startTimestamp?.iso ?? null,
    startTimestampMs: startTimestamp?.ms ?? null,
    endTimestamp: endTimestamp?.iso ?? null,
    endTimestampMs: endTimestamp?.ms ?? null,
    brokers: parseBrokers(input.brokers || env.KAFKA_BROKERS),
    clientId: (input['client-id'] || env.KAFKA_CLIENT_ID || DEFAULT_CLIENT_ID).trim(),
    dryRun: parseCliBoolean('dry-run', input['dry-run'], false),
    progressInterval: parseOptionalInteger(
      'progress-every',
      input['progress-every'],
      DEFAULT_PROGRESS_INTERVAL
    ),
    replayJobId: (input['job-id'] || createReplayJobId()).trim(),
  };
}

function validateReplayOptions(options) {
  const replayMode = options.replayMode || REPLAY_MODES.OFFSET;

  if (!options.sourceTopic) {
    throw new Error('Missing required argument "--source"');
  }

  if (!options.destinationTopic) {
    throw new Error('Missing required argument "--destination"');
  }

  if (options.sourceTopic === options.destinationTopic) {
    throw new Error('Source and destination topics must be different');
  }

  if (replayMode === REPLAY_MODES.OFFSET && options.startOffset > options.endOffset) {
    throw new Error('"--start" must be less than or equal to "--end"');
  }

  if (
    replayMode === REPLAY_MODES.TIMESTAMP &&
    options.startTimestampMs >= options.endTimestampMs
  ) {
    throw new Error('"--start-timestamp" must be before "--end-timestamp"');
  }

  if (!options.clientId) {
    throw new Error('Kafka client id must not be empty');
  }

  if (!options.replayJobId) {
    throw new Error('Replay job id must not be empty');
  }

  if (options.progressInterval < 1) {
    throw new Error('"--progress-every" must be a positive integer');
  }
}

function buildKafkaEnv(options, env = process.env) {
  return {
    ...env,
    KAFKA_BROKERS: options.brokers.join(','),
    KAFKA_CLIENT_ID: options.clientId,
  };
}

function createReplayGroupId() {
  return `lighthouse-replay-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
}

function toHeaderString(value) {
  if (value === undefined || value === null) {
    return '';
  }

  if (Buffer.isBuffer(value)) {
    return value.toString('utf8');
  }

  return String(value);
}

function formatPreviewText(value, maxLength = 160) {
  const normalizedValue = toHeaderString(value).replace(/\s+/g, ' ').trim();

  if (!normalizedValue) {
    return '<empty>';
  }

  if (normalizedValue.length <= maxLength) {
    return normalizedValue;
  }

  return `${normalizedValue.slice(0, maxLength - 1)}...`;
}

function formatHeadersForPreview(headers = {}) {
  return Object.fromEntries(
    Object.entries(headers).map(([key, value]) => [key, toHeaderString(value)])
  );
}

function createPreviewMessage({
  destinationTopic,
  message,
  offset,
  partition,
  replayHeaders,
  sourceTopic,
}) {
  return {
    destinationTopic,
    headers: formatHeadersForPreview(replayHeaders),
    key: toHeaderString(message.key),
    offset,
    partition,
    sourceTopic,
    timestamp: message.timestamp || null,
    value: toHeaderString(message.value),
  };
}

function buildReplayHeaders({
  existingHeaders = {},
  offset,
  partition,
  replayJobId,
  sourceTopic,
}) {
  return {
    ...existingHeaders,
    'x-original-offset': String(offset),
    'x-original-partition': String(partition),
    'x-original-topic': sourceTopic,
    'x-replay-job-id': replayJobId,
    'x-replayed': 'true',
  };
}

function logDryRunPreview({
  logger,
  previewMessage,
  previewIndex,
  totalMessages,
}) {
  logger.log(
    `Dry run preview ${previewIndex}/${totalMessages}: ${previewMessage.sourceTopic}[${previewMessage.partition}] offset ${previewMessage.offset} -> ${previewMessage.destinationTopic}[${previewMessage.partition}] key="${formatPreviewText(
      previewMessage.key
    )}" value="${formatPreviewText(previewMessage.value)}" headers=${JSON.stringify(
      previewMessage.headers
    )}`
  );
}

function findPartitionOffsets(partitionOffsets, partition, label) {
  const match = partitionOffsets.find((entry) => entry.partition === partition);

  if (!match) {
    throw new Error(`${label} does not have partition ${partition}`);
  }

  return {
    earliestOffset: Number(match.low || 0),
    nextOffset: Number(match.high || match.offset || 0),
  };
}

function findPartitionTimestampOffset(partitionOffsets, partition, label) {
  const match = partitionOffsets.find((entry) => entry.partition === partition);

  if (!match) {
    throw new Error(`${label} does not have partition ${partition}`);
  }

  const offset = Number(match.offset);
  if (!Number.isInteger(offset) || offset < 0) {
    throw new Error(`${label} returned invalid timestamp offset "${match.offset}"`);
  }

  return offset;
}

async function resolveTimestampOffsetRange(admin, options) {
  if (typeof admin.fetchTopicOffsetsByTimestamp !== 'function') {
    throw new Error('Kafka admin client does not support timestamp offset lookup');
  }

  const [startOffsets, endOffsets] = await Promise.all([
    admin.fetchTopicOffsetsByTimestamp(options.sourceTopic, options.startTimestampMs),
    admin.fetchTopicOffsetsByTimestamp(options.sourceTopic, options.endTimestampMs),
  ]);

  const startOffset = findPartitionTimestampOffset(
    startOffsets,
    options.partition,
    `Source topic "${options.sourceTopic}"`
  );
  const endExclusiveOffset = findPartitionTimestampOffset(
    endOffsets,
    options.partition,
    `Source topic "${options.sourceTopic}"`
  );

  return {
    endExclusiveOffset,
    endOffset: endExclusiveOffset - 1,
    startOffset,
  };
}

async function resolveReplayPlan(admin, options) {
  const replayMode = options.replayMode || REPLAY_MODES.OFFSET;
  const topicNames = new Set(await admin.listTopics());

  if (!topicNames.has(options.sourceTopic)) {
    throw new Error(`Source topic "${options.sourceTopic}" does not exist`);
  }

  if (!topicNames.has(options.destinationTopic)) {
    throw new Error(`Destination topic "${options.destinationTopic}" does not exist`);
  }

  const [sourcePartitionOffsets, destinationPartitionOffsets] = await Promise.all([
    admin.fetchTopicOffsets(options.sourceTopic),
    admin.fetchTopicOffsets(options.destinationTopic),
  ]);

  const sourcePartition = findPartitionOffsets(
    sourcePartitionOffsets,
    options.partition,
    `Source topic "${options.sourceTopic}"`
  );
  findPartitionOffsets(
    destinationPartitionOffsets,
    options.partition,
    `Destination topic "${options.destinationTopic}"`
  );

  const requestedRange =
    replayMode === REPLAY_MODES.TIMESTAMP
      ? await resolveTimestampOffsetRange(admin, options)
      : {
          endExclusiveOffset: options.endOffset + 1,
          endOffset: options.endOffset,
          startOffset: options.startOffset,
        };

  if (requestedRange.startOffset > requestedRange.endOffset) {
    if (replayMode === REPLAY_MODES.TIMESTAMP) {
      throw new Error(
        `Timestamp window ${options.startTimestamp} to ${options.endTimestamp} resolved to no messages for ${options.sourceTopic}[${options.partition}]`
      );
    }

    throw new Error('"--start" must be less than or equal to "--end"');
  }

  if (requestedRange.startOffset < sourcePartition.earliestOffset) {
    throw new Error(
      `Start offset ${requestedRange.startOffset} is before the earliest available offset ${sourcePartition.earliestOffset} for ${options.sourceTopic}[${options.partition}]`
    );
  }

  if (requestedRange.endOffset >= sourcePartition.nextOffset) {
    throw new Error(
      `End offset ${requestedRange.endOffset} must be lower than the next unread offset ${sourcePartition.nextOffset} for ${options.sourceTopic}[${options.partition}]`
    );
  }

  return {
    earliestOffset: sourcePartition.earliestOffset,
    endExclusiveOffset: requestedRange.endExclusiveOffset,
    endOffset: requestedRange.endOffset,
    replayMode,
    nextOffset: sourcePartition.nextOffset,
    startOffset: requestedRange.startOffset,
    startTimestamp: options.startTimestamp,
    endTimestamp: options.endTimestamp,
    totalMessages: requestedRange.endOffset - requestedRange.startOffset + 1,
  };
}

async function resolveReplayPlanWithKafka(
  options,
  { env = process.env, kafkaFactory = createKafka } = {}
) {
  const kafka = kafkaFactory(buildKafkaEnv(options, env));
  const admin = kafka.admin();

  await admin.connect();

  try {
    return await resolveReplayPlan(admin, options);
  } finally {
    await admin.disconnect();
  }
}

async function replayOffsetRange({
  consumer,
  producer,
  logger = console,
  onProgress = async () => {},
  onPreviewMessage = async () => {},
  sourceTopic,
  destinationTopic,
  partition,
  startOffset,
  endOffset,
  dryRun = false,
  progressInterval = DEFAULT_PROGRESS_INTERVAL,
  replayJobId,
}) {
  const totalMessages = endOffset - startOffset + 1;
  let replayedCount = 0;
  let lastReplayedOffset = null;
  let stopRequested = false;
  let resolveCompletion;
  let rejectCompletion;
  const completion = new Promise((resolve, reject) => {
    resolveCompletion = resolve;
    rejectCompletion = reject;
  });
  let completionSettled = false;

  const completeSuccessfully = () => {
    if (completionSettled) {
      return;
    }

    completionSettled = true;
    resolveCompletion({
      destinationTopic,
      endOffset,
      lastReplayedOffset,
      partition,
      replayedCount,
      sourceTopic,
      startOffset,
      totalMessages,
    });
  };

  const completeWithError = (error) => {
    if (completionSettled) {
      return;
    }

    completionSettled = true;
    rejectCompletion(error);
  };

  const requestStop = () => {
    if (stopRequested) {
      return;
    }

    stopRequested = true;
    consumer.stop().catch((error) => {
      completeWithError(error);
    });
  };

  const groupJoin = new Promise((resolve) => {
    consumer.on(consumer.events.GROUP_JOIN, () => {
      resolve();
    });
  });
  consumer.on(consumer.events.STOP, () => {
    if (replayedCount !== totalMessages) {
      completeWithError(
        new Error(
          `Replay stopped after copying ${replayedCount} of ${totalMessages} messages from ${sourceTopic}[${partition}]`
        )
      );
      return;
    }

    completeSuccessfully();
  });
  consumer.on(consumer.events.CRASH, (event) => {
    const error = event?.payload?.error || new Error('Kafka consumer crashed');
    completeWithError(error);
  });

  consumer
    .run({
      autoCommit: false,
      eachMessage: async ({ message, partition: currentPartition, topic }) => {
        if (stopRequested || topic !== sourceTopic || currentPartition !== partition) {
          return;
        }

        const currentOffset = Number(message.offset);
        if (currentOffset < startOffset) {
          return;
        }

        if (currentOffset > endOffset) {
          requestStop();
          return;
        }

        const replayHeaders = buildReplayHeaders({
          existingHeaders: message.headers || {},
          offset: currentOffset,
          partition,
          replayJobId,
          sourceTopic,
        });

        if (dryRun) {
          const previewMessage = createPreviewMessage({
            destinationTopic,
            message,
            offset: currentOffset,
            partition,
            replayHeaders,
            sourceTopic,
          });
          await onPreviewMessage(previewMessage);
          logDryRunPreview({
            logger,
            previewMessage,
            previewIndex: replayedCount + 1,
            totalMessages,
          });
        } else {
          await producer.send({
            topic: destinationTopic,
            messages: [
              {
                headers: replayHeaders,
                key: message.key,
                partition,
                timestamp: message.timestamp,
                value: message.value,
              },
            ],
          });
        }

        replayedCount += 1;
        lastReplayedOffset = currentOffset;
        await onProgress({
          currentOffset,
          destinationTopic,
          dryRun,
          lastReplayedOffset,
          partition,
          replayedCount,
          replayJobId,
          sourceTopic,
          totalMessages,
        });

        if (
          !dryRun &&
          (
            replayedCount === 1 ||
            replayedCount % progressInterval === 0 ||
            currentOffset === endOffset
          )
        ) {
          logger.log(
            `Replayed ${replayedCount}/${totalMessages} messages from ${sourceTopic}[${partition}] (current offset ${currentOffset})`
          );
        }

        if (currentOffset === endOffset) {
          requestStop();
        }
      },
    })
    .catch((error) => {
      completeWithError(error);
    });

  consumer.pause([{ topic: sourceTopic }]);
  await groupJoin;
  consumer.seek({
    offset: String(startOffset),
    partition,
    topic: sourceTopic,
  });
  consumer.resume([
    {
      partitions: [partition],
      topic: sourceTopic,
    },
  ]);

  return completion;
}

async function runReplay(rawOptions, dependencies = {}) {
  const {
    env = process.env,
    kafkaFactory = createKafka,
    logger = console,
    onProgress = async () => {},
    onPreviewMessage = async () => {},
  } = dependencies;
  const options = normalizeReplayOptions(rawOptions, env);
  validateReplayOptions(options);

  const kafka = kafkaFactory(buildKafkaEnv(options, env));
  const admin = kafka.admin();
  const producer = options.dryRun ? null : kafka.producer();
  const consumer = kafka.consumer({ groupId: createReplayGroupId() });

  await admin.connect();
  if (producer) {
    await producer.connect();
  }
  await consumer.connect();

  try {
    const replayPlan = await resolveReplayPlan(admin, options);
    await consumer.subscribe({
      fromBeginning: true,
      topic: options.sourceTopic,
    });

    logger.log(
      `Validated replay plan: ${options.sourceTopic}[${options.partition}] offsets ${replayPlan.startOffset}-${replayPlan.endOffset} -> ${options.destinationTopic}[${options.partition}] (${replayPlan.totalMessages} messages, job ${options.replayJobId})`
    );

    const summary = await replayOffsetRange({
      consumer,
      destinationTopic: options.destinationTopic,
      dryRun: options.dryRun,
      endOffset: replayPlan.endOffset,
      logger,
      onProgress,
      onPreviewMessage,
      partition: options.partition,
      producer,
      progressInterval: options.progressInterval,
      replayJobId: options.replayJobId,
      sourceTopic: options.sourceTopic,
      startOffset: replayPlan.startOffset,
    });

    if (options.dryRun) {
      logger.log(
        `Dry run complete: previewed ${summary.replayedCount} messages from ${summary.sourceTopic}[${summary.partition}] for ${summary.destinationTopic}[${summary.partition}]`
      );
    } else {
      logger.log(
        `Replay complete: copied ${summary.replayedCount} messages from ${summary.sourceTopic}[${summary.partition}] into ${summary.destinationTopic}[${summary.partition}]`
      );
    }

    return {
      ...summary,
      clientId: options.clientId,
      dryRun: options.dryRun,
      earliestAvailableOffset: replayPlan.earliestOffset,
      endExclusiveOffset: replayPlan.endExclusiveOffset,
      endTimestamp: replayPlan.endTimestamp,
      nextOffset: replayPlan.nextOffset,
      replayMode: replayPlan.replayMode,
      replayJobId: options.replayJobId,
      startTimestamp: replayPlan.startTimestamp,
    };
  } finally {
    await Promise.allSettled([
      consumer.disconnect(),
      producer ? producer.disconnect() : Promise.resolve(),
      admin.disconnect(),
    ]);
  }
}

async function main(argv = process.argv.slice(2), dependencies = {}) {
  let parsedArgs;

  try {
    parsedArgs = parseCliArgs(argv);
  } catch (error) {
    console.error(error.message);
    console.error('');
    console.error(formatUsage());
    process.exitCode = 1;
    return null;
  }

  if (parsedArgs.help) {
    console.log(formatUsage());
    return null;
  }

  try {
    return await runReplay(parsedArgs, dependencies);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
    return null;
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  DEFAULT_CLIENT_ID,
  DEFAULT_PROGRESS_INTERVAL,
  REPLAY_MODES,
  buildReplayHeaders,
  buildKafkaEnv,
  createPreviewMessage,
  createReplayJobId,
  createReplayGroupId,
  findPartitionOffsets,
  formatHeadersForPreview,
  formatPreviewText,
  formatUsage,
  logDryRunPreview,
  main,
  normalizeReplayOptions,
  parseCliBoolean,
  parseCliArgs,
  parseRequiredTimestamp,
  replayOffsetRange,
  resolveReplayPlan,
  resolveReplayPlanWithKafka,
  runReplay,
  validateReplayOptions,
};
