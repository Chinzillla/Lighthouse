import MetricStat from './MetricStat';

export default function SuccessfulAuthenticationCount({ results = 0 }) {
  return (
    <MetricStat
      label="Successful Authentication Count"
      value={results}
      helperText="successful client auth events"
    />
  );
}
