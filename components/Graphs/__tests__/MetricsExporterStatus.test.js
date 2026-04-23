import { render, screen } from '@testing-library/react';
import MetricsExporterStatus from '../MetricsExporterStatus';

describe('MetricsExporterStatus component', () => {
  it('renders the metrics exporter title', () => {
    render(<MetricsExporterStatus value={0} />);
    expect(screen.getByText('Metrics Exporter')).toBeInTheDocument();
  });

  it('displays the exporter status value', () => {
    render(<MetricsExporterStatus value={1} />);
    expect(screen.getByText('1')).toBeInTheDocument();
  });
});
