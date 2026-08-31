import { useState, useEffect } from 'react';
import styles from './NavTabs.module.css';

// Tabs without `roles` are visible to everyone; otherwise only to the listed roles.
// 'institution' is a narrow, row-scoped portal role (see frontend/api/_scope.js) —
// every tab it should NOT see needs an explicit roles list that excludes it.
const STAFF_ROLES = ['admin', 'editor', 'viewer'];

const ALL_TABS = [
  { id: 'transactions', label: 'עסקאות' },
  { id: 'stripe',       label: 'Stripe', roles: STAFF_ROLES },
  { id: 'bank',         label: 'העברות בנקאיות', roles: STAFF_ROLES },
  { id: 'keva',         label: 'הוראות קבע', roles: STAFF_ROLES },
  { id: 'grow',         label: 'Grow', roles: STAFF_ROLES },
  { id: 'receipts',     label: 'קבלות', roles: STAFF_ROLES },
  { id: 'funds',        label: 'ניהול קרנות', roles: STAFF_ROLES },
  { id: 'fund-transfer', label: 'העברה לנתמך', roles: ['admin', 'editor'] },
  { id: 'failures',     label: 'סירובים' },
  { id: 'bank-refusals', label: 'סירובים בנקאי', roles: STAFF_ROLES },
  { id: 'summary',      label: 'סיכום', roles: ['institution'] },
  { id: 'email-template', label: 'תבנית מייל', roles: ['admin', 'editor'] },
  { id: 'users',        label: 'ניהול משתמשים', roles: ['admin'] },
];

export default function NavTabs({ active, onChange, role, extraTabs = [] }) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const tabs = ALL_TABS.filter((t) => !t.roles || t.roles.includes(role) || extraTabs.includes(t.id));
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
