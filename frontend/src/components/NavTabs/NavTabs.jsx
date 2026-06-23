import { useState, useEffect } from 'react';
import styles from './NavTabs.module.css';

const TABS = [
  { id: 'transactions', label: 'עסקאות' },
  { id: 'stripe',       label: 'Stripe' },
  { id: 'bank',         label: 'העברות בנקאיות' },
  { id: 'keva',         label: 'הוראות קבע' },
  { id: 'grow',         label: 'Grow' },
  { id: 'receipts',     label: 'קבלות' },
];

const ADMIN_TAB = { id: 'users', label: 'ניהול משתמשים' };

export default function NavTabs({ active, onChange, role }) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const tabs = role === 'admin' ? [...TABS, ADMIN_TAB] : TABS;
  const activeTab = tabs.find((t) => t.id === active);

  function handleChange(id) {
    onChange(id);
    setDrawerOpen(false);
  }

  // Lock body scroll when drawer is open
  useEffect(() => {
    document.body.style.overflow = drawerOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [drawerOpen]);

  return (
    <>
      {/* ── Desktop: horizontal pill tabs ── */}
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

      {/* ── Mobile: current tab button that opens drawer ── */}
      <button
        className={styles.mobileNavBtn}
        onClick={() => setDrawerOpen(true)}
        aria-label="פתח תפריט ניווט"
      >
        <span className={styles.mobileNavLabel}>{activeTab?.label}</span>
        <svg viewBox="0 0 22 16" fill="none" className={styles.burgerIcon} aria-hidden="true">
          <path d="M1 2h20M1 8h20M1 14h20" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
        </svg>
      </button>

      {/* ── Drawer backdrop ── */}
      {drawerOpen && (
        <div
          className={styles.backdrop}
          onClick={() => setDrawerOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* ── Side drawer ── */}
      <div className={`${styles.drawer} ${drawerOpen ? styles.drawerOpen : ''}`} role="dialog" aria-modal="true">
        <div className={styles.drawerHeader}>
          <span className={styles.drawerTitle}>תפריט</span>
          <button
            className={styles.drawerClose}
            onClick={() => setDrawerOpen(false)}
            aria-label="סגור תפריט"
          >✕</button>
        </div>

        <nav className={styles.drawerNav}>
          {tabs.map((tab) => (
            <button
              key={tab.id}
              className={`${styles.drawerTab} ${active === tab.id ? styles.drawerTabActive : ''}`}
              onClick={() => handleChange(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>
    </>
  );
}
