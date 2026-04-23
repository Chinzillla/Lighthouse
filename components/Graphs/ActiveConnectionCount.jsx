import MetricStat from './MetricStat';

export default function ActiveConnectionCount({ results = 0 }) {
  return (
    <MetricStat
      label="Active Connections"
      value={results}
      helperText="current open broker connections"
    />
  );
}
