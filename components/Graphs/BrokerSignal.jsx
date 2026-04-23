import MetricStat from './MetricStat';

export default function BrokerSignal({ isUnavailable = false, value = 0 }) {
  return (
    <MetricStat
      isUnavailable={isUnavailable}
      label="Broker Signal"
      value={value}
      helperText="broker count locally, connection signal externally"
    />
  );
}
