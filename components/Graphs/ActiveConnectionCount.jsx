import MetricStat from './MetricStat';

export default function ActiveConnectionCount({ results = 0 }) {
  return (
    <MetricStat
      label="Broker Signal"
      value={results}
      helperText="broker count locally, connection signal externally"
    />
  );
}
