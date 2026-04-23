import handler, { toDashboardError } from '../pages/api/dashboard-metrics';
import { getDashboardMetrics } from '../lib/prometheusAPI';

jest.mock('../lib/prometheusAPI', () => ({
  getDashboardMetrics: jest.fn(),
}));

function createResponse() {
  return {
    json: jest.fn(),
    setHeader: jest.fn(),
    status: jest.fn(function setStatus() {
      return this;
    }),
  };
}

describe('/api/dashboard-metrics', () => {
  beforeEach(() => {
    getDashboardMetrics.mockReset();
  });

  it('returns dashboard metrics for GET requests with no-store caching', async () => {
    const response = createResponse();
    const dashboardMetrics = {
      brokerCount: '3',
      exporterUp: '1',
      partitionCount: '15',
      status: 'ok',
      topicCount: '3',
      totalLogEndOffset: '60',
    };

    getDashboardMetrics.mockResolvedValue(dashboardMetrics);

    await handler({ method: 'GET' }, response);

    expect(response.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store');
    expect(response.status).toHaveBeenCalledWith(200);
    expect(response.json).toHaveBeenCalledWith({ dashboardMetrics });
  });

  it('rejects non-GET requests before touching Prometheus', async () => {
    const response = createResponse();

    await handler({ method: 'POST' }, response);

    expect(getDashboardMetrics).not.toHaveBeenCalled();
    expect(response.setHeader).toHaveBeenCalledWith('Allow', 'GET');
    expect(response.status).toHaveBeenCalledWith(405);
    expect(response.json).toHaveBeenCalledWith({ error: 'Method not allowed' });
  });

  it('returns a safe unavailable response when Prometheus cannot be reached', async () => {
    const response = createResponse();

    getDashboardMetrics.mockRejectedValue(new Error('connect ECONNREFUSED 127.0.0.1:9090'));

    await handler({ method: 'GET' }, response);

    expect(response.status).toHaveBeenCalledWith(502);
    expect(response.json).toHaveBeenCalledWith({
      error: 'Prometheus metrics are unavailable',
    });
  });

  it('keeps actionable configuration errors visible', () => {
    expect(toDashboardError(new Error('PROMETHEUS_API must be a valid URL'))).toBe(
      'PROMETHEUS_API must be a valid URL'
    );
    expect(toDashboardError(new Error('PROMETHEUS_API host is not allowed'))).toBe(
      'PROMETHEUS_API host is not allowed'
    );
    expect(toDashboardError(new Error('Prometheus query timed out after 5000ms'))).toBe(
      'Prometheus query timed out after 5000ms'
    );
  });
});
