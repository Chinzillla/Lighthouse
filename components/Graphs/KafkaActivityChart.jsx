import MetricLineChart from './MetricLineChart';

export default function KafkaActivityChart({ isUnavailable = false, value = 0 }) {
  return (
    <MetricLineChart
      isUnavailable={isUnavailable}
      label="Kafka Activity"
      value={value}
      backgroundColor="rgba(62, 123, 101, 0.16)"
      borderColor="#2f7d62"
    />
  );
}
