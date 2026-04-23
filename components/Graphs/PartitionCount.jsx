import MetricStat from './MetricStat';

export default function PartitionCount({ results = 0 }) {
  return (
    <MetricStat
      label="Partition Count"
      value={results}
      helperText="reported by Prometheus"
    />
  );
}
