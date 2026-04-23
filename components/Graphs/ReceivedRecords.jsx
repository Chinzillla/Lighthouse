import MetricStat from './MetricStat';

export default function ReceivedRecords({ results = 0 }) {
  return (
    <MetricStat
      label="Received Records"
      value={results}
      helperText="records received by brokers"
    />
  );
}
