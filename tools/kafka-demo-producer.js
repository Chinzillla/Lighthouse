const { createKafka } = require('./kafka-config');

const TOPIC = process.env.KAFKA_DEMO_TOPIC || 'orders';
const INTERVAL_MS = Number(process.env.KAFKA_DEMO_INTERVAL_MS || 2000);

function createOrderEvent(sequence) {
  return {
    eventId: `evt-${Date.now()}-${sequence}`,
    orderId: `order-${1000 + sequence}`,
    status: ['created', 'paid', 'packed', 'shipped'][sequence % 4],
    total: Number((25 + sequence * 3.17).toFixed(2)),
    emittedAt: new Date().toISOString(),
  };
}

async function main() {
  const kafka = createKafka({
    ...process.env,
    KAFKA_CLIENT_ID: process.env.KAFKA_CLIENT_ID || 'lighthouse-demo-producer',
  });
  const producer = kafka.producer();
  let sequence = 0;

  await producer.connect();
  console.log(`Producing demo Kafka events to topic "${TOPIC}" every ${INTERVAL_MS}ms`);

  const sendEvent = async () => {
    sequence += 1;
    const event = createOrderEvent(sequence);

    await producer.send({
      topic: TOPIC,
      messages: [
        {
          key: event.orderId,
          value: JSON.stringify(event),
          headers: {
            'x-lighthouse-demo': 'true',
          },
        },
      ],
    });
  };

  await sendEvent();
  const interval = setInterval(() => {
    sendEvent().catch((error) => {
      console.error('Failed to produce demo event', error);
    });
  }, INTERVAL_MS);

  const shutdown = async () => {
    clearInterval(interval);
    await producer.disconnect();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
