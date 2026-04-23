import MetricStat from './MetricStat';

export default function BrokerSignal({ value = 0 }) {
  return (
    <MetricStat
      label="Broker Signal"
      value={value}
      helperText="broker count locally, connection signal externally"
    />
  );
}
