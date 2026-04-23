const DEFAULT_QUERY_WINDOW_SECONDS = 60;
const DEFAULT_QUERY_TIMEOUT_MS = 5000;

const METRIC_EXPRESSIONS = {
  brokerCount:
    'max(lighthouse_kafka_broker_count) or max(confluent_kafka_server_active_connection_count)',
  exporterUp:
    'max(lighthouse_kafka_exporter_up) or max(confluent_kafka_server_successful_authentication_count)',
  partitionCount:
    'sum(lighthouse_kafka_partition_count) or sum(confluent_kafka_server_partition_count)',
  topicCount:
    'max(lighthouse_kafka_topic_count) or count(count by (topic) (confluent_kafka_server_retained_bytes))',
  totalLogEndOffset:
    'sum(lighthouse_kafka_total_log_end_offset) or sum(confluent_kafka_server_received_records)',
};

function firstPrometheusValue(response) {
  return response?.data?.result?.find((entry) => entry?.value?.[1] !== undefined)
    ?.value?.[1] ?? '0';
}

function parseTimeoutMs(value = process.env.PROMETHEUS_QUERY_TIMEOUT_MS) {
  const timeoutMs = Number(value || DEFAULT_QUERY_TIMEOUT_MS);

  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    return DEFAULT_QUERY_TIMEOUT_MS;
  }

  return timeoutMs;
}

function normalizePrometheusBaseURL(prometheusApi = process.env.PROMETHEUS_API) {
  if (!prometheusApi) {
    throw new Error('PROMETHEUS_API is not configured for Lighthouse runtime');
  }

  let url;
  try {
    url = new URL(prometheusApi);
  } catch {
    throw new Error('PROMETHEUS_API must be a valid URL');
  }

  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error('PROMETHEUS_API must use http or https');
  }

  if (!url.pathname.endsWith('/')) {
    url.pathname = `${url.pathname}/`;
  }

  return url;
}

function parseAllowedHosts(value = process.env.PROMETHEUS_ALLOWED_HOSTS) {
  return String(value || '')
    .split(',')
    .map((host) => host.trim())
    .filter(Boolean);
}

function assertAllowedHost(url, allowedHosts = process.env.PROMETHEUS_ALLOWED_HOSTS) {
  const allowedHostList = Array.isArray(allowedHosts)
    ? allowedHosts
    : parseAllowedHosts(allowedHosts);

  if (allowedHostList.length === 0) return;

  if (
    !allowedHostList.includes(url.host) &&
    !allowedHostList.includes(url.hostname)
  ) {
    throw new Error('PROMETHEUS_API host is not allowed');
  }
}

function buildPrometheusQueryURL(baseURL, metricName, secondsAgo, now = Date.now) {
  const timestamp = Math.floor(now() / 1000) - secondsAgo;
  const url = new URL('api/v1/query', baseURL);

  url.searchParams.set('query', metricName);
  url.searchParams.set('time', String(timestamp));

  return url;
}

async function queryPrometheus(
  metricName,
  secondsAgo = DEFAULT_QUERY_WINDOW_SECONDS,
  {
    allowedHosts,
    fetcher = globalThis.fetch,
    now = Date.now,
    prometheusApi,
    timeoutMs = parseTimeoutMs(),
  } = {}
) {
  if (typeof fetcher !== 'function') {
    throw new Error('A fetch implementation is required to query Prometheus');
  }

  const baseURL = normalizePrometheusBaseURL(prometheusApi);
  assertAllowedHost(baseURL, allowedHosts);

  const queryURL = buildPrometheusQueryURL(baseURL, metricName, secondsAgo, now);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetcher(queryURL.toString(), {
      headers: {
        accept: 'application/json',
      },
      method: 'GET',
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Prometheus query failed with HTTP ${response.status}`);
    }

    return response.json();
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error(`Prometheus query timed out after ${timeoutMs}ms`);
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function getDashboardMetrics({
  queryMetric = queryPrometheus,
  secondsAgo = DEFAULT_QUERY_WINDOW_SECONDS,
  ...queryOptions
} = {}) {
  const [
    brokerCount,
    exporterUp,
    partitionCount,
    topicCount,
    totalLogEndOffset,
  ] = await Promise.all([
    queryMetric(METRIC_EXPRESSIONS.brokerCount, secondsAgo, queryOptions),
    queryMetric(METRIC_EXPRESSIONS.exporterUp, secondsAgo, queryOptions),
    queryMetric(METRIC_EXPRESSIONS.partitionCount, secondsAgo, queryOptions),
    queryMetric(METRIC_EXPRESSIONS.topicCount, secondsAgo, queryOptions),
    queryMetric(METRIC_EXPRESSIONS.totalLogEndOffset, secondsAgo, queryOptions),
  ]);

  return {
    status: 'ok',
    brokerCount: firstPrometheusValue(brokerCount),
    exporterUp: firstPrometheusValue(exporterUp),
    partitionCount: firstPrometheusValue(partitionCount),
    topicCount: firstPrometheusValue(topicCount),
    totalLogEndOffset: firstPrometheusValue(totalLogEndOffset),
  };
}

export {
  DEFAULT_QUERY_TIMEOUT_MS,
  DEFAULT_QUERY_WINDOW_SECONDS,
  METRIC_EXPRESSIONS,
  assertAllowedHost,
  buildPrometheusQueryURL,
  firstPrometheusValue,
  getDashboardMetrics,
  normalizePrometheusBaseURL,
  parseAllowedHosts,
  parseTimeoutMs,
  queryPrometheus,
};
