import { useEffect, useMemo, useState } from 'react';
import replayClient from '../../lib/replay-jobs/client';
import styles from '../../styles/ReplayWorkspace.module.css';

const {
  JOB_POLL_INTERVAL_MS,
  RECENT_JOB_LIMIT,
  cancelReplayJob,
  createReplayJobDraft,
  fetchReplayJobs,
  previewReplayJob,
  startReplayJob,
} = replayClient;

const INITIAL_FORM = {
  destination: 'orders-replay',
  end: '5',
  endTimestamp: '',
  jobId: '',
  messagesPerSecond: '',
  mode: 'offset',
  partition: '0',
  source: 'orders',
  start: '0',
  startTimestamp: '',
};

const EMPTY_PREVIEW = {
  error: null,
  jobId: null,
  loading: false,
  messages: [],
  summary: null,
};

function formatJobSource(job) {
  return `${job.sourceTopic}[${job.partition}]`;
}

function formatJobTarget(job) {
  return `${job.destinationTopic}[${job.partition}]`;
}

function formatReplayMode(job) {
  return job.replayMode === 'timestamp' ? 'Time window' : 'Offset range';
}

function formatJobRange(job) {
  return `${job.startOffset}-${job.endOffset}`;
}

function formatTimestampWindow(job) {
  if (job.replayMode !== 'timestamp') {
    return null;
  }

  return `${new Date(job.startTimestamp).toLocaleString()} to ${new Date(
    job.endTimestamp
  ).toLocaleString()}`;
}

function formatThrottle(job) {
  return job.messagesPerSecond ? `${job.messagesPerSecond}/s` : 'Unthrottled';
}

