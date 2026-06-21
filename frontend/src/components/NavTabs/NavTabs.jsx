import styles from './NavTabs.module.css';

const TABS = [
  { id: 'transactions', label: 'עסקאות' },
  { id: 'stripe',       label: 'Stripe' },
  { id: 'bank',         label: 'העברות בנקאיות' },
  { id: 'keva',         label: 'הוראות קבע' },
  { id: 'receipts',     label: 'קבלות' },
];

const ADMIN_TAB = { id: 'users', label: 'ניהול משתמשים' };

export default function NavTabs({ active, onChange, role }) {
  const tabs = role === 'admin' ? [...TABS, ADMIN_TAB] : TABS;

  return (
    <div className={styles.tabs}>
      {tabs.map((tab) => (
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
