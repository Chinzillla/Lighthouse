import MetricStat from './MetricStat';

export default function PartitionCount({ isUnavailable = false, results = 0 }) {
  return (
    <MetricStat
      isUnavailable={isUnavailable}
      label="Partition Count"
      value={results}
      helperText="reported by Prometheus"
    />
  );
}
