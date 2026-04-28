import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import ReplayWorkspace from '../ReplayWorkspace';

function jsonResponse(payload) {
  return Promise.resolve({
    json: () => Promise.resolve(payload),
    ok: true,
  });
}

describe('ReplayWorkspace', () => {
  beforeEach(() => {
    fetch.resetMocks();
  });

  it('creates a draft, previews the selected job, and starts the replay', async () => {
    const jobs = [];

    fetch.mockImplementation((url, options = {}) => {
      if (url === '/api/jobs?limit=12') {
        return jsonResponse({ jobs });
      }

      if (url === '/api/jobs' && options.method === 'POST') {
        const draftJob = {
          completedAt: null,
          createdAt: '2026-04-28T18:00:00.000Z',
          destinationTopic: 'orders-replay',
          dryRun: false,
          endOffset: 5,
          errorMessage: null,
          jobId: 'job-ui-1',
          lastReplayedOffset: null,
          partition: 0,
          progressInterval: 25,
          progressTotal: 6,
          replayedCount: 0,
          sourceTopic: 'orders',
          startOffset: 0,
          status: 'draft',
          updatedAt: '2026-04-28T18:00:00.000Z',
        };

        jobs.unshift(draftJob);
        return jsonResponse({ job: draftJob });
      }

      if (url === '/api/jobs/job-ui-1/preview') {
        return jsonResponse({
          job: jobs[0],
          preview: {
            messages: [
              {
                destinationTopic: 'orders-replay',
                headers: {
                  'x-original-offset': '0',
                  'x-replayed': 'true',
                },
                key: 'order-0',
                offset: 0,
                partition: 0,
                sourceTopic: 'orders',
                timestamp: '1714330000000',
                value: '{"orderId":"order-0","status":"created"}',
              },
            ],
            summary: {
              endOffset: 5,
              lastReplayedOffset: 0,
              replayedCount: 1,
              startOffset: 0,
              totalMessages: 6,
            },
          },
        });
      }

      if (url === '/api/jobs/job-ui-1/start' && options.method === 'POST') {
        jobs[0] = {
          ...jobs[0],
          startedAt: '2026-04-28T18:01:00.000Z',
          status: 'running',
          updatedAt: '2026-04-28T18:01:00.000Z',
        };
        return jsonResponse({ job: jobs[0] });
      }

      throw new Error(`Unhandled request in test: ${options.method || 'GET'} ${url}`);
    });

    render(<ReplayWorkspace />);

    expect(await screen.findByText('No replay jobs saved yet.')).toBeInTheDocument();

    fireEvent.submit(screen.getByRole('button', { name: 'Save draft' }).closest('form'));

    expect(await screen.findByText('Saved replay job job-ui-1.')).toBeInTheDocument();
    expect(screen.getAllByText('job-ui-1').length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole('button', { name: 'Preview' }));

    expect(await screen.findByText('Loaded preview for job-ui-1.')).toBeInTheDocument();
    expect(screen.getByText('order-0')).toBeInTheDocument();
    expect(screen.getByText(/offset 0/)).toBeInTheDocument();
    expect(screen.getByText('{"orderId":"order-0","status":"created"}')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Start replay' }));

    expect(await screen.findByText('Started replay job job-ui-1.')).toBeInTheDocument();
    expect(
      within(screen.getByText('Selected job').closest('article')).getByText('running')
    ).toBeInTheDocument();
  });

  it('creates timestamp replay drafts from the time-window mode', async () => {
    let createPayload = null;

    fetch.mockImplementation((url, options = {}) => {
      if (url === '/api/jobs?limit=12') {
        return jsonResponse({ jobs: [] });
      }

      if (url === '/api/jobs' && options.method === 'POST') {
        createPayload = JSON.parse(options.body);

        return jsonResponse({
          job: {
            completedAt: null,
            createdAt: '2026-04-28T18:10:00.000Z',
            destinationTopic: 'orders-replay',
            dryRun: false,
            endOffset: 14,
            endTimestamp: '2026-04-28T14:08:00.000Z',
            errorMessage: null,
            jobId: 'job-ui-time',
            lastReplayedOffset: null,
            partition: 0,
            progressInterval: 25,
            progressTotal: 5,
            replayMode: 'timestamp',
            replayedCount: 0,
            sourceTopic: 'orders',
            startedAt: null,
            startOffset: 10,
            startTimestamp: '2026-04-28T14:03:00.000Z',
            status: 'draft',
            updatedAt: '2026-04-28T18:10:00.000Z',
          },
        });
      }

      throw new Error(`Unhandled request in timestamp test: ${options.method || 'GET'} ${url}`);
    });

    render(<ReplayWorkspace />);

    await screen.findByText('No replay jobs saved yet.');
    fireEvent.click(screen.getByRole('button', { name: 'Time window' }));
    fireEvent.change(screen.getByLabelText('Start timestamp'), {
      target: { value: '2026-04-28T14:03:00.000Z' },
    });
    fireEvent.change(screen.getByLabelText('End timestamp'), {
      target: { value: '2026-04-28T14:08:00.000Z' },
    });
    fireEvent.submit(screen.getByRole('button', { name: 'Save draft' }).closest('form'));

    expect(await screen.findByText('Saved replay job job-ui-time.')).toBeInTheDocument();
    expect(createPayload).toEqual({
      destination: 'orders-replay',
      'end-timestamp': '2026-04-28T14:08:00.000Z',
      partition: '0',
      source: 'orders',
      'start-timestamp': '2026-04-28T14:03:00.000Z',
    });
    expect(screen.getAllByText('Time window').length).toBeGreaterThan(0);
    expect(screen.getAllByText('10-14').length).toBeGreaterThan(0);
  });

  it('shows validation errors before sending an invalid draft request', async () => {
    fetch.mockImplementation((url) => {
      if (url === '/api/jobs?limit=12') {
        return jsonResponse({ jobs: [] });
      }

      throw new Error(`Unexpected request in validation test: ${url}`);
    });

    render(<ReplayWorkspace />);

    await screen.findByText('No replay jobs saved yet.');

    fireEvent.change(screen.getByLabelText('Destination topic'), {
      target: { value: 'orders' },
    });
    fireEvent.submit(screen.getByRole('button', { name: 'Save draft' }).closest('form'));

    expect(
      await screen.findByText('Source and destination topics must be different')
    ).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
