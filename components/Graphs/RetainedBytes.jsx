import MetricLineChart from './MetricLineChart';

export default function RetainedBytes({ value = 0 }) {
  return (
    <MetricLineChart
      label="Topic Inventory"
      value={value}
      backgroundColor="rgba(187, 112, 45, 0.16)"
      borderColor="#a45f22"
    />
  );
}