function formatUpdatedAt(value) {
  if (!value) {
    return 'Waiting';
  }

  return new Date(value).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function upsertJob(currentJobs, nextJob) {
  const remainingJobs = currentJobs.filter((job) => job.jobId !== nextJob.jobId);

  return [nextJob, ...remainingJobs]
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
    .slice(0, RECENT_JOB_LIMIT);
}

function ReplayPreview({ previewState, selectedJob }) {
  if (previewState.loading) {
    return <p className={styles.panelStatus}>Previewing messages...</p>;
  }

  if (previewState.error) {
    return <p className={styles.panelError}>{previewState.error.message}</p>;
  }

  if (!selectedJob) {
    return (
      <p className={styles.panelStatus}>
        Save or select a replay job to inspect the requested message window.
      </p>
    );
  }

  if (!previewState.summary || previewState.jobId !== selectedJob.jobId) {
    return (
      <p className={styles.panelStatus}>
        No preview loaded for <code>{selectedJob.jobId}</code>.
      </p>
    );
  }

  return (
    <>
      <dl className={styles.previewSummary}>
        <div>
          <dt>Messages</dt>
          <dd>{previewState.summary.replayedCount}</dd>
        </div>
        <div>
          <dt>Range</dt>
          <dd>
            {previewState.summary.startOffset}-{previewState.summary.endOffset}
          </dd>
        </div>
        <div>
          <dt>Last offset</dt>
          <dd>{previewState.summary.lastReplayedOffset ?? 'None'}</dd>
        </div>
      </dl>

      <div className={styles.previewList} aria-label="Replay preview messages">
        {previewState.messages.map((message) => (
          <article key={`${message.partition}-${message.offset}`} className={styles.previewItem}>
            <header>
              <strong>{message.key || '<empty-key>'}</strong>
              <span>
                {message.sourceTopic}[{message.partition}] offset {message.offset}
              </span>
            </header>
            <pre>{message.value || '<empty>'}</pre>
            <dl>
              {Object.entries(message.headers || {}).map(([key, value]) => (
                <div key={key}>
                  <dt>{key}</dt>
                  <dd>{value || '<empty>'}</dd>
                </div>
              ))}
            </dl>
          </article>
        ))}
      </div>
    </>
  );
}

function ReplayJobsTable({ jobs, loading, onSelectJob, selectedJobId }) {
  if (loading && jobs.length === 0) {
    return <p className={styles.panelStatus}>Loading replay jobs...</p>;
  }

  if (jobs.length === 0) {
    return <p className={styles.panelStatus}>No replay jobs saved yet.</p>;
  }

  return (
    <div className={styles.tableWrap}>
      <table className={styles.jobTable}>
        <thead>
          <tr>
            <th>Job</th>
            <th>Source</th>
            <th>Target</th>
            <th>Mode</th>
            <th>Status</th>
            <th>Progress</th>
            <th>Updated</th>
          </tr>
        </thead>
        <tbody>
          {jobs.map((job) => {
            const isSelected = selectedJobId === job.jobId;

            return (
              <tr
                key={job.jobId}
                className={isSelected ? styles.jobRowSelected : undefined}
              >
                <td>
                  <button
                    type="button"
                    className={styles.jobSelect}
                    onClick={() => onSelectJob(job.jobId)}
                  >
                    <span>{job.jobId}</span>
                    <small>{formatJobRange(job)}</small>
                    {job.messagesPerSecond ? <small>{formatThrottle(job)}</small> : null}
                    {job.dryRun ? <small>Dry run</small> : null}
                  </button>
                </td>
                <td>{formatJobSource(job)}</td>
                <td>{formatJobTarget(job)}</td>
                <td>{formatReplayMode(job)}</td>
                <td>
                  <span className={styles.statusPill} data-status={job.status}>
                    {job.status}
                  </span>
                </td>
                <td>
                  {job.replayedCount}/{job.progressTotal}
                </td>
                <td>{formatUpdatedAt(job.updatedAt)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default function ReplayWorkspace() {
  const [formState, setFormState] = useState(INITIAL_FORM);
  const [jobsState, setJobsState] = useState({
    error: null,
    jobs: [],
    lastUpdatedAt: null,
    loading: true,
  });
  const [previewState, setPreviewState] = useState(EMPTY_PREVIEW);
  const [actionState, setActionState] = useState({
    error: null,
    loading: false,
    message: null,
  });
  const [selectedJobId, setSelectedJobId] = useState(null);

  useEffect(() => {
    let isMounted = true;
    let currentController;

    async function loadJobs() {
      if (currentController) {
        currentController.abort();
      }

      currentController = new AbortController();

      try {
        const payload = await fetchReplayJobs({ signal: currentController.signal });

        if (!isMounted) {
          return;
        }

        setJobsState({
          error: null,
          jobs: payload.jobs ?? [],
          lastUpdatedAt: new Date().toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
          }),
          loading: false,
        });
        setSelectedJobId((currentJobId) => {
          if (payload.jobs?.some((job) => job.jobId === currentJobId)) {
            return currentJobId;
          }

          return payload.jobs?.[0]?.jobId ?? null;
        });
      } catch (error) {
        if (error.name === 'AbortError' || !isMounted) {
          return;
        }

        setJobsState((currentState) => ({
          ...currentState,
          error,
          loading: false,
        }));
      }
    }

    loadJobs();
    const interval = setInterval(loadJobs, JOB_POLL_INTERVAL_MS);

    return () => {
      isMounted = false;
      clearInterval(interval);

      if (currentController) {
        currentController.abort();
      }
    };
  }, []);

  const selectedJob = useMemo(
    () => jobsState.jobs.find((job) => job.jobId === selectedJobId) ?? null,
    [jobsState.jobs, selectedJobId]
  );

  function updateFormField(field, value) {
    setFormState((currentState) => ({
      ...currentState,
      [field]: value,
    }));
  }

  function resetActionState() {
    setActionState({
      error: null,
      loading: false,
      message: null,
    });
  }

  function recordActionMessage(message) {
    setActionState({
      error: null,
      loading: false,
      message,
    });
  }

  async function handleCreateDraft(event) {
    event.preventDefault();
    setActionState({
      error: null,
      loading: true,
      message: null,
    });

    try {
      const payload = await createReplayJobDraft(formState);
      setJobsState((currentState) => ({
        ...currentState,
        error: null,
        jobs: upsertJob(currentState.jobs, payload.job),
      }));
      setSelectedJobId(payload.job.jobId);
      setPreviewState(EMPTY_PREVIEW);
      setFormState((currentState) => ({
        ...currentState,
        jobId: '',
      }));
      recordActionMessage(`Saved replay job ${payload.job.jobId}.`);
    } catch (error) {
      setActionState({
        error,
        loading: false,
        message: null,
      });
    }
  }

  async function handlePreviewJob() {
    if (!selectedJob) {
      return;
    }

    resetActionState();
    setPreviewState({
      error: null,
      jobId: selectedJob.jobId,
      loading: true,
      messages: [],
      summary: null,
    });

    try {
      const payload = await previewReplayJob(selectedJob.jobId);
      setPreviewState({
        error: null,
        jobId: selectedJob.jobId,
        loading: false,
        messages: payload.preview.messages ?? [],
        summary: payload.preview.summary ?? null,
      });
      recordActionMessage(`Loaded preview for ${selectedJob.jobId}.`);
    } catch (error) {
      setPreviewState({
        error,
        jobId: selectedJob.jobId,
        loading: false,
        messages: [],
        summary: null,
      });
    }
  }

  async function handleStartJob() {
    if (!selectedJob) {
      return;
    }

    setActionState({
      error: null,
      loading: true,
      message: null,
    });

    try {
      const payload = await startReplayJob(selectedJob.jobId);
      setJobsState((currentState) => ({
        ...currentState,
        jobs: upsertJob(currentState.jobs, payload.job),
      }));
      recordActionMessage(`Started replay job ${selectedJob.jobId}.`);
    } catch (error) {
      setActionState({
        error,
        loading: false,
        message: null,
      });
    }
  }

  async function handleCancelJob() {
    if (!selectedJob) {
      return;
    }

    setActionState({
      error: null,
      loading: true,
      message: null,
    });

    try {
      const payload = await cancelReplayJob(selectedJob.jobId);
      setJobsState((currentState) => ({
        ...currentState,
        jobs: upsertJob(currentState.jobs, payload.job),
      }));
      recordActionMessage(`Cancelled replay job ${selectedJob.jobId}.`);
    } catch (error) {
      setActionState({
        error,
        loading: false,
        message: null,
      });
    }
  }

  return (
    <section className={styles.workspace} id="replay" aria-label="Replay workspace">
      <div className={styles.sectionHeader}>
        <div>
          <p className={styles.eyebrow}>Replay workspace</p>
          <h2>Prepare a bounded replay, preview the payloads, then launch it.</h2>
        </div>
        <dl className={styles.meta}>
          <div>
            <dt>Jobs</dt>
            <dd>{jobsState.jobs.length}</dd>
          </div>
          <div>
            <dt>Refresh</dt>
            <dd>{JOB_POLL_INTERVAL_MS / 1000}s</dd>
          </div>
          <div>
            <dt>Last sync</dt>
            <dd>{jobsState.lastUpdatedAt ?? 'Waiting'}</dd>
          </div>
        </dl>
      </div>

      <div className={styles.topGrid}>
        <article className={styles.panel}>
          <div className={styles.panelHeader}>
            <div>
              <h3>Create draft</h3>
              <p>Save one replay request into the persisted job queue.</p>
            </div>
          </div>

          <form className={styles.form} onSubmit={handleCreateDraft}>
            <div className={styles.modeField}>
              <span>Replay mode</span>
              <div className={styles.modeControl} role="group" aria-label="Replay mode">
                <button
                  type="button"
                  className={formState.mode === 'offset' ? styles.modeButtonActive : undefined}
                  aria-pressed={formState.mode === 'offset'}
                  onClick={() => updateFormField('mode', 'offset')}
                >
                  Offsets
                </button>
                <button
                  type="button"
                  className={
                    formState.mode === 'timestamp' ? styles.modeButtonActive : undefined
                  }
                  aria-pressed={formState.mode === 'timestamp'}
                  onClick={() => updateFormField('mode', 'timestamp')}
                >
                  Time window
                </button>
              </div>
            </div>
            <label>
              <span>Source topic</span>
              <input
                name="source"
                value={formState.source}
                onChange={(event) => updateFormField('source', event.target.value)}
              />
            </label>
            <label>
              <span>Destination topic</span>
              <input
                name="destination"
                value={formState.destination}
                onChange={(event) => updateFormField('destination', event.target.value)}
              />
            </label>
            <label>
              <span>Partition</span>
              <input
                name="partition"
                inputMode="numeric"
                value={formState.partition}
                onChange={(event) => updateFormField('partition', event.target.value)}
              />
            </label>
            {formState.mode === 'timestamp' ? (
              <>
                <label>
                  <span>Start timestamp</span>
                  <input
                    name="startTimestamp"
                    placeholder="2026-04-28T14:03:00.000Z"
                    value={formState.startTimestamp}
                    onChange={(event) =>
                      updateFormField('startTimestamp', event.target.value)
                    }
                  />
                </label>
                <label>
                  <span>End timestamp</span>
                  <input
                    name="endTimestamp"
                    placeholder="2026-04-28T14:08:00.000Z"
                    value={formState.endTimestamp}
                    onChange={(event) => updateFormField('endTimestamp', event.target.value)}
                  />
                </label>
              </>
            ) : (
              <>
                <label>
                  <span>Start offset</span>
                  <input
                    name="start"
                    inputMode="numeric"
                    value={formState.start}
                    onChange={(event) => updateFormField('start', event.target.value)}
                  />
                </label>
                <label>
                  <span>End offset</span>
                  <input
                    name="end"
                    inputMode="numeric"
                    value={formState.end}
                    onChange={(event) => updateFormField('end', event.target.value)}
                  />
                </label>
              </>
            )}
            <label>
              <span>Job ID (optional)</span>
              <input
                name="jobId"
                placeholder="Leave blank to auto-generate"
                value={formState.jobId}
                onChange={(event) => updateFormField('jobId', event.target.value)}
              />
            </label>
            <label>
              <span>Max messages/sec</span>
              <input
                name="messagesPerSecond"
                inputMode="numeric"
                placeholder="Unthrottled"
                value={formState.messagesPerSecond}
                onChange={(event) =>
                  updateFormField('messagesPerSecond', event.target.value)
                }
              />
            </label>
            <div className={styles.formActions}>
              <button type="submit" disabled={actionState.loading}>
                {actionState.loading ? 'Saving...' : 'Save draft'}
              </button>
            </div>
          </form>
        </article>

        <article className={styles.panel}>
          <div className={styles.panelHeader}>
            <div>
              <h3>Selected job</h3>
              <p>Preview, start, or cancel the currently selected replay request.</p>
            </div>
          </div>

          {selectedJob ? (
            <div className={styles.selectedJob}>
              <dl>
                <div>
                  <dt>Job</dt>
                  <dd>{selectedJob.jobId}</dd>
                </div>
                <div>
                  <dt>Source</dt>
                  <dd>{formatJobSource(selectedJob)}</dd>
                </div>
                <div>
                  <dt>Target</dt>
                  <dd>{formatJobTarget(selectedJob)}</dd>
                </div>
                <div>
                  <dt>Mode</dt>
                  <dd>{formatReplayMode(selectedJob)}</dd>
                </div>
                <div>
                  <dt>Offsets</dt>
                  <dd>{formatJobRange(selectedJob)}</dd>
                </div>
                <div>
                  <dt>Throttle</dt>
                  <dd>{formatThrottle(selectedJob)}</dd>
                </div>
                {formatTimestampWindow(selectedJob) ? (
                  <div>
                    <dt>Window</dt>
                    <dd>{formatTimestampWindow(selectedJob)}</dd>
                  </div>
                ) : null}
                <div>
                  <dt>Status</dt>
                  <dd>
                    <span className={styles.statusPill} data-status={selectedJob.status}>
                      {selectedJob.status}
                    </span>
                  </dd>
                </div>
                <div>
                  <dt>Progress</dt>
                  <dd>
                    {selectedJob.replayedCount}/{selectedJob.progressTotal}
                  </dd>
                </div>
                <div>
                  <dt>Updated</dt>
                  <dd>{formatUpdatedAt(selectedJob.updatedAt)}</dd>
                </div>
              </dl>
              <div className={styles.selectionActions}>
                <button type="button" onClick={handlePreviewJob} disabled={previewState.loading}>
                  Preview
                </button>
                <button
                  type="button"
                  onClick={handleStartJob}
                  disabled={
                    actionState.loading ||
                    !['draft', 'failed'].includes(selectedJob.status)
                  }
                >
                  Start replay
                </button>
                <button
                  type="button"
                  onClick={handleCancelJob}
                  disabled={
                    actionState.loading ||
                    !['draft', 'failed'].includes(selectedJob.status)
                  }
                  className={styles.secondaryButton}
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <p className={styles.panelStatus}>
              No replay job selected. Create a draft or choose one from recent jobs.
            </p>
          )}

          {actionState.error ? (
            <p className={styles.panelError}>{actionState.error.message}</p>
          ) : null}
          {actionState.message ? (
            <p className={styles.panelSuccess}>{actionState.message}</p>
          ) : null}
        </article>
      </div>

      <div className={styles.bottomGrid}>
        <article className={styles.panel}>
          <div className={styles.panelHeader}>
            <div>
              <h3>Preview output</h3>
              <p>Inspect keys, values, and replay headers before starting a job.</p>
            </div>
          </div>
          <ReplayPreview previewState={previewState} selectedJob={selectedJob} />
        </article>

        <article className={styles.panel}>
          <div className={styles.panelHeader}>
            <div>
              <h3>Recent jobs</h3>
              <p>Monitor draft, running, completed, failed, and cancelled requests.</p>
            </div>
          </div>
          {jobsState.error ? (
            <p className={styles.panelError}>{jobsState.error.message}</p>
          ) : null}
          <ReplayJobsTable
            jobs={jobsState.jobs}
            loading={jobsState.loading}
            onSelectJob={setSelectedJobId}
            selectedJobId={selectedJobId}
          />
        </article>
      </div>
    </section>
  );
}
