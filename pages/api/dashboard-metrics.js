import { getDashboardMetrics } from '../../lib/prometheusAPI';

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
      error: error.message || 'Prometheus metrics are unavailable',
    });
  }
}
