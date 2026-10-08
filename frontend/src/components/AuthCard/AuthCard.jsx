import styles from './AuthCard.module.css';
import { Icon } from '../ui';
import { cx } from '../../lib/cx.js';

// Centered card for the screens shown outside the app shell (login, no access).
export default function AuthCard({ icon = 'barChart', tone, title, subtitle, children }) {
  return (
    <main className={styles.page}>
      <div className={styles.card}>
        <div className={styles.brand}>
          <div className={cx(styles.mark, tone === 'danger' && styles.markDanger)}>
            <Icon name={icon} size={24} strokeWidth={2.2} />
          </div>
          <h1 className={styles.title}>{title}</h1>
          {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
        </div>
        {children}
      </div>
    </main>
  );
}
