import replayJobHttp from '../../../../lib/replay-jobs/http';
import replayJobService from '../../../../lib/replay-jobs/service';

const {
  applyNoStore,
  getJobIdFromRequest,
  sendMethodNotAllowed,
  sendServiceError,
  withReplayJobStore,
} = replayJobHttp;
const { previewReplayJob } = replayJobService;

function createHandler(dependencies = {}) {
  return async function handler(request, response) {
    applyNoStore(response);

    if (request.method !== 'GET') {
      sendMethodNotAllowed(response, ['GET']);
      return;
    }

    try {
      const preview = await withReplayJobStore(
        ({ env, logger, store }) =>
          previewReplayJob(getJobIdFromRequest(request), {
            env,
            logger,
            replayRunner: dependencies.replayRunner,
            store,
          }),
        dependencies
      );

      response.status(200).json({
        job: preview.job,
        preview: {
          messages: preview.previewMessages,
          summary: preview.summary,
        },
      });
    } catch (error) {
      sendServiceError(response, error);
    }
  };
}

export default createHandler();
export { createHandler };
