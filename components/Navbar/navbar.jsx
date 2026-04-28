import Image from 'next/image';
import Link from 'next/link';
import LighthouseLogo from '../../public/LighthouseLogo.png';
import styles from '../../styles/Home.module.css';

export default function NavBar() {
  return (
    <header className={styles.topbar}>
      <Link href="/" className={styles.brand} aria-label="Lighthouse home">
        <Image src={LighthouseLogo} alt="" width={36} height={36} priority />
        <span>Lighthouse</span>
      </Link>
      <nav className={styles.navActions} aria-label="Primary navigation">
        <a href="#metrics">Metrics</a>
        <a href="#replay">Replay</a>
        <a href="#roadmap">Roadmap</a>
        <a
          href="https://github.com/Chinzillla/Lighthouse"
          target="_blank"
          rel="noreferrer"
        >
          GitHub
        </a>
      </nav>
    </header>
  );
}
