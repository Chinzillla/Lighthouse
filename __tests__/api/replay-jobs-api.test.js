/** @jest-environment node */

const {
  createMockRequest,
  createMockResponse,
  createTempReplayEnvironment,
} = require('../../test-support/api-test-helpers');
const { createReplayJobStore, JOB_STATUSES } = require('../../lib/replay-jobs/store');
const jobsIndexRoute = require('../../pages/api/jobs/index');
const jobDetailRoute = require('../../pages/api/jobs/[jobId]');
const jobCancelRoute = require('../../pages/api/jobs/[jobId]/cancel');
const jobPreviewRoute = require('../../pages/api/jobs/[jobId]/preview');
const jobStartRoute = require('../../pages/api/jobs/[jobId]/start');

describe('Replay job API routes', () => {
  it('creates and lists replay jobs through /api/jobs', async () => {
    const { cleanup, env } = createTempReplayEnvironment();

    try {
      const handler = jobsIndexRoute.createHandler({
        env,
        now: () => '2026-04-28T17:00:00.000Z',
      });
      const createResponse = createMockResponse();

      await handler(
        createMockRequest({
          body: {
            destination: 'orders-replay',
            end: '12',
            'job-id': 'job-api-1',
            partition: '0',
            source: 'orders',
            start: '10',
          },
          method: 'POST',
        }),
        createResponse
      );

      expect(createResponse.statusCode).toBe(201);
      expect(createResponse.body.job).toMatchObject({
        jobId: 'job-api-1',
        progressTotal: 3,
        status: JOB_STATUSES.DRAFT,
      });

      const listResponse = createMockResponse();
      await handler(
        createMockRequest({
          method: 'GET',
          query: { limit: '10' },
        }),
        listResponse
      );

      expect(listResponse.statusCode).toBe(200);
      expect(listResponse.body.jobs).toHaveLength(1);
      expect(listResponse.body.jobs[0]).toMatchObject({
        jobId: 'job-api-1',
        sourceTopic: 'orders',
      });
    } finally {
      cleanup();
    }
  });

  it('returns validation errors for invalid /api/jobs requests', async () => {
    const { cleanup, env } = createTempReplayEnvironment();

    try {
      const handler = jobsIndexRoute.createHandler({ env });
      const invalidCreateResponse = createMockResponse();

      await handler(
        createMockRequest({
          body: {
            destination: 'orders',
            end: '5',
            partition: '0',
            source: 'orders',
            start: '0',
          },
          method: 'POST',
        }),
        invalidCreateResponse
      );

      expect(invalidCreateResponse.statusCode).toBe(400);
      expect(invalidCreateResponse.body).toEqual({
        error: 'Source and destination topics must be different',
      });

      const invalidListResponse = createMockResponse();
      await handler(
        createMockRequest({
          method: 'GET',
          query: { limit: '0' },
        }),
        invalidListResponse
      );

      expect(invalidListResponse.statusCode).toBe(400);
      expect(invalidListResponse.body).toEqual({
        error: 'Replay job list limit must be a positive integer',
      });
    } finally {
      cleanup();
    }
  });

  it('gets, previews, starts, and cancels jobs through the nested API routes', async () => {
    const { cleanup, env } = createTempReplayEnvironment();
    const store = createReplayJobStore({
      dbPath: env.LIGHTHOUSE_DB_PATH,
    });

    try {
      store.createJob({
        clientId: 'lighthouse-replay-cli',
        completedAt: null,
        createdAt: '2026-04-28T17:10:00.000Z',
        destinationTopic: 'orders-replay',
        dryRun: false,
        endOffset: 12,
        errorMessage: null,
        jobId: 'job-api-2',
        lastReplayedOffset: null,
        partition: 0,
        progressInterval: 25,
        progressTotal: 3,
        replayedCount: 0,
        sourceTopic: 'orders',
        startedAt: null,
        startOffset: 10,
        status: JOB_STATUSES.DRAFT,
        updatedAt: '2026-04-28T17:10:00.000Z',
      });

      const detailResponse = createMockResponse();
      await jobDetailRoute.createHandler({ env })(
        createMockRequest({
          method: 'GET',
          query: { jobId: 'job-api-2' },
        }),
        detailResponse
      );

      expect(detailResponse.statusCode).toBe(200);
      expect(detailResponse.body.job).toMatchObject({
        jobId: 'job-api-2',
        status: JOB_STATUSES.DRAFT,
      });

      const previewResponse = createMockResponse();
      await jobPreviewRoute.createHandler({
        env,
        replayRunner: async (_options, { onPreviewMessage }) => {
          await onPreviewMessage({
            destinationTopic: 'orders-replay',
            headers: { 'x-replayed': 'true' },
            key: 'order-10',
            offset: 10,
            partition: 0,
            sourceTopic: 'orders',
            timestamp: '1714320000000',
            value: '{"orderId":"order-10"}',
          });

          return {
            destinationTopic: 'orders-replay',
            dryRun: true,
            endOffset: 12,
            lastReplayedOffset: 10,
            partition: 0,
            replayJobId: 'job-api-2',
            replayedCount: 1,
            sourceTopic: 'orders',
            startOffset: 10,
            totalMessages: 3,
          };
        },
      })(
        createMockRequest({
          method: 'GET',
          query: { jobId: 'job-api-2' },
        }),
        previewResponse
      );

      expect(previewResponse.statusCode).toBe(200);
      expect(previewResponse.body.preview.messages).toEqual([
        {
          destinationTopic: 'orders-replay',
          headers: { 'x-replayed': 'true' },
          key: 'order-10',
          offset: 10,
          partition: 0,
          sourceTopic: 'orders',
          timestamp: '1714320000000',
          value: '{"orderId":"order-10"}',
        },
      ]);
      expect(previewResponse.body.preview.summary).toMatchObject({
        replayedCount: 1,
        totalMessages: 3,
      });

      const startResponse = createMockResponse();
      await jobStartRoute.createHandler({
        env,
        startInBackground: jest.fn(() => ({
          completedAt: null,
          jobId: 'job-api-2',
          startedAt: '2026-04-28T17:15:00.000Z',
          status: JOB_STATUSES.RUNNING,
        })),
      })(
        createMockRequest({
          method: 'POST',
          query: { jobId: 'job-api-2' },
        }),
        startResponse
      );

      expect(startResponse.statusCode).toBe(202);
      expect(startResponse.body.job).toMatchObject({
        jobId: 'job-api-2',
        status: JOB_STATUSES.RUNNING,
      });

      const cancelResponse = createMockResponse();
      await jobCancelRoute.createHandler({
        env,
        now: () => '2026-04-28T17:20:00.000Z',
      })(
        createMockRequest({
          method: 'POST',
          query: { jobId: 'job-api-2' },
        }),
        cancelResponse
      );

      expect(cancelResponse.statusCode).toBe(200);
      expect(cancelResponse.body.job).toMatchObject({
        completedAt: '2026-04-28T17:20:00.000Z',
        jobId: 'job-api-2',
        status: JOB_STATUSES.CANCELLED,
      });
    } finally {
      store.close();
      cleanup();
    }
  });

  it('enforces allowed methods and not-found responses on nested routes', async () => {
    const { cleanup, env } = createTempReplayEnvironment();

    try {
      const methodResponse = createMockResponse();
      await jobDetailRoute.createHandler({ env })(
        createMockRequest({
          method: 'POST',
          query: { jobId: 'missing-job' },
        }),
        methodResponse
      );

      expect(methodResponse.statusCode).toBe(405);
      expect(methodResponse.headers.Allow).toBe('GET');

      const notFoundResponse = createMockResponse();
      await jobPreviewRoute.createHandler({ env })(
        createMockRequest({
          method: 'GET',
          query: { jobId: 'missing-job' },
        }),
        notFoundResponse
      );

      expect(notFoundResponse.statusCode).toBe(404);
      expect(notFoundResponse.body).toEqual({
        error: 'Replay job "missing-job" was not found',
      });
    } finally {
      cleanup();
    }
  });
});
