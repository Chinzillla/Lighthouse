import { render, screen } from '@testing-library/react';
import ReceivedRecords from '../ReceivedRecords';

describe('ReceivedRecords component', () => {
  it('renders the log end offset title', () => {
    render(<ReceivedRecords results={0} />);
    expect(screen.getByText('Log End Offset')).toBeInTheDocument();
  });

  it('displays the received records count', () => {
    render(<ReceivedRecords results={7} />);
    expect(screen.getByText('7')).toBeInTheDocument();
  });
});
