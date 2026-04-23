const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  buildKafkaConfig,
  loadDotEnv,
  parseBoolean,
  parseBrokers,
} = require('../kafka-config');

describe('Kafka configuration', () => {
  it('parses comma-separated broker lists and ignores empty entries', () => {
    expect(parseBrokers(' kafka-1:9092, ,kafka-2:9092,kafka-3:9092 ')).toEqual([
      'kafka-1:9092',
      'kafka-2:9092',
      'kafka-3:9092',
    ]);
  });

  it('uses localhost as the safe local default broker', () => {
    expect(parseBrokers(undefined)).toEqual(['localhost:9092']);
  });

  it('parses boolean environment values consistently', () => {
    expect(parseBoolean('true')).toBe(true);
    expect(parseBoolean('YES')).toBe(true);
    expect(parseBoolean('on')).toBe(true);
    expect(parseBoolean('false')).toBe(false);
    expect(parseBoolean('', true)).toBe(true);
  });

  it('loads .env files without overwriting explicit environment values', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lighthouse-env-'));
    const envPath = path.join(tempDir, '.env');
    const targetEnv = {
      KAFKA_CLIENT_ID: 'already-set',
    };

    fs.writeFileSync(
      envPath,
      [
        '# local Kafka settings',
        'KAFKA_BROKERS="kafka-1:9092,kafka-2:9092"',
        "KAFKA_SSL='true'",
        'KAFKA_CLIENT_ID=from-file',
        'INVALID_LINE_WITHOUT_SEPARATOR',
      ].join('\n')
    );

    try {
      loadDotEnv(envPath, targetEnv);

      expect(targetEnv).toEqual({
        KAFKA_BROKERS: 'kafka-1:9092,kafka-2:9092',
        KAFKA_CLIENT_ID: 'already-set',
        KAFKA_SSL: 'true',
      });
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('builds a plain Kafka client config for local clusters', () => {
    expect(
      buildKafkaConfig({
        KAFKA_BROKERS: 'localhost:19092',
        KAFKA_CLIENT_ID: 'lighthouse-local',
        KAFKA_SSL: 'false',
        KAFKA_CONNECTION_TIMEOUT_MS: '2500',
        KAFKA_REQUEST_TIMEOUT_MS: '9000',
        KAFKA_RETRY_COUNT: '2',
      })
    ).toEqual({
      brokers: ['localhost:19092'],
      clientId: 'lighthouse-local',
      connectionTimeout: 2500,
      requestTimeout: 9000,
      retry: {
        retries: 2,
      },
      sasl: undefined,
      ssl: false,
    });
  });

  it('enables TLS automatically when SASL credentials are configured', () => {
    expect(
      buildKafkaConfig({
        KAFKA_BROKERS: 'pkc.example.confluent.cloud:9092',
        KAFKA_SASL_USERNAME: 'api-key',
        KAFKA_SASL_PASSWORD: 'api-secret',
      })
    ).toMatchObject({
      brokers: ['pkc.example.confluent.cloud:9092'],
      clientId: 'lighthouse',
      sasl: {
        mechanism: 'plain',
        username: 'api-key',
        password: 'api-secret',
      },
      ssl: true,
    });
  });
});
