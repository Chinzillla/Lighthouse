import { render, screen } from '@testing-library/react';
import RetainedBytes from '../RetainedBytes';

jest.mock('react-chartjs-2', () => {
  const React = require('react');

  return {
    Line: () => React.createElement('div', { 'data-testid': 'line-chart' }),
  };
});

describe('RetainedBytes component', () => {
  it('renders the Topic Inventory chart label', () => {
    render(<RetainedBytes value={100} />);

    expect(screen.getByText('Topic Inventory')).toBeInTheDocument();
    expect(screen.getByTestId('line-chart')).toBeInTheDocument();
  });
});
