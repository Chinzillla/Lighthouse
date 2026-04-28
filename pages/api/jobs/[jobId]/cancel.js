import replayJobHttp from '../../../../lib/replay-jobs/http';
import replayJobRunner from '../../../../lib/replay-jobs/runner';

const {
  applyNoStore,
  getJobIdFromRequest,
  sendMethodNotAllowed,
  sendServiceError,
} = replayJobHttp;
const { cancelReplayJobInBackground } = replayJobRunner;

function createHandler(dependencies = {}) {
  const cancelInBackground =
    dependencies.cancelInBackground || cancelReplayJobInBackground;

  return async function handler(request, response) {
    applyNoStore(response);

    if (request.method !== 'POST') {
      sendMethodNotAllowed(response, ['POST']);
      return;
    }

    try {
      const job = cancelInBackground(getJobIdFromRequest(request), {
        env: dependencies.env,
        now: dependencies.now,
      });

      response.status(200).json({ job });
    } catch (error) {
      sendServiceError(response, error);
    }
  };
}

export default createHandler();
export { createHandler };
