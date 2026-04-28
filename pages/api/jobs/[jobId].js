import replayJobHttp from '../../../lib/replay-jobs/http';
import replayJobService from '../../../lib/replay-jobs/service';

const {
  applyNoStore,
  getJobIdFromRequest,
  sendMethodNotAllowed,
  sendServiceError,
  withReplayJobStore,
} = replayJobHttp;
const { getReplayJob } = replayJobService;

function createHandler(dependencies = {}) {
  return async function handler(request, response) {
    applyNoStore(response);

    if (request.method !== 'GET') {
      sendMethodNotAllowed(response, ['GET']);
      return;
    }

    try {
      const job = await withReplayJobStore(
        ({ store }) =>
          getReplayJob(getJobIdFromRequest(request), {
            store,
          }),
        dependencies
      );

      response.status(200).json({ job });
    } catch (error) {
      sendServiceError(response, error);
    }
  };
}

export default createHandler();
export { createHandler };
