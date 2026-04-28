const JOB_POLL_INTERVAL_MS = 5000;
const RECENT_JOB_LIMIT = 12;

function createClientError(message, statusCode) {
  const error = new Error(message);
  error.name = 'ReplayClientError';
  error.statusCode = statusCode;
  return error;
}

function parseRequiredText(label, value) {
  const normalizedValue = String(value || '').trim();

  if (!normalizedValue) {
    throw createClientError(`${label} is required`, 400);
  }

  return normalizedValue;
}

function parseRequiredInteger(label, value) {
  const normalizedValue = String(value ?? '').trim();

  if (!/^\d+$/.test(normalizedValue)) {
    throw createClientError(`${label} must be a non-negative integer`, 400);
  }

  return normalizedValue;
}

function validateReplayDraftInput(input) {
  const source = parseRequiredText('Source topic', input.source);
  const destination = parseRequiredText('Destination topic', input.destination);
  const partition = parseRequiredInteger('Partition', input.partition);
  const start = parseRequiredInteger('Start offset', input.start);
  const end = parseRequiredInteger('End offset', input.end);
  const jobId = String(input.jobId || '').trim();

  if (source === destination) {
    throw createClientError('Source and destination topics must be different', 400);
  }

  if (Number(start) > Number(end)) {
    throw createClientError('Start offset must be less than or equal to end offset', 400);
  }

  return {
    destination,
    end,
    partition,
    source,
    start,
    ...(jobId ? { 'job-id': jobId } : {}),
  };
}

async function requestJson(url, { body, fetcher = globalThis.fetch, method = 'GET', signal } = {}) {
  if (typeof fetcher !== 'function') {
    throw createClientError('A fetch implementation is required', 500);
  }

  const response = await fetcher(url, {
    ...(body
      ? {
          body: JSON.stringify(body),
        }
      : {}),
    headers: {
      accept: 'application/json',
      ...(body ? { 'content-type': 'application/json' } : {}),
    },
    method,
    ...(signal ? { signal } : {}),
  });
  const payload = await response.json();

  if (!response.ok) {
    throw createClientError(payload.error || 'Replay request failed', response.status);
  }

  return payload;
}

function fetchReplayJobs({ fetcher, limit = RECENT_JOB_LIMIT, signal } = {}) {
  return requestJson(`/api/jobs?limit=${limit}`, { fetcher, signal });
}

async function createReplayJobDraft(input, { fetcher } = {}) {
  return requestJson('/api/jobs', {
    body: validateReplayDraftInput(input),
    fetcher,
    method: 'POST',
  });
}

function previewReplayJob(jobId, { fetcher } = {}) {
  return requestJson(`/api/jobs/${encodeURIComponent(jobId)}/preview`, {
    fetcher,
  });
}

function startReplayJob(jobId, { fetcher } = {}) {
  return requestJson(`/api/jobs/${encodeURIComponent(jobId)}/start`, {
    fetcher,
    method: 'POST',
  });
}

function cancelReplayJob(jobId, { fetcher } = {}) {
  return requestJson(`/api/jobs/${encodeURIComponent(jobId)}/cancel`, {
    fetcher,
    method: 'POST',
  });
}

module.exports = {
  JOB_POLL_INTERVAL_MS,
  RECENT_JOB_LIMIT,
  cancelReplayJob,
  createClientError,
  createReplayJobDraft,
  fetchReplayJobs,
  previewReplayJob,
  requestJson,
  startReplayJob,
  validateReplayDraftInput,
};
