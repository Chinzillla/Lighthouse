import MetricStat from './MetricStat';

export default function ReceivedRecords({ results = 0 }) {
  return (
    <MetricStat
      label="Log End Offset"
      value={results}
      helperText="latest observed Kafka offsets"
    />
  );
}
