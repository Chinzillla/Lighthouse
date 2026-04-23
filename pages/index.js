import { useEffect, useState } from 'react';
import styles from '../styles/Home.module.css';
import NavBar from '../components/Navbar/navbar';
import BrokerSignal from '../components/Graphs/BrokerSignal.jsx';
import KafkaActivityChart from '../components/Graphs/KafkaActivityChart.jsx';
import LogEndOffset from '../components/Graphs/LogEndOffset.jsx';
import MetricsExporterStatus from '../components/Graphs/MetricsExporterStatus.jsx';
import PartitionCount from '../components/Graphs/PartitionCount.jsx';
import TopicInventoryChart from '../components/Graphs/TopicInventoryChart.jsx';

const POLL_INTERVAL_MS = 5000;

const EMPTY_METRICS = {};

export default function Home() {
  const [{ error, loading, metrics }, setMetricsState] = useState({
    error: null,
    loading: true,
    metrics: EMPTY_METRICS,
  });

  useEffect(() => {
    let isMounted = true;
    let currentController;

    async function loadDashboardMetrics() {
      if (currentController) {
        currentController.abort();
      }

      currentController = new AbortController();

      try {
        const response = await fetch('/api/dashboard-metrics', {
          headers: {
            accept: 'application/json',
          },
          method: 'GET',
          signal: currentController.signal,
        });

        if (!response.ok) {
          throw new Error('Metrics request failed');
        }

        const payload = await response.json();

        if (!isMounted) return;

        setMetricsState({
          error: null,
          loading: false,
          metrics: payload.dashboardMetrics ?? EMPTY_METRICS,
        });
      } catch (requestError) {
        if (requestError.name === 'AbortError' || !isMounted) return;

        setMetricsState((currentState) => ({
          error: requestError,
          loading: false,
          metrics: currentState.metrics ?? EMPTY_METRICS,
        }));
      }
    }

    loadDashboardMetrics();

    const interval = setInterval(loadDashboardMetrics, POLL_INTERVAL_MS);

    return () => {
      isMounted = false;
      clearInterval(interval);

      if (currentController) {
        currentController.abort();
      }
    };
  }, []);

  const apiStatus = error
    ? 'Prometheus unavailable'
    : loading
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
              <span className={error ? styles.statusBad : styles.statusOk} />
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
            <BrokerSignal value={metrics.brokerCount} />
          </article>
          <article className={styles.metricCard}>
            <LogEndOffset value={metrics.totalLogEndOffset} />
          </article>
          <article className={styles.metricCard}>
            <MetricsExporterStatus value={metrics.exporterUp} />
          </article>
        </section>

        <section className={styles.chartGrid} aria-label="Kafka snapshots">
          <article className={styles.chartPanel}>
            <KafkaActivityChart value={metrics.totalLogEndOffset} />
          </article>
          <article className={styles.chartPanel}>
            <TopicInventoryChart value={metrics.topicCount} />
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

