import { useQuery } from '@apollo/client';
import { render, screen, within } from '@testing-library/react';
import Home from '../pages';

jest.mock('@apollo/client', () => ({
  ...jest.requireActual('@apollo/client'),
  useQuery: jest.fn(),
}));

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

jest.mock('next/image', () => {
  const React = require('react');

  return function MockImage({ alt }) {
    return React.createElement('span', {
      'aria-label': alt || 'decorative image',
      role: 'img',
    });
  };
});

jest.mock('react-chartjs-2', () => {
  const React = require('react');

  return {
    Bar: ({ data }) =>
      React.createElement('div', {
        'data-chart-value': data.datasets[0].data[0],
        'data-testid': `${data.datasets[0].label} chart`,
      }),
  };
});

function metricCard(label) {
  return within(screen.getByLabelText('Kafka metrics'))
    .getByText(label)
    .closest('div');
}

describe('Home dashboard', () => {
  beforeEach(() => {
    useQuery.mockReset();
  });

  it('maps dashboard metric data into stat cards and snapshot charts', () => {
    useQuery.mockReturnValue({
      data: {
        dashboardMetrics: {
          brokerCount: '3',
          exporterUp: '1',
          partitionCount: '9',
          topicCount: '4',
          totalLogEndOffset: '12500',
        },
      },
      error: undefined,
      loading: false,
    });

    render(<Home />);

    expect(screen.getByText('Metrics online')).toBeInTheDocument();
    expect(within(metricCard('Partition Count')).getByText('9')).toBeInTheDocument();
    expect(within(metricCard('Broker Signal')).getByText('3')).toBeInTheDocument();
    expect(within(metricCard('Log End Offset')).getByText('12,500')).toBeInTheDocument();
    expect(within(metricCard('Metrics Exporter')).getByText('1')).toBeInTheDocument();
    expect(screen.getByTestId('Kafka Activity chart')).toHaveAttribute(
      'data-chart-value',
      '12500'
    );
    expect(screen.getByTestId('Topic Inventory chart')).toHaveAttribute(
      'data-chart-value',
      '4'
    );
  });

  it('shows the polling state while the GraphQL query is loading', () => {
    useQuery.mockReturnValue({
      data: undefined,
      error: undefined,
      loading: true,
    });

    render(<Home />);

    expect(screen.getByText('Polling metrics')).toBeInTheDocument();
    expect(within(metricCard('Partition Count')).getByText('0')).toBeInTheDocument();
    expect(within(metricCard('Broker Signal')).getByText('0')).toBeInTheDocument();
  });

  it('shows the unavailable state without dropping the dashboard layout', () => {
    useQuery.mockReturnValue({
      data: undefined,
      error: new Error('Prometheus down'),
      loading: false,
    });

    render(<Home />);

    expect(screen.getByText('Prometheus unavailable')).toBeInTheDocument();
    expect(screen.getByLabelText('Kafka metrics')).toBeInTheDocument();
    expect(screen.getByLabelText('Kafka snapshots')).toBeInTheDocument();
  });
});
