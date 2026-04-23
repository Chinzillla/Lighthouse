import { render, screen } from '@testing-library/react';
import SuccessfulAuthenticationCount from '../SuccessfulAuthenticationCount';

describe('SuccessfulAuthenticationCount component', () => {
  it('renders the metrics exporter title', () => {
    render(<SuccessfulAuthenticationCount results={0} />);
    expect(screen.getByText('Metrics Exporter')).toBeInTheDocument();
  });

  it('displays the successful authentication count', () => {
    render(<SuccessfulAuthenticationCount results={3} />);
    expect(screen.getByText('3')).toBeInTheDocument();
  });
});
