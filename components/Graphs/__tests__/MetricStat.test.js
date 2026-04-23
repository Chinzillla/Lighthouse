import { render, screen } from '@testing-library/react';
import MetricStat, { formatMetricValue } from '../MetricStat';

describe('MetricStat component', () => {
  it('formats integer and decimal metric values for dashboard display', () => {
    expect(formatMetricValue('1234567')).toBe('1,234,567');
    expect(formatMetricValue('1234.567')).toBe('1,234.57');
  });

  it('keeps non-numeric status values readable instead of hiding them', () => {
    expect(formatMetricValue('degraded')).toBe('degraded');
  });

  it('treats empty metric values as zero', () => {
    expect(formatMetricValue(undefined)).toBe('0');
    expect(formatMetricValue(null)).toBe('0');
    expect(formatMetricValue('')).toBe('0');
  });

  it('renders helper text only when it is provided', () => {
    const { rerender } = render(
      <MetricStat label="Broker Signal" value="3" helperText="broker count" />
    );

    expect(screen.getByText('Broker Signal')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('broker count')).toBeInTheDocument();

    rerender(<MetricStat label="Broker Signal" value="3" />);

    expect(screen.queryByText('broker count')).not.toBeInTheDocument();
  });
});
