import replayJobHttp from '../../../../lib/replay-jobs/http';
import replayJobService from '../../../../lib/replay-jobs/service';

const {
  applyNoStore,
  getJobIdFromRequest,
  sendMethodNotAllowed,
  sendServiceError,
  withReplayJobStore,
} = replayJobHttp;
const { cancelReplayJob } = replayJobService;

function createHandler(dependencies = {}) {
  return async function handler(request, response) {
    applyNoStore(response);

    if (request.method !== 'POST') {
      sendMethodNotAllowed(response, ['POST']);
      return;
    }

    try {
      const job = await withReplayJobStore(
        ({ now, store }) =>
          cancelReplayJob(getJobIdFromRequest(request), {
            now,
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
