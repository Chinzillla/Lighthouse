import { render, screen } from '@testing-library/react';
import MetricLineChart from '../MetricLineChart';

let mockBarProps;

jest.mock('chart.js', () => ({
  BarElement: {},
  CategoryScale: {},
  Chart: {
    register: jest.fn(),
  },
  Legend: {},
  LinearScale: {},
  Tooltip: {},
}));

jest.mock('react-chartjs-2', () => {
  const React = require('react');

  return {
    Bar: (props) => {
      mockBarProps = props;
      return React.createElement('div', { 'data-testid': 'snapshot-chart' });
    },
  };
});

describe('MetricLineChart component', () => {
  beforeEach(() => {
    mockBarProps = undefined;
  });

  it('passes the current metric value and visual settings to the chart', () => {
    render(
      <MetricLineChart
        label="Kafka Activity"
        value="42.5"
        backgroundColor="rgba(62, 123, 101, 0.16)"
        borderColor="#2f7d62"
      />
    );

    expect(screen.getByLabelText('Kafka Activity snapshot')).toBeInTheDocument();
    expect(screen.getByTestId('snapshot-chart')).toBeInTheDocument();
    expect(mockBarProps.data).toEqual({
      labels: ['current'],
      datasets: [
        {
          backgroundColor: 'rgba(62, 123, 101, 0.16)',
          borderColor: '#2f7d62',
          borderRadius: 6,
          borderWidth: 2,
          data: [42.5],
          label: 'Kafka Activity',
        },
      ],
    });
    expect(mockBarProps.options.animation).toBe(false);
    expect(mockBarProps.options.scales.y.beginAtZero).toBe(true);
  });

  it('falls back to zero when Prometheus returns a non-numeric sample', () => {
    render(
      <MetricLineChart
        label="Topic Inventory"
        value="not-a-number"
        backgroundColor="rgba(187, 112, 45, 0.16)"
        borderColor="#a45f22"
      />
    );

    expect(mockBarProps.data.datasets[0].data).toEqual([0]);
  });

  it('renders an empty snapshot state when metrics are unavailable', () => {
    render(
      <MetricLineChart
        isUnavailable
        label="Topic Inventory"
        value="12"
        backgroundColor="rgba(187, 112, 45, 0.16)"
        borderColor="#a45f22"
      />
    );

    expect(screen.getByText('No sample')).toBeInTheDocument();
    expect(screen.queryByTestId('snapshot-chart')).not.toBeInTheDocument();
    expect(mockBarProps).toBeUndefined();
  });
});
