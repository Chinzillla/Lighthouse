/** @jest-environment node */

const {
  createReplayJobDraft,
  validateReplayDraftInput,
} = require('../client');

describe('Replay job client helpers', () => {
  it('normalizes valid draft input into the API payload shape', () => {
    expect(
      validateReplayDraftInput({
        destination: 'orders-replay',
        end: '5',
        jobId: 'incident-123',
        partition: '0',
        source: 'orders',
        start: '0',
      })
    ).toEqual({
      destination: 'orders-replay',
      end: '5',
      'job-id': 'incident-123',
      partition: '0',
      source: 'orders',
      start: '0',
    });
  });

  it('normalizes timestamp draft input into API timestamp flags', () => {
    expect(
      validateReplayDraftInput({
        destination: 'orders-replay',
        endTimestamp: '2026-04-28T14:08:00.000Z',
        mode: 'timestamp',
        partition: '0',
        source: 'orders',
        startTimestamp: '2026-04-28T14:03:00.000Z',
      })
    ).toEqual({
      destination: 'orders-replay',
      'end-timestamp': '2026-04-28T14:08:00.000Z',
      partition: '0',
      source: 'orders',
      'start-timestamp': '2026-04-28T14:03:00.000Z',
    });
  });

  it('accepts epoch-millisecond strings for timestamp-window replay', () => {
    const result = validateReplayDraftInput({
      destination: 'orders-replay',
      endTimestamp: '1714330300000',
      mode: 'timestamp',
      partition: '0',
      source: 'orders',
      startTimestamp: '1714330000000',
    });

    expect(result['start-timestamp']).toBe(new Date(1714330000000).toISOString());
    expect(result['end-timestamp']).toBe(new Date(1714330300000).toISOString());
  });

  it('rejects invalid draft input before any network request', async () => {
    await expect(
      createReplayJobDraft(
        {
          destination: 'orders',
          end: '1',
          partition: '0',
          source: 'orders',
          start: '0',
        },
        {
          fetcher: jest.fn(),
        }
      )
    ).rejects.toThrow('Source and destination topics must be different');
  });
});
