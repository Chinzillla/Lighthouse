import { render, screen } from '@testing-library/react';
import BrokerSignal from '../BrokerSignal';

describe('BrokerSignal component', () => {
  it('renders the broker signal title', () => {
    render(<BrokerSignal value={0} />);
    expect(screen.getByText('Broker Signal')).toBeInTheDocument();
  });

  it('displays the broker signal value', () => {
    render(<BrokerSignal value={10} />);
    expect(screen.getByText('10')).toBeInTheDocument();
  });
});
