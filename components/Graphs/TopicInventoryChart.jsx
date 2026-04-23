import MetricLineChart from './MetricLineChart';

export default function TopicInventoryChart({ isUnavailable = false, value = 0 }) {
  return (
    <MetricLineChart
      isUnavailable={isUnavailable}
      label="Topic Inventory"
      value={value}
      backgroundColor="rgba(187, 112, 45, 0.16)"
      borderColor="#a45f22"
    />
  );
}
