import { useMemo } from 'react';
import { useQuery } from '@apollo/client';
import styles from '../styles/Home.module.css';
import NavBar from '../components/Navbar/navbar';
import ActiveConnectionCount from '../components/Graphs/ActiveConnectionCount.jsx';
import PartitionCount from '../components/Graphs/PartitionCount.jsx';
import ReceivedBytes from '../components/Graphs/ReceivedBytes.jsx';
import ReceivedRecords from '../components/Graphs/ReceivedRecords.jsx';
import RetainedBytes from '../components/Graphs/RetainedBytes.jsx';
import SuccessfulAuthenticationCount from '../components/Graphs/SuccessfulAuthenticationCount.jsx';
import gqlQueries from '../queries.jsx';

const POLL_INTERVAL_MS = 5000;

function firstMetricValue(data, fieldName) {
  const result = data?.[fieldName]?.data?.result?.find(
    (entry) => entry?.value?.[1] !== undefined
  );

  return result?.value?.[1] ?? 0;
}

function useMetricQuery(query) {
  return useQuery(query, {
    notifyOnNetworkStatusChange: true,
    pollInterval: POLL_INTERVAL_MS,
  });
}

export default function Home() {
  const partitionQuery = useMetricQuery(gqlQueries.partitionCount);
  const receivedBytesQuery = useMetricQuery(gqlQueries.receivedBytes);
  const retainedBytesQuery = useMetricQuery(gqlQueries.retainedBytes);
  const receivedRecordsQuery = useMetricQuery(gqlQueries.receivedRecords);
  const authQuery = useMetricQuery(gqlQueries.authCount);
  const activeConnectionsQuery = useMetricQuery(gqlQueries.activeConnections);

  const queries = [
    partitionQuery,
    receivedBytesQuery,
    retainedBytesQuery,
    receivedRecordsQuery,
    authQuery,
    activeConnectionsQuery,
  ];

  const isLoading = queries.some((query) => query.loading);
  const hasError = queries.some((query) => query.error);

  const metrics = useMemo(
    () => ({
      activeConnections: firstMetricValue(
        activeConnectionsQuery.data,
        'activeConnectionCount'
      ),
      authCount: firstMetricValue(
        authQuery.data,
        'successfulAuthenticationCount'
      ),
      partitionCount: firstMetricValue(partitionQuery.data, 'prometheus'),
      receivedBytes: firstMetricValue(receivedBytesQuery.data, 'receivedBytes'),
      receivedRecords: firstMetricValue(
        receivedRecordsQuery.data,
        'receivedRecords'
      ),
      retainedBytes: firstMetricValue(retainedBytesQuery.data, 'retainedBytes'),
    }),
    [
      activeConnectionsQuery.data,
      authQuery.data,
      partitionQuery.data,
      receivedBytesQuery.data,
      receivedRecordsQuery.data,
      retainedBytesQuery.data,
    ]
  );

  const apiStatus = hasError
    ? 'Prometheus unavailable'
    : isLoading
    ? 'Polling metrics'
    : 'Metrics online';

  return (
    <div className={styles.page}>
      <NavBar />
      <main className={styles.shell}>
        <section className={styles.hero}>
          <div className={styles.heroCopy}>
            <p className={styles.eyebrow}>Kafka operations console</p>
            <h1>Cluster signals with a cleaner path to replay tooling.</h1>
            <p>
              Lighthouse is being rebuilt from a basic monitoring dashboard
              into a focused Kafka debugging workbench, starting with reliable
              metrics, CI, Docker, and a documented replay roadmap.
            </p>
          </div>

          <aside className={styles.statusPanel} aria-label="Runtime status">
            <div>
              <span className={hasError ? styles.statusBad : styles.statusOk} />
              <p>{apiStatus}</p>
            </div>
            <dl>
              <div>
                <dt>Refresh</dt>
                <dd>{POLL_INTERVAL_MS / 1000}s</dd>
              </div>
              <div>
                <dt>Source</dt>
                <dd>Prometheus</dd>
              </div>
              <div>
                <dt>Mode</dt>
                <dd>Read-only</dd>
              </div>
            </dl>
          </aside>
        </section>

        <section className={styles.metricGrid} id="metrics" aria-label="Kafka metrics">
          <article className={styles.metricCard}>
            <PartitionCount results={metrics.partitionCount} />
          </article>
          <article className={styles.metricCard}>
            <ActiveConnectionCount results={metrics.activeConnections} />
          </article>
          <article className={styles.metricCard}>
            <ReceivedRecords results={metrics.receivedRecords} />
          </article>
          <article className={styles.metricCard}>
            <SuccessfulAuthenticationCount results={metrics.authCount} />
          </article>
        </section>

        <section className={styles.chartGrid} aria-label="Kafka byte trends">
          <article className={styles.chartPanel}>
            <ReceivedBytes value={metrics.receivedBytes} />
          </article>
          <article className={styles.chartPanel}>
            <RetainedBytes value={metrics.retainedBytes} />
          </article>
        </section>

        <section className={styles.roadmapBand} id="roadmap">
          <div>
            <p className={styles.eyebrow}>Rebuild track</p>
            <h2>Foundation first, replay engine next.</h2>
          </div>
          <ol>
            <li>
              <span>1</span>
              Stabilize dashboard, CI, Docker, and documentation.
            </li>
            <li>
              <span>2</span>
              Add offset-range replay as a CLI with safety checks.
            </li>
            <li>
              <span>3</span>
              Promote replay jobs into an API-backed workflow.
            </li>
          </ol>
        </section>
      </main>
    </div>
  );
}

