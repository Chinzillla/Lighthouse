import { render, screen, waitFor, within } from '@testing-library/react';
import Home from '../pages';

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

function successfulMetricsResponse(metrics) {
  return Promise.resolve({
    json: () => Promise.resolve({ dashboardMetrics: metrics }),
    ok: true,
  });
}

describe('Home dashboard', () => {
  beforeEach(() => {
    fetch.resetMocks();
  });

  it('fetches dashboard metrics and maps them into stat cards and snapshot charts', async () => {
    fetch.mockImplementation(() =>
      successfulMetricsResponse({
        brokerCount: '3',
        exporterUp: '1',
        partitionCount: '9',
        topicCount: '4',
        totalLogEndOffset: '12500',
      })
    );

    render(<Home />);

    expect(screen.getByText('Polling metrics')).toBeInTheDocument();
    expect(await screen.findByText('Metrics online')).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith(
      '/api/dashboard-metrics',
      expect.objectContaining({
        headers: {
          accept: 'application/json',
        },
        method: 'GET',
      })
    );
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

  it('keeps the polling state while the metrics request is pending', () => {
    fetch.mockImplementation(() => new Promise(() => {}));

    render(<Home />);

    expect(screen.getByText('Polling metrics')).toBeInTheDocument();
    expect(within(metricCard('Partition Count')).getByText('0')).toBeInTheDocument();
    expect(within(metricCard('Broker Signal')).getByText('0')).toBeInTheDocument();
  });

  it('shows the unavailable state without dropping the dashboard layout', async () => {
    fetch.mockResolvedValue({
      json: () => Promise.resolve({ error: 'Prometheus unavailable' }),
      ok: false,
      status: 502,
    });

    render(<Home />);

    await waitFor(() =>
      expect(screen.getByText('Prometheus unavailable')).toBeInTheDocument()
    );
    expect(screen.getByLabelText('Kafka metrics')).toBeInTheDocument();
    expect(screen.getByLabelText('Kafka snapshots')).toBeInTheDocument();
  });
});
