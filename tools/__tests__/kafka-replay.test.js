/** @jest-environment node */

const {
  normalizeReplayOptions,
  parseCliArgs,
  resolveReplayPlan,
  runReplay,
  validateReplayOptions,
} = require('../kafka-replay');

function createLogger() {
  return {
    log: jest.fn(),
  };
}

describe('Kafka replay CLI', () => {
  it('parses long-form CLI arguments with equals syntax', () => {
    expect(
      parseCliArgs([
        '--source=orders',
        '--destination',
        'orders-replay',
        '--partition',
        '2',
        '--start',
        '10',
        '--end',
        '25',
      ])
    ).toEqual({
      destination: 'orders-replay',
      end: '25',
      partition: '2',
      source: 'orders',
      start: '10',
    });
  });

  it('normalizes replay options from CLI args and environment defaults', () => {
    expect(
      normalizeReplayOptions(
        {
          destination: 'orders-replay',
          end: '25',
          partition: '2',
          source: 'orders',
          start: '10',
        },
        {
          KAFKA_BROKERS: 'localhost:19092,localhost:19093',
        }
      )
    ).toEqual({
      brokers: ['localhost:19092', 'localhost:19093'],
      clientId: 'lighthouse-replay-cli',
      destinationTopic: 'orders-replay',
      endOffset: 25,
      partition: 2,
      progressInterval: 25,
      sourceTopic: 'orders',
      startOffset: 10,
    });
  });

  it('rejects unsafe or invalid replay options early', () => {
    expect(() =>
      validateReplayOptions({
        brokers: ['localhost:19092'],
        clientId: 'lighthouse-replay-cli',
        destinationTopic: 'orders-replay',
        endOffset: 5,
        partition: 0,
        progressInterval: 25,
        sourceTopic: 'orders',
        startOffset: 7,
      })
    ).toThrow('"--start" must be less than or equal to "--end"');

    expect(() =>
      validateReplayOptions({
        brokers: ['localhost:19092'],
        clientId: 'lighthouse-replay-cli',
        destinationTopic: 'orders',
        endOffset: 7,
        partition: 0,
        progressInterval: 25,
        sourceTopic: 'orders',
        startOffset: 5,
      })
    ).toThrow('Source and destination topics must be different');
  });

  it('resolves partition bounds and rejects ranges outside retained offsets', async () => {
    const admin = {
      fetchTopicOffsets: jest.fn((topic) => {
        if (topic === 'orders') {
          return Promise.resolve([
            { partition: 0, low: '5', high: '15', offset: '15' },
            { partition: 1, low: '0', high: '20', offset: '20' },
          ]);
        }

        return Promise.resolve([{ partition: 0, low: '0', high: '0', offset: '0' }]);
      }),
      listTopics: jest.fn().mockResolvedValue(['orders', 'orders-replay']),
    };

    await expect(
      resolveReplayPlan(admin, {
        destinationTopic: 'orders-replay',
        endOffset: 10,
        partition: 0,
        sourceTopic: 'orders',
        startOffset: 4,
      })
    ).rejects.toThrow(
      'Start offset 4 is before the earliest available offset 5 for orders[0]'
    );

    await expect(
      resolveReplayPlan(admin, {
        destinationTopic: 'orders-replay',
        endOffset: 15,
        partition: 0,
        sourceTopic: 'orders',
        startOffset: 5,
      })
    ).rejects.toThrow(
      'End offset 15 must be lower than the next unread offset 15 for orders[0]'
    );
  });

  it('replays only the requested partition range and preserves message payloads', async () => {
    const logger = createLogger();
    const producedMessages = [];
    const eventHandlers = {
      CRASH: [],
      GROUP_JOIN: [],
      STOP: [],
    };

    const admin = {
      connect: jest.fn().mockResolvedValue(undefined),
      disconnect: jest.fn().mockResolvedValue(undefined),
      fetchTopicOffsets: jest.fn((topic) => {
        if (topic === 'orders') {
          return Promise.resolve([
            { partition: 0, low: '0', high: '20', offset: '20' },
            { partition: 1, low: '0', high: '12', offset: '12' },
          ]);
        }

        return Promise.resolve([
          { partition: 0, low: '0', high: '0', offset: '0' },
          { partition: 1, low: '0', high: '0', offset: '0' },
        ]);
      }),
      listTopics: jest.fn().mockResolvedValue(['orders', 'orders-replay']),
    };

    const producer = {
      connect: jest.fn().mockResolvedValue(undefined),
      disconnect: jest.fn().mockResolvedValue(undefined),
      send: jest.fn(({ messages, topic }) => {
        producedMessages.push({
          message: messages[0],
          topic,
        });
        return Promise.resolve();
      }),
    };

    const consumer = {
      connect: jest.fn().mockResolvedValue(undefined),
      disconnect: jest.fn().mockResolvedValue(undefined),
      events: {
        CRASH: 'CRASH',
        GROUP_JOIN: 'GROUP_JOIN',
        STOP: 'STOP',
      },
      on: jest.fn((event, handler) => {
        eventHandlers[event].push(handler);

        return () => {};
      }),
      pause: jest.fn(),
      resume: jest.fn(),
      seek: jest.fn(),
      subscribe: jest.fn().mockResolvedValue(undefined),
      stop: jest.fn().mockImplementation(async () => {
        await Promise.all(eventHandlers.STOP.map((handler) => handler({})));
      }),
      run: jest.fn(({ eachMessage }) => {
        queueMicrotask(async () => {
          await Promise.all(eventHandlers.GROUP_JOIN.map((handler) => handler({})));
          await eachMessage({
            message: {
              headers: { 'x-source': 'orders' },
              key: Buffer.from('order-11'),
              offset: '11',
              timestamp: '1714300000000',
              value: Buffer.from('payload-11'),
            },
            partition: 0,
            topic: 'orders',
          });
          await eachMessage({
            message: {
              headers: { 'x-source': 'orders' },
              key: Buffer.from('order-12'),
              offset: '12',
              timestamp: '1714300001000',
              value: Buffer.from('payload-12'),
            },
            partition: 0,
            topic: 'orders',
          });
          await eachMessage({
            message: {
              headers: { ignored: 'true' },
              key: Buffer.from('order-99'),
              offset: '7',
              timestamp: '1714300002000',
              value: Buffer.from('payload-other'),
            },
            partition: 1,
            topic: 'orders',
          });
          await eachMessage({
            message: {
              headers: { 'x-source': 'orders' },
              key: Buffer.from('order-13'),
              offset: '13',
              timestamp: '1714300003000',
              value: Buffer.from('payload-13'),
            },
            partition: 0,
            topic: 'orders',
          });
        });

        return Promise.resolve();
      }),
    };

    const kafkaFactory = jest.fn().mockReturnValue({
      admin: () => admin,
      consumer: jest.fn().mockReturnValue(consumer),
      producer: jest.fn().mockReturnValue(producer),
    });

    const summary = await runReplay(
      {
        destination: 'orders-replay',
        end: '12',
        partition: '0',
        source: 'orders',
        start: '11',
      },
      {
        env: {
          KAFKA_BROKERS: 'localhost:19092,localhost:19093,localhost:19094',
        },
        kafkaFactory,
        logger,
      }
    );

    expect(kafkaFactory).toHaveBeenCalledWith(
      expect.objectContaining({
        KAFKA_BROKERS: 'localhost:19092,localhost:19093,localhost:19094',
        KAFKA_CLIENT_ID: 'lighthouse-replay-cli',
      })
    );
    expect(consumer.subscribe).toHaveBeenCalledWith({
      fromBeginning: true,
      topic: 'orders',
    });

    expect(consumer.pause).toHaveBeenCalledWith([{ topic: 'orders' }]);
    expect(consumer.seek).toHaveBeenCalledWith({
      offset: '11',
      partition: 0,
      topic: 'orders',
    });
    expect(consumer.resume).toHaveBeenCalledWith([
      {
        partitions: [0],
        topic: 'orders',
      },
    ]);

    expect(summary).toMatchObject({
      clientId: 'lighthouse-replay-cli',
      destinationTopic: 'orders-replay',
      endOffset: 12,
      earliestAvailableOffset: 0,
      lastReplayedOffset: 12,
      nextOffset: 20,
      partition: 0,
      replayedCount: 2,
      sourceTopic: 'orders',
      startOffset: 11,
      totalMessages: 2,
    });

    expect(producedMessages).toHaveLength(2);
    expect(producedMessages[0]).toEqual({
      message: {
        headers: { 'x-source': 'orders' },
        key: Buffer.from('order-11'),
        partition: 0,
        timestamp: '1714300000000',
        value: Buffer.from('payload-11'),
      },
      topic: 'orders-replay',
    });
    expect(producedMessages[1].message.key.toString()).toBe('order-12');

    expect(logger.log).toHaveBeenCalledWith(
      'Validated replay plan: orders[0] offsets 11-12 -> orders-replay[0] (2 messages)'
    );
    expect(logger.log).toHaveBeenCalledWith(
      'Replayed 1/2 messages from orders[0] (current offset 11)'
    );
    expect(logger.log).toHaveBeenCalledWith(
      'Replayed 2/2 messages from orders[0] (current offset 12)'
    );
    expect(logger.log).toHaveBeenCalledWith(
      'Replay complete: copied 2 messages from orders[0] into orders-replay[0]'
    );
  });
});
