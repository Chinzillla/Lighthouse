import { render, screen } from '@testing-library/react';
import ReceivedBytes from '../ReceivedBytes';

jest.mock('react-chartjs-2', () => {
  const React = require('react');

  return {
    Line: () => React.createElement('div', { 'data-testid': 'line-chart' }),
  };
});

describe('ReceivedBytes component', () => {
  it('renders the Received Bytes chart label', () => {
    render(<ReceivedBytes value={100} />);

    expect(screen.getByText('Received Bytes')).toBeInTheDocument();
    expect(screen.getByTestId('line-chart')).toBeInTheDocument();
  });
});
