const { Kafka, logLevel } = require('kafkajs');

function parseBoolean(value, defaultValue = false) {
  if (value === undefined || value === null || value === '') return defaultValue;
  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
}

function parseBrokers(value) {
  return String(value || 'localhost:9092')
    .split(',')
    .map((broker) => broker.trim())
    .filter(Boolean);
}

function buildSaslConfig(env = process.env) {
  if (!env.KAFKA_SASL_USERNAME || !env.KAFKA_SASL_PASSWORD) return undefined;

  return {
    mechanism: env.KAFKA_SASL_MECHANISM || 'plain',
    username: env.KAFKA_SASL_USERNAME,
    password: env.KAFKA_SASL_PASSWORD,
  };
}

function buildKafkaConfig(env = process.env) {
  const sasl = buildSaslConfig(env);

  return {
    brokers: parseBrokers(env.KAFKA_BROKERS),
    clientId: env.KAFKA_CLIENT_ID || 'lighthouse',
    connectionTimeout: Number(env.KAFKA_CONNECTION_TIMEOUT_MS || 10000),
    requestTimeout: Number(env.KAFKA_REQUEST_TIMEOUT_MS || 30000),
    retry: {
      retries: Number(env.KAFKA_RETRY_COUNT || 5),
    },
    sasl,
    ssl: parseBoolean(env.KAFKA_SSL, Boolean(sasl)),
  };
}

function createKafka(env = process.env) {
  return new Kafka({
    ...buildKafkaConfig(env),
    logLevel: logLevel.WARN,
  });
}

module.exports = {
  buildKafkaConfig,
  createKafka,
  parseBoolean,
  parseBrokers,
};
