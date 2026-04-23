import {
  METRIC_EXPRESSIONS,
  PrometheusAPI,
  firstPrometheusValue,
} from '../lib/prometheusAPI';

function prometheusSample(value) {
  return {
    data: {
      result: [
        {
          value: [1713800000, String(value)],
        },
      ],
    },
  };
}

describe('PrometheusAPI', () => {
  const previousPrometheusApi = process.env.PROMETHEUS_API;

  afterEach(() => {
    jest.restoreAllMocks();

    if (previousPrometheusApi === undefined) {
      delete process.env.PROMETHEUS_API;
    } else {
      process.env.PROMETHEUS_API = previousPrometheusApi;
    }
  });

  it('reads the first valid sample value from a Prometheus query response', () => {
    expect(
      firstPrometheusValue({
        data: {
          result: [
            {},
            {
              value: [1713800000, '18'],
            },
          ],
        },
      })
    ).toBe('18');
  });

  it('falls back to zero when Prometheus returns no samples', () => {
    expect(firstPrometheusValue({ data: { result: [] } })).toBe('0');
    expect(firstPrometheusValue(undefined)).toBe('0');
  });

  it('queries all dashboard metrics and maps Prometheus samples into the API contract', async () => {
    const api = new PrometheusAPI();
    const responses = {
      [METRIC_EXPRESSIONS.brokerCount]: prometheusSample(3),
      [METRIC_EXPRESSIONS.exporterUp]: prometheusSample(1),
      [METRIC_EXPRESSIONS.partitionCount]: prometheusSample(9),
      [METRIC_EXPRESSIONS.topicCount]: prometheusSample(4),
      [METRIC_EXPRESSIONS.totalLogEndOffset]: prometheusSample(1250),
    };

    api.queryMetric = jest.fn((expression) => Promise.resolve(responses[expression]));

    await expect(api.getDashboardMetrics()).resolves.toEqual({
      brokerCount: '3',
      exporterUp: '1',
      partitionCount: '9',
      status: 'ok',
      topicCount: '4',
      totalLogEndOffset: '1250',
    });
    expect(api.queryMetric).toHaveBeenCalledTimes(5);
    Object.values(METRIC_EXPRESSIONS).forEach((expression) => {
      expect(api.queryMetric).toHaveBeenCalledWith(expression, 60);
    });
  });

  it('uses zero for dashboard metrics that have no Prometheus samples', async () => {
    const api = new PrometheusAPI();

    api.queryMetric = jest.fn().mockResolvedValue({ data: { result: [] } });

    await expect(api.getDashboardMetrics()).resolves.toMatchObject({
      brokerCount: '0',
      exporterUp: '0',
      partitionCount: '0',
      topicCount: '0',
      totalLogEndOffset: '0',
    });
  });

  it('throws a clear error when the Prometheus endpoint is not configured', async () => {
    delete process.env.PROMETHEUS_API;
    const api = new PrometheusAPI();

    await expect(api.queryMetric('up', 0)).rejects.toThrow(
      'PROMETHEUS_API is not configured for Lighthouse runtime'
    );
  });

  it('encodes PromQL expressions and query timestamps before calling Prometheus', async () => {
    process.env.PROMETHEUS_API = 'http://prometheus:9090/';
    jest.spyOn(Date, 'now').mockReturnValue(1713800060000);

    const api = new PrometheusAPI();
    api.get = jest.fn().mockResolvedValue({ data: { result: [] } });

    await api.queryMetric('sum(metric{topic="orders"})', 60);

    expect(api.baseURL).toBe('http://prometheus:9090/');
    expect(api.get).toHaveBeenCalledWith(
      'api/v1/query?query=sum(metric%7Btopic%3D%22orders%22%7D)&time=1713800000'
    );
  });
});
