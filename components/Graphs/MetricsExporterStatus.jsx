import MetricStat from './MetricStat';

export default function MetricsExporterStatus({ isUnavailable = false, value = 0 }) {
  return (
    <MetricStat
      isUnavailable={isUnavailable}
      label="Metrics Exporter"
      value={value}
      helperText="1 means Kafka metadata is reachable"
    />
  );
}
