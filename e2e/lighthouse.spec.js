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

  await page.goto('/');
}

test.describe('Lighthouse operations console', () => {
  test('loads the current dashboard shell', async ({ page }) => {
    await stubDashboardMetrics(page);

    await expect(page.getByRole('link', { name: 'Lighthouse home' })).toBeVisible();
    await expect(page.getByText('Kafka operations console')).toBeVisible();
    await expect(
      page.getByRole('heading', {
        name: 'Cluster signals with a cleaner path to replay tooling.',
      })
    ).toBeVisible();
  });

  test('renders primary navigation', async ({ page }) => {
    await stubDashboardMetrics(page);

    const navigation = page.getByRole('navigation', {
      name: 'Primary navigation',
    });

    await expect(navigation.getByRole('link', { name: 'Metrics' })).toHaveAttribute(
      'href',
      '#metrics'
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
    await stubDashboardMetrics(page);

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
    await stubDashboardMetrics(page);

    await expect(page.getByText('Kafka Activity')).toBeVisible();
    await expect(page.getByText('Topic Inventory')).toBeVisible();
    await expect(
      page.getByRole('heading', {
        name: 'Foundation first, replay engine next.',
      })
    ).toBeVisible();
  });

  test('keeps snapshot charts bounded inside the dashboard', async ({ page }) => {
    await stubDashboardMetrics(page);

    const layout = await page.evaluate(() => ({
      bodyHeight: document.body.scrollHeight,
      chartPanels: Array.from(
        document.querySelectorAll('[aria-label="Kafka snapshots"] article')
      ).map((panel) => ({
        height: panel.getBoundingClientRect().height,
        canvasHeight: panel.querySelector('canvas')?.getBoundingClientRect().height,
      })),
    }));

    expect(layout.bodyHeight).toBeLessThan(1400);
    expect(layout.chartPanels).toHaveLength(2);
    layout.chartPanels.forEach((panel) => {
      expect(panel.height).toBeLessThanOrEqual(380);
      expect(panel.canvasHeight).toBeLessThanOrEqual(300);
    });
  });

  test('shows Prometheus unavailable when the metrics API fails', async ({ page }) => {
    await page.route('**/api/dashboard-metrics', (route) =>
      route.fulfill({
        body: JSON.stringify({ error: 'Prometheus unavailable' }),
        contentType: 'application/json',
        status: 500,
      })
    );

    await page.goto('/');

    await expect(page.getByText('Prometheus unavailable')).toBeVisible();
    await expect(page.getByLabel('Kafka metrics')).toBeVisible();
  });
});
