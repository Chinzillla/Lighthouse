import replayJobHttp from '../../../lib/replay-jobs/http';
import replayJobService from '../../../lib/replay-jobs/service';

const {
  applyNoStore,
  getListLimitFromRequest,
  sendMethodNotAllowed,
  sendServiceError,
  withReplayJobStore,
} = replayJobHttp;
const { createReplayJob, listReplayJobs } = replayJobService;

function createHandler(dependencies = {}) {
  return async function handler(request, response) {
    applyNoStore(response);

    if (request.method === 'GET') {
      try {
        const jobs = await withReplayJobStore(
          ({ store }) =>
            listReplayJobs({
              limit: getListLimitFromRequest(request),
              store,
            }),
          dependencies
        );

        response.status(200).json({ jobs });
      } catch (error) {
        sendServiceError(response, error);
      }

      return;
    }

    if (request.method === 'POST') {
      try {
        const job = await withReplayJobStore(
          ({ env, now, store }) =>
            createReplayJob(request.body || {}, {
              env,
              now,
              replayPlanResolver: dependencies.replayPlanResolver,
              store,
            }),
          dependencies
        );

        response.status(201).json({ job });
      } catch (error) {
        sendServiceError(response, error);
      }

      return;
    }

    sendMethodNotAllowed(response, ['GET', 'POST']);
  };
}

export default createHandler();
export { createHandler };
