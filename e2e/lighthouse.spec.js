const { expect, test } = require('@playwright/test');

const dashboardMetrics = {
  brokerCount: '3',
  exporterUp: '1',
  partitionCount: '9',
  status: 'ok',
  topicCount: '4',
  totalLogEndOffset: '12500',
};

async function stubDashboardMetrics(page) {
  await page.route('**/api/dashboard-metrics', (route) =>
    route.fulfill({
      body: JSON.stringify({ dashboardMetrics }),
      contentType: 'application/json',
      status: 200,
    })
  );
}

async function stubEmptyJobs(page) {
  await page.route('**/api/jobs?limit=*', (route) =>
    route.fulfill({
      body: JSON.stringify({ jobs: [] }),
      contentType: 'application/json',
      status: 200,
    })
  );
}

async function openStubbedDashboard(page) {
  await stubDashboardMetrics(page);
  await stubEmptyJobs(page);

  await page.goto('/');
}

test.describe('Lighthouse operations console', () => {
  test('loads the current dashboard shell', async ({ page }) => {
    await openStubbedDashboard(page);

    await expect(page.getByRole('link', { name: 'Lighthouse home' })).toBeVisible();
    await expect(page.getByText('Kafka operations console')).toBeVisible();
    await expect(
      page.getByRole('heading', {
        name: 'Cluster signals and a replay workflow in one operational console.',
      })
    ).toBeVisible();
  });

  test('renders primary navigation', async ({ page }) => {
    await openStubbedDashboard(page);

    const navigation = page.getByRole('navigation', {
      name: 'Primary navigation',
    });

    await expect(navigation.getByRole('link', { name: 'Metrics' })).toHaveAttribute(
      'href',
      '#metrics'
    );
    await expect(navigation.getByRole('link', { name: 'Replay' })).toHaveAttribute(
      'href',
      '#replay'
    );
    await expect(navigation.getByRole('link', { name: 'Roadmap' })).toHaveAttribute(
      'href',
      '#roadmap'
    );
    await expect(navigation.getByRole('link', { name: 'GitHub' })).toHaveAttribute(
      'href',
      /github\.com/
    );
  });

  test('renders Kafka metric values from the metrics API', async ({ page }) => {
    await openStubbedDashboard(page);

    await expect(page.getByText('Metrics online')).toBeVisible();

    const metrics = page.getByLabel('Kafka metrics');

    await expect(metrics.getByText('Partition Count')).toBeVisible();
    await expect(metrics.getByText('9')).toBeVisible();
    await expect(metrics.getByText('Broker Signal')).toBeVisible();
    await expect(metrics.getByText('3')).toBeVisible();
    await expect(metrics.getByText('Log End Offset')).toBeVisible();
    await expect(metrics.getByText('12,500')).toBeVisible();
    await expect(metrics.getByText('Metrics Exporter')).toBeVisible();
    await expect(metrics.getByText('1', { exact: true })).toBeVisible();
  });

  test('shows chart panels and roadmap', async ({ page }) => {
    await openStubbedDashboard(page);

    await expect(page.getByText('Kafka Activity')).toBeVisible();
    await expect(page.getByText('Topic Inventory')).toBeVisible();
    await expect(
      page.getByRole('heading', {
        name: 'Prepare a bounded replay, preview the payloads, then launch it.',
      })
    ).toBeVisible();
    await expect(
      page.getByRole('heading', {
        name: 'Foundation done, replay UI underway.',
      })
    ).toBeVisible();
  });

  test('keeps snapshot charts bounded inside the dashboard', async ({ page }) => {
    await openStubbedDashboard(page);

    const layout = await page.evaluate(() => ({
      bodyHeight: document.body.scrollHeight,
      chartPanels: Array.from(
        document.querySelectorAll('[aria-label="Kafka snapshots"] article')
      ).map((panel) => ({
        height: panel.getBoundingClientRect().height,
        canvasHeight: panel.querySelector('canvas')?.getBoundingClientRect().height,
      })),
    }));

    expect(layout.bodyHeight).toBeLessThan(2200);
    expect(layout.chartPanels).toHaveLength(2);
    layout.chartPanels.forEach((panel) => {
      expect(panel.height).toBeLessThanOrEqual(380);
      expect(panel.canvasHeight).toBeLessThanOrEqual(300);
    });
  });

  test('shows Prometheus unavailable when the metrics API fails', async ({ page }) => {
    await page.route('**/api/dashboard-metrics', (route) =>
      route.fulfill({
        body: JSON.stringify({ error: 'Prometheus metrics are unavailable' }),
        contentType: 'application/json',
        status: 500,
      })
    );
    await stubEmptyJobs(page);

    await page.goto('/');

    await expect(page.getByText('Prometheus unavailable').first()).toBeVisible();
    await expect(page.getByText('Prometheus metrics are unavailable')).toBeVisible();
    await expect(page.getByLabel('Kafka metrics').getByText('Unavailable').first()).toBeVisible();
    await expect(page.getByText('No sample').first()).toBeVisible();
  });

  test('creates, previews, and starts a replay job from the workspace', async ({ page }) => {
    const jobs = [];

    await stubDashboardMetrics(page);
    await page.route('**/api/jobs?limit=*', (route) =>
      route.fulfill({
        body: JSON.stringify({ jobs }),
        contentType: 'application/json',
        status: 200,
      })
    );
    await page.route('**/api/jobs', async (route) => {
      if (route.request().method() !== 'POST') {
        await route.fallback();
        return;
      }

      const draftJob = {
        completedAt: null,
        createdAt: '2026-04-28T18:00:00.000Z',
        destinationTopic: 'orders-replay',
        dryRun: false,
        endOffset: 5,
        errorMessage: null,
        jobId: 'job-e2e-1',
        lastReplayedOffset: null,
        partition: 0,
        progressInterval: 25,
        progressTotal: 6,
        replayedCount: 0,
        sourceTopic: 'orders',
        startOffset: 0,
        status: 'draft',
        updatedAt: '2026-04-28T18:00:00.000Z',
      };

      jobs.splice(0, jobs.length, draftJob);
      await route.fulfill({
        body: JSON.stringify({ job: draftJob }),
        contentType: 'application/json',
        status: 201,
      });
    });
    await page.route('**/api/jobs/job-e2e-1/preview', async (route) => {
      await route.fulfill({
        body: JSON.stringify({
          job: jobs[0],
          preview: {
            messages: [
              {
                destinationTopic: 'orders-replay',
                headers: {
                  'x-original-offset': '0',
                  'x-replayed': 'true',
                },
                key: 'order-0',
                offset: 0,
                partition: 0,
                sourceTopic: 'orders',
                timestamp: '1714330000000',
                value: '{"orderId":"order-0","status":"created"}',
              },
            ],
            summary: {
              endOffset: 5,
              lastReplayedOffset: 0,
              replayedCount: 1,
              startOffset: 0,
              totalMessages: 6,
            },
          },
        }),
        contentType: 'application/json',
        status: 200,
      });
    });
    await page.route('**/api/jobs/job-e2e-1/start', async (route) => {
      jobs[0] = {
        ...jobs[0],
        startedAt: '2026-04-28T18:01:00.000Z',
        status: 'running',
        updatedAt: '2026-04-28T18:01:00.000Z',
      };

      await route.fulfill({
        body: JSON.stringify({ job: jobs[0] }),
        contentType: 'application/json',
        status: 202,
      });
    });

    await page.goto('/');

    await page.getByRole('button', { name: 'Save draft' }).click();
    await expect(page.getByText('Saved replay job job-e2e-1.')).toBeVisible();
    await expect(page.getByText('job-e2e-1').first()).toBeVisible();

    await page.getByRole('button', { name: 'Preview' }).click();
    await expect(page.getByText('Loaded preview for job-e2e-1.')).toBeVisible();
    await expect(page.getByText('order-0', { exact: true })).toBeVisible();
    await expect(page.getByText('{"orderId":"order-0","status":"created"}')).toBeVisible();

    await page.getByRole('button', { name: 'Start replay' }).click();
    await expect(page.getByText('Started replay job job-e2e-1.')).toBeVisible();
    await expect(page.getByText('running').first()).toBeVisible();
  });
});
