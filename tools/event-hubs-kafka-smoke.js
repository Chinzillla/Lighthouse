const { createKafka } = require('./kafka-config');
const { parseCliArgs } = require('./kafka-replay');

function formatUsage() {
  return [
    'Usage:',
    '  node tools/event-hubs-kafka-smoke.js --source <event-hub> [--destination <event-hub>] [--timestamp-ms <epoch-ms>]',
    '',
    'Required Event Hubs Kafka environment:',
    '  KAFKA_BROKERS=<namespace>.servicebus.windows.net:9093',
    '  KAFKA_SSL=true',
    '  KAFKA_SASL_MECHANISM=plain',
    '  KAFKA_SASL_USERNAME=$ConnectionString',
    '  KAFKA_SASL_PASSWORD=<event-hubs-connection-string>',
  ].join('\n');
}

function createSmokeMessage() {
  return {
    key: `lighthouse-smoke-${Date.now()}`,
    value: JSON.stringify({
      source: 'lighthouse-event-hubs-smoke',
      timestamp: new Date().toISOString(),
    }),
  };
}

async function consumeOneMessage(kafka, topic, { timeoutMs = 10000 } = {}) {
  const consumer = kafka.consumer({
    groupId: `lighthouse-smoke-${Date.now()}-${Math.random().toString(16).slice(2)}`,
  });

  await consumer.connect();
  await consumer.subscribe({ fromBeginning: false, topic });

  try {
    return await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        resolve(null);
      }, timeoutMs);

      consumer
        .run({
          eachMessage: async ({ message, partition }) => {
            clearTimeout(timeout);
            resolve({
              key: message.key?.toString() || null,
              offset: message.offset,
              partition,
              timestamp: message.timestamp,
            });
          },
        })
        .catch((error) => {
          clearTimeout(timeout);
          reject(error);
        });
    });
  } finally {
    await consumer.disconnect();
  }
}

async function runSmoke(argv = process.argv.slice(2), { env = process.env, logger = console } = {}) {
  if (argv.includes('--help') || argv.includes('-h')) {
    logger.log(formatUsage());
    return null;
  }

  const args = parseCliArgs(argv);
  const sourceTopic = args.source || env.EVENT_HUBS_SMOKE_SOURCE_TOPIC;
  const destinationTopic = args.destination || env.EVENT_HUBS_SMOKE_DESTINATION_TOPIC;
  const timestampMs = Number(args['timestamp-ms'] || Date.now() - 60000);

  if (!sourceTopic) {
    throw new Error('Missing required argument "--source"');
  }

  const kafka = createKafka({
    ...env,
    KAFKA_CLIENT_ID: env.KAFKA_CLIENT_ID || 'lighthouse-event-hubs-smoke',
  });
  const admin = kafka.admin();

  await admin.connect();

  try {
    const topics = await admin.listTopics();
    logger.log(`Kafka metadata reachable. Topic count: ${topics.length}`);

    if (!topics.includes(sourceTopic)) {
      throw new Error(`Source event hub "${sourceTopic}" was not found`);
    }

    const sourceOffsets = await admin.fetchTopicOffsets(sourceTopic);
    logger.log(`Read offsets for ${sourceTopic}:`);
    logger.log(JSON.stringify(sourceOffsets, null, 2));

    try {
      const timestampOffsets = await admin.fetchTopicOffsetsByTimestamp(
        sourceTopic,
        timestampMs
      );
      logger.log(`Timestamp offset lookup succeeded for ${sourceTopic}:`);
      logger.log(JSON.stringify(timestampOffsets, null, 2));
    } catch (error) {
      logger.warn(
        `Timestamp offset lookup failed: ${error.message}. Use offset replay for the Azure demo until this is validated for the namespace.`
      );
    }
  } finally {
    await admin.disconnect();
  }

  if (!destinationTopic) {
    logger.log('No destination provided; skipping produce and consume smoke checks.');
    return null;
  }

  const producer = kafka.producer();
  await producer.connect();

  try {
    const message = createSmokeMessage();
    await producer.send({
      messages: [message],
      topic: destinationTopic,
    });
    logger.log(`Produced one smoke message to ${destinationTopic}.`);
  } finally {
    await producer.disconnect();
  }

  const consumedMessage = await consumeOneMessage(kafka, destinationTopic, {
    timeoutMs: Number(args['consume-timeout-ms'] || 10000),
  });

  if (!consumedMessage) {
    throw new Error(
      `Timed out waiting for a smoke message from destination event hub "${destinationTopic}"`
    );
  }

  logger.log(`Consumed one smoke message from ${destinationTopic}:`);
  logger.log(JSON.stringify(consumedMessage, null, 2));
  return consumedMessage;
}

async function main() {
  try {
    return await runSmoke();
  } catch (error) {
    console.error(error.message);
    console.error('');
    console.error(formatUsage());
    process.exitCode = 1;
    return null;
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  consumeOneMessage,
  formatUsage,
  runSmoke,
};
