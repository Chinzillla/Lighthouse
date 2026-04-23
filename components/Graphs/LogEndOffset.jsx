import MetricStat from './MetricStat';

export default function LogEndOffset({ value = 0 }) {
  return (
    <MetricStat
      label="Log End Offset"
      value={value}
      helperText="latest observed Kafka offsets"
    />
  );
}
