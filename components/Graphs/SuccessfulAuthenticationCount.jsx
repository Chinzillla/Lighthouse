import MetricStat from './MetricStat';

export default function SuccessfulAuthenticationCount({ results = 0 }) {
  return (
    <MetricStat
      label="Metrics Exporter"
      value={results}
      helperText="1 means Kafka metadata is reachable"
    />
  );
}
