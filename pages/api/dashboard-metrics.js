import { getDashboardMetrics } from '../../lib/prometheusAPI';

function toDashboardError(error) {
  const message = error?.message || '';

  if (
    message.startsWith('PROMETHEUS_API') ||
    message.includes('not allowed') ||
    message.includes('timed out')
  ) {
    return message;
  }

  return 'Prometheus metrics are unavailable';
}

export default async function handler(request, response) {
  response.setHeader('Cache-Control', 'no-store');

  if (request.method !== 'GET') {
    response.setHeader('Allow', 'GET');
    response.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const dashboardMetrics = await getDashboardMetrics();
    response.status(200).json({ dashboardMetrics });
  } catch (error) {
    response.status(502).json({
      error: toDashboardError(error),
    });
  }
}

export { toDashboardError };
