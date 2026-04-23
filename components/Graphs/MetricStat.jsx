function formatMetricValue(value) {
  if (value === null || value === undefined || value === '') return '0';

  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return String(value);

  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits: Number.isInteger(numericValue) ? 0 : 2,
  }).format(numericValue);
}

export default function MetricStat({ label, value, helperText }) {
  return (
    <div>
      <p>{label}</p>
      <strong>{formatMetricValue(value)}</strong>
      {helperText ? <span>{helperText}</span> : null}
    </div>
  );
}

export { formatMetricValue };
