import {
  DEFAULT_QUERY_TIMEOUT_MS,
  METRIC_EXPRESSIONS,
  assertAllowedHost,
  buildPrometheusQueryURL,
  firstPrometheusValue,
  getDashboardMetrics,
  normalizePrometheusBaseURL,
  parseAllowedHosts,
  parseTimeoutMs,
  queryPrometheus,
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

describe('prometheusAPI', () => {
  const previousPrometheusApi = process.env.PROMETHEUS_API;
  const previousAllowedHosts = process.env.PROMETHEUS_ALLOWED_HOSTS;
  const previousTimeout = process.env.PROMETHEUS_QUERY_TIMEOUT_MS;

  afterEach(() => {
    jest.restoreAllMocks();

    if (previousPrometheusApi === undefined) {
      delete process.env.PROMETHEUS_API;
    } else {
      process.env.PROMETHEUS_API = previousPrometheusApi;
    }

    if (previousAllowedHosts === undefined) {
      delete process.env.PROMETHEUS_ALLOWED_HOSTS;
    } else {
      process.env.PROMETHEUS_ALLOWED_HOSTS = previousAllowedHosts;
    }

    if (previousTimeout === undefined) {
      delete process.env.PROMETHEUS_QUERY_TIMEOUT_MS;
    } else {
      process.env.PROMETHEUS_QUERY_TIMEOUT_MS = previousTimeout;
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
    const responses = {
      [METRIC_EXPRESSIONS.brokerCount]: prometheusSample(3),
      [METRIC_EXPRESSIONS.exporterUp]: prometheusSample(1),
      [METRIC_EXPRESSIONS.partitionCount]: prometheusSample(9),
      [METRIC_EXPRESSIONS.topicCount]: prometheusSample(4),
      [METRIC_EXPRESSIONS.totalLogEndOffset]: prometheusSample(1250),
    };
    const queryMetric = jest.fn((expression) => Promise.resolve(responses[expression]));

    await expect(getDashboardMetrics({ queryMetric })).resolves.toEqual({
      brokerCount: '3',
      exporterUp: '1',
      partitionCount: '9',
      status: 'ok',
      topicCount: '4',
      totalLogEndOffset: '1250',
    });
    expect(queryMetric).toHaveBeenCalledTimes(5);
    Object.values(METRIC_EXPRESSIONS).forEach((expression) => {
      expect(queryMetric).toHaveBeenCalledWith(expression, 60, {});
    });
  });

  it('uses zero for dashboard metrics that have no Prometheus samples', async () => {
    const queryMetric = jest.fn().mockResolvedValue({ data: { result: [] } });

    await expect(getDashboardMetrics({ queryMetric })).resolves.toMatchObject({
      brokerCount: '0',
      exporterUp: '0',
      partitionCount: '0',
      topicCount: '0',
      totalLogEndOffset: '0',
    });
  });

  it('normalizes a valid Prometheus endpoint without accepting unsupported protocols', () => {
    expect(normalizePrometheusBaseURL('http://prometheus:9090').toString()).toBe(
      'http://prometheus:9090/'
    );
    expect(normalizePrometheusBaseURL('https://metrics.example.com/prometheus').toString()).toBe(
      'https://metrics.example.com/prometheus/'
    );
    expect(() => normalizePrometheusBaseURL('file:///etc/passwd')).toThrow(
      'PROMETHEUS_API must use http or https'
    );
    expect(() => normalizePrometheusBaseURL('not a url')).toThrow(
      'PROMETHEUS_API must be a valid URL'
    );
  });

  it('throws a clear error when the Prometheus endpoint is not configured', async () => {
    delete process.env.PROMETHEUS_API;

    await expect(queryPrometheus('up', 0, { fetcher: jest.fn() })).rejects.toThrow(
      'PROMETHEUS_API is not configured for Lighthouse runtime'
    );
  });

  it('allows optional host allowlisting for the Prometheus endpoint', () => {
    const url = normalizePrometheusBaseURL('http://prometheus:9090');

    expect(parseAllowedHosts('prometheus,prometheus:9090')).toEqual([
      'prometheus',
      'prometheus:9090',
    ]);
    expect(() => assertAllowedHost(url, ['prometheus:9090'])).not.toThrow();
    expect(() => assertAllowedHost(url, ['other-host'])).toThrow(
      'PROMETHEUS_API host is not allowed'
    );
  });

  it('builds a Prometheus query URL with encoded PromQL and a bounded timestamp', () => {
    const url = buildPrometheusQueryURL(
      normalizePrometheusBaseURL('http://prometheus:9090'),
      'sum(metric{topic="orders"})',
      60,
      () => 1713800060000
    );

    expect(url.toString()).toBe(
      'http://prometheus:9090/api/v1/query?query=sum%28metric%7Btopic%3D%22orders%22%7D%29&time=1713800000'
    );
  });

  it('queries Prometheus with fetch, accepts JSON, and rejects HTTP errors', async () => {
    const fetcher = jest.fn().mockResolvedValue({
      json: () => Promise.resolve(prometheusSample(1)),
      ok: true,
      status: 200,
    });

    await expect(
      queryPrometheus('up', 60, {
        fetcher,
        now: () => 1713800060000,
        prometheusApi: 'http://prometheus:9090/',
      })
    ).resolves.toEqual(prometheusSample(1));
    expect(fetcher).toHaveBeenCalledWith(
      'http://prometheus:9090/api/v1/query?query=up&time=1713800000',
      expect.objectContaining({
        headers: {
          accept: 'application/json',
        },
        method: 'GET',
      })
    );

    fetcher.mockResolvedValueOnce({
      ok: false,
      status: 503,
    });

    await expect(
      queryPrometheus('up', 60, {
        fetcher,
        prometheusApi: 'http://prometheus:9090/',
      })
    ).rejects.toThrow('Prometheus query failed with HTTP 503');
  });

  it('times out slow Prometheus requests', async () => {
    const fetcher = jest.fn(
      (_url, { signal }) =>
        new Promise((_resolve, reject) => {
          signal.addEventListener('abort', () => {
            const error = new Error('aborted');
            error.name = 'AbortError';
            reject(error);
          });
        })
    );

    await expect(
      queryPrometheus('up', 60, {
        fetcher,
        prometheusApi: 'http://prometheus:9090/',
        timeoutMs: 1,
      })
    ).rejects.toThrow('Prometheus query timed out after 1ms');
  });

  it('falls back to the default timeout when the configured value is invalid', () => {
    expect(parseTimeoutMs('bad-input')).toBe(DEFAULT_QUERY_TIMEOUT_MS);
    expect(parseTimeoutMs('-1')).toBe(DEFAULT_QUERY_TIMEOUT_MS);
    expect(parseTimeoutMs('2500')).toBe(2500);
  });
});
