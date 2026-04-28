import replayJobHttp from '../../../../lib/replay-jobs/http';
import replayJobRunner from '../../../../lib/replay-jobs/runner';

const { applyNoStore, getJobIdFromRequest, sendMethodNotAllowed, sendServiceError } =
  replayJobHttp;
const { startReplayJobInBackground } = replayJobRunner;

function createHandler(dependencies = {}) {
  const startInBackground =
    dependencies.startInBackground || startReplayJobInBackground;

  return async function handler(request, response) {
    applyNoStore(response);

    if (request.method !== 'POST') {
      sendMethodNotAllowed(response, ['POST']);
      return;
    }

    try {
      const job = startInBackground(getJobIdFromRequest(request), {
        env: dependencies.env,
        logger: dependencies.logger,
        now: dependencies.now,
        replayRunner: dependencies.replayRunner,
      });

      response.status(202).json({ job });
    } catch (error) {
      sendServiceError(response, error);
    }
  };
}

export default createHandler();
export { createHandler };
