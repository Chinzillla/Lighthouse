import { render, screen } from '@testing-library/react';
import TopicInventoryChart from '../TopicInventoryChart';

jest.mock('react-chartjs-2', () => {
  const React = require('react');

  return {
    Bar: () => React.createElement('div', { 'data-testid': 'snapshot-chart' }),
  };
});

describe('TopicInventoryChart component', () => {
  it('renders the Topic Inventory chart label', () => {
    render(<TopicInventoryChart value={100} />);

    expect(screen.getByText('Topic Inventory')).toBeInTheDocument();
    expect(screen.getByTestId('snapshot-chart')).toBeInTheDocument();
  });
});
