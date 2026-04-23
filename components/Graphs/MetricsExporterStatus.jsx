import MetricStat from './MetricStat';

export default function MetricsExporterStatus({ value = 0 }) {
  return (
    <MetricStat
      label="Metrics Exporter"
      value={value}
      helperText="1 means Kafka metadata is reachable"
    />
  );
}
