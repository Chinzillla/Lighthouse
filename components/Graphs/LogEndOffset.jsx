import MetricStat from './MetricStat';

export default function LogEndOffset({ isUnavailable = false, value = 0 }) {
  return (
    <MetricStat
      isUnavailable={isUnavailable}
      label="Log End Offset"
      value={value}
      helperText="latest observed Kafka offsets"
    />
  );
}
