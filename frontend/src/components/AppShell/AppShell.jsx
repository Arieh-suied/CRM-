import { useEffect, useState } from 'react';
import styles from './AppShell.module.css';
import { Icon, IconButton } from '../ui';
import { visibleNav, findScreen, ROLE_LABELS } from '../../navigation.js';
import { cx } from '../../lib/cx.js';

function Brand() {
  return (
    <div className={styles.brand}>
      <div className={styles.brandMark}><Icon name="barChart" size={18} strokeWidth={2.2} /></div>
      <div>
        <div className={styles.brandName}>לוח עסקאות</div>
        <div className={styles.brandSub}>ניהול תרומות וקבלות</div>
      </div>
    </div>
  );
}

// Screens are plain #hash links, so middle-click / "open in new tab" work too.
function NavLinks({ groups, active, onNavigate }) {
  return (
    <nav className={styles.nav} aria-label="ניווט ראשי">
      {groups.map((g) => (
        <div key={g.id} className={styles.group}>
          {g.label && <div className={styles.groupLabel}>{g.label}</div>}
          {g.items.map((item) => (
            <a
              key={item.id}
              href={`#${item.id}`}
              className={cx(styles.item, active === item.id && styles.itemActive)}
              aria-current={active === item.id ? 'page' : undefined}
              onClick={() => onNavigate?.(item.id)}
            >
              <Icon name={item.icon} size={18} />
              {item.label}
            </a>
          ))}
        </div>
      ))}
    </nav>
  );
}

function UserBlock({ email, role, onSignOut }) {
  return (
    <div className={styles.user}>
      <div className={styles.avatar} aria-hidden="true">{email ? email[0].toUpperCase() : '?'}</div>
      <div className={styles.userText}>
        <div className={styles.userEmail} title={email}>{email}</div>
        <div className={styles.userRole}>{ROLE_LABELS[role] ?? role}</div>
      </div>
      <IconButton icon="logout" label="התנתקות" onClick={onSignOut} />
    </div>
  );
}

export default function AppShell({ email, role, extraTabs, active, onSignOut, children }) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const groups = visibleNav(role, extraTabs);
  const screen = findScreen(active);

  // The drawer is mobile-only; close it on Esc and keep the page from
  // scrolling behind it.
  useEffect(() => {
    if (!drawerOpen) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') setDrawerOpen(false); };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [drawerOpen]);

  const sidebarBody = (onNavigate) => (
    <>
      <NavLinks groups={groups} active={active} onNavigate={onNavigate} />
      <UserBlock email={email} role={role} onSignOut={onSignOut} />
    </>
  );

  return (
    <div className={styles.shell}>
      <aside className={styles.sidebar}>
        <Brand />
        {sidebarBody()}
      </aside>

      <header className={styles.topbar}>
        <IconButton icon="menu" label="פתיחת התפריט" onClick={() => setDrawerOpen(true)} aria-expanded={drawerOpen} />
        <span className={styles.topbarTitle}>{screen?.label}</span>
      </header>

      {drawerOpen && <div className={styles.backdrop} onClick={() => setDrawerOpen(false)} aria-hidden="true" />}
      <aside className={cx(styles.drawer, drawerOpen && styles.drawerOpen)} aria-label="תפריט" aria-hidden={!drawerOpen}>
        <div className={styles.drawerHeader}>
          <Brand />
          <IconButton icon="x" label="סגירת התפריט" className={styles.drawerClose} onClick={() => setDrawerOpen(false)} />
        </div>
        {sidebarBody(() => setDrawerOpen(false))}
      </aside>

      <div className={styles.content}>
        <main className={styles.main}>
          {screen && (
            <header className={styles.pageHeader}>
              <h1 className={styles.pageTitle}>{screen.label}</h1>
              {screen.description && <p className={styles.pageDescription}>{screen.description}</p>}
            </header>
          )}
          {children}
        </main>
      </div>
    </div>
  );
}
