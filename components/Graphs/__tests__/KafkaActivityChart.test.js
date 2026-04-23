import { render, screen } from '@testing-library/react';
import KafkaActivityChart from '../KafkaActivityChart';

jest.mock('react-chartjs-2', () => {
  const React = require('react');

  return {
    Bar: () => React.createElement('div', { 'data-testid': 'snapshot-chart' }),
  };
});

describe('KafkaActivityChart component', () => {
  it('renders the Kafka Activity chart label', () => {
    render(<KafkaActivityChart value={100} />);

    expect(screen.getByText('Kafka Activity')).toBeInTheDocument();
    expect(screen.getByTestId('snapshot-chart')).toBeInTheDocument();
  });
});
