import { useQuery } from '@apollo/client';
import styles from '../styles/Home.module.css';
import NavBar from '../components/Navbar/navbar';
import BrokerSignal from '../components/Graphs/BrokerSignal.jsx';
import KafkaActivityChart from '../components/Graphs/KafkaActivityChart.jsx';
import LogEndOffset from '../components/Graphs/LogEndOffset.jsx';
import MetricsExporterStatus from '../components/Graphs/MetricsExporterStatus.jsx';
import PartitionCount from '../components/Graphs/PartitionCount.jsx';
import TopicInventoryChart from '../components/Graphs/TopicInventoryChart.jsx';
import gqlQueries from '../queries.jsx';

const POLL_INTERVAL_MS = 5000;

export default function Home() {
  const { data, error, loading } = useQuery(gqlQueries.dashboardMetrics, {
    notifyOnNetworkStatusChange: true,
    pollInterval: POLL_INTERVAL_MS,
  });

  const metrics = data?.dashboardMetrics ?? {};

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

