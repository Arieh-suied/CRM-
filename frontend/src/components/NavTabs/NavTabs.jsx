import styles from './NavTabs.module.css';

const TABS = [
  { id: 'transactions', label: 'עסקאות' },
  { id: 'stripe',       label: 'Stripe' },
  { id: 'bank',         label: 'העברות בנקאיות' },
  { id: 'failures',     label: 'סירובים' },
];

export default function NavTabs({ active, onChange }) {
  return (
    <div className={styles.tabs}>
      {TABS.map((tab) => (
        <button
          key={tab.id}
          className={`${styles.tab} ${active === tab.id ? styles.tabActive : ''}`}
          onClick={() => onChange(tab.id)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
