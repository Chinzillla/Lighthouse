/** @jest-environment node */

const { createKafka } = require('../kafka-config');

const TEST_BROKERS =
  process.env.KAFKA_BROKERS || 'localhost:19092,localhost:19093,localhost:19094';

function uniqueId() {
  return `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}

function createKafkaTestClient(clientId) {
  return createKafka({
    ...process.env,
    KAFKA_BROKERS: TEST_BROKERS,
    KAFKA_CLIENT_ID: clientId,
  });
}

async function readMatchingMessages(kafka, topic, expectedCount, matchesMessage) {
  const consumer = kafka.consumer({
    groupId: `lighthouse-replay-readback-${uniqueId()}`,
  });
  const matches = [];
  let stopRequested = false;

  let resolveCompletion;
  let rejectCompletion;
  const completion = new Promise((resolve, reject) => {
    resolveCompletion = resolve;
    rejectCompletion = reject;
  });

  await consumer.connect();

  try {
    await consumer.subscribe({ fromBeginning: true, topic });
    consumer.on(consumer.events.STOP, () => {
      resolveCompletion(matches);
    });
    consumer.on(consumer.events.CRASH, (event) => {
      rejectCompletion(event?.payload?.error || new Error('Kafka consumer crashed'));
    });

    consumer
      .run({
        autoCommit: false,
        eachMessage: async ({ message, partition }) => {
          const normalizedMessage = {
            headers: message.headers || {},
            key: message.key ? message.key.toString() : null,
            offset: Number(message.offset),
            partition,
            value: message.value ? message.value.toString() : null,
          };

          if (!matchesMessage(normalizedMessage)) {
            return;
          }

          matches.push(normalizedMessage);

          if (matches.length === expectedCount && !stopRequested) {
            stopRequested = true;
            consumer.stop().catch((error) => {
              rejectCompletion(error);
            });
          }
        },
      })
      .catch((error) => {
        rejectCompletion(error);
      });

    let timeoutId;

    try {
      return await Promise.race([
        completion,
        new Promise((_, reject) => {
          timeoutId = setTimeout(() => {
            reject(new Error(`Timed out waiting for ${expectedCount} messages from ${topic}`));
          }, 20000);
        }),
      ]);
    } finally {
      clearTimeout(timeoutId);
    }
  } finally {
    await consumer.disconnect();
  }
}

async function getNextOffset(admin, topic, partition) {
  const partitionOffsets = await admin.fetchTopicOffsets(topic);
  const match = partitionOffsets.find((entry) => entry.partition === partition);

  if (!match) {
    throw new Error(`Topic ${topic} does not have partition ${partition}`);
  }

  return Number(match.high || match.offset || 0);
}

module.exports = {
  TEST_BROKERS,
  createKafkaTestClient,
  getNextOffset,
  readMatchingMessages,
  uniqueId,
};
