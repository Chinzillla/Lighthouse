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
