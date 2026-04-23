import { render, screen } from '@testing-library/react';
import LogEndOffset from '../LogEndOffset';

describe('LogEndOffset component', () => {
  it('renders the log end offset title', () => {
    render(<LogEndOffset value={0} />);
    expect(screen.getByText('Log End Offset')).toBeInTheDocument();
  });

  it('displays the log end offset value', () => {
    render(<LogEndOffset value={7} />);
    expect(screen.getByText('7')).toBeInTheDocument();
  });
});
