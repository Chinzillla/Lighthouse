import MetricLineChart from './MetricLineChart';

export default function ReceivedBytes({ value = 0 }) {
  return (
    <MetricLineChart
      label="Received Bytes"
      value={value}
      backgroundColor="rgba(62, 123, 101, 0.16)"
      borderColor="#2f7d62"
    />
  );
}
