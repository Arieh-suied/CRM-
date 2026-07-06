import { useState, useEffect, useCallback, useMemo, lazy, Suspense } from 'react';
import styles from './App.module.css';
import { useAuth } from './contexts/AuthContext.jsx';
import { useTransactions } from './hooks/useTransactions.js';
import { fetchInstitutions, fetchFilterOptions } from './services/api.js';

// Eager — app shell + the default (transactions) tab, needed on first paint.
import NavTabs from './components/NavTabs/NavTabs.jsx';
import LoginScreen from './components/LoginScreen/LoginScreen.jsx';
import AccessDenied from './components/AccessDenied/AccessDenied.jsx';
import FiltersBar from './components/FiltersBar/FiltersBar.jsx';
import TransactionsTable from './components/TransactionsTable/TransactionsTable.jsx';

// Lazy — every other tab loads its own chunk on demand (keeps the initial
// bundle small; the heavy Receipts tab also pulls in xlsx only when opened).
const StripeDonations  = lazy(() => import('./components/StripeDonations/StripeDonations.jsx'));
const BankTransfers    = lazy(() => import('./components/BankTransfers/BankTransfers.jsx'));
const StandingOrders   = lazy(() => import('./components/StandingOrders/StandingOrders.jsx'));
const Receipts         = lazy(() => import('./components/Receipts/Receipts.jsx'));
const GrowTransactions = lazy(() => import('./components/GrowTransactions/GrowTransactions.jsx'));
const UserManagement   = lazy(() => import('./components/UserManagement/UserManagement.jsx'));
const FundsManagement  = lazy(() => import('./components/Funds/FundsManagement.jsx'));
const PaymentFailures  = lazy(() => import('./components/PaymentFailures/PaymentFailures.jsx'));
const BankRefusals     = lazy(() => import('./components/BankRefusals/BankRefusals.jsx'));
const AIAssistant      = lazy(() => import('./components/AIAssistant/AIAssistant.jsx'));

const EMPTY_FILTERS = {
  mosad_number: '', transaction_type: '', group_name: '',
  date_from: '', date_to: '', search: '',
};

const DEFAULT_SORT = { sort_by: 'transaction_time_iso', sort_dir: 'desc' };

// Tab is mirrored in the URL hash (#stripe, #receipts…) so a refresh, bookmark,
// or back/forward keeps you on the same screen instead of resetting to עסקאות.
const VALID_TABS = new Set([
  'transactions', 'stripe', 'bank', 'keva', 'grow',
  'receipts', 'funds', 'failures', 'bank-refusals', 'users',
]);

function tabFromHash() {
  const h = window.location.hash.slice(1);
  return VALID_TABS.has(h) ? h : 'transactions';
}

function UserAvatar({ email }) {
  const initial = email ? email[0].toUpperCase() : '?';
  return <div className={styles.avatar}>{initial}</div>;
}

function Dashboard({ user, signOut, role, allowedMosadim }) {
  const [activeTab, setActiveTab]   = useState(tabFromHash);
  const [filters, setFilters]       = useState(EMPTY_FILTERS);
  const [sort, setSort]             = useState(DEFAULT_SORT);
  const [institutions, setInstitutions]   = useState([]);
  const [filterOptions, setFilterOptions] = useState({ transaction_types: [], group_names: [] });

  const { transactions, pagination, loading, error, loadPage } =
    useTransactions(filters, sort);

  useEffect(() => {
    fetchInstitutions().then(setInstitutions).catch(console.error);
    fetchFilterOptions().then(setFilterOptions).catch(console.error);
  }, []);

  // Sync the tab when the hash changes (browser back/forward, manual edit).
  useEffect(() => {
    const onHashChange = () => setActiveTab(tabFromHash());
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  // Filter institutions by what the user is allowed to see
  const visibleInstitutions = useMemo(() => {
    if (!allowedMosadim || allowedMosadim.length === 0) return institutions;
    return institutions.filter((i) => allowedMosadim.includes(i.mosad_number));
  }, [institutions, allowedMosadim]);

  const handleFiltersChange = useCallback((newFilters) => {
    setFilters((prev) => ({ ...prev, ...newFilters }));
  }, []);

  const handleSort = useCallback((column) => {
    setSort((prev) =>
      prev.sort_by === column
        ? { sort_by: column, sort_dir: prev.sort_dir === 'desc' ? 'asc' : 'desc' }
        : { sort_by: column, sort_dir: 'desc' }
    );
  }, []);

  const handleTabChange = useCallback((tab) => {
    // Writing the hash fires 'hashchange', which updates activeTab; when the
    // hash is already the target (e.g. re-click) set it directly.
    if (window.location.hash.slice(1) === tab) setActiveTab(tab);
    else window.location.hash = tab;
  }, []);

  return (
    <div className={styles.layout}>
      <header className={styles.header}>
        <h1 className={styles.title}>לוח עסקאות</h1>
        <div className={styles.headerRight}>
          {role === 'admin' && <span className={styles.roleBadge}>מנהל</span>}
          <UserAvatar email={user.email} />
          <span className={styles.userEmail}>{user.email}</span>
          <button className={styles.signOutBtn} onClick={signOut}>התנתק</button>
        </div>
      </header>

      <main className={styles.main}>
        <NavTabs active={activeTab} onChange={handleTabChange} role={role} />

        {activeTab === 'transactions' && (
          <>
            <FiltersBar
              filters={filters}
              onChange={handleFiltersChange}
              institutions={visibleInstitutions}
              filterOptions={filterOptions}
            />
            {error && <div className={styles.error}>שגיאה: {error}</div>}
            <TransactionsTable
              transactions={transactions}
              institutions={visibleInstitutions}
              loading={loading}
              pagination={pagination}
              sort={sort}
              onSort={handleSort}
              onPageChange={loadPage}
            />
          </>
        )}

        <Suspense fallback={<div className={styles.loadingText} style={{ padding: 40, textAlign: 'center' }}>טוען…</div>}>
          {activeTab === 'stripe'    && <StripeDonations />}
          {activeTab === 'bank'      && <BankTransfers institutions={visibleInstitutions} />}
          {activeTab === 'keva'      && <StandingOrders institutions={visibleInstitutions} />}
          {activeTab === 'receipts'  && <Receipts />}
          {activeTab === 'grow'      && <GrowTransactions />}
          {activeTab === 'funds'     && <FundsManagement />}
          {activeTab === 'failures'  && <PaymentFailures />}
          {activeTab === 'bank-refusals' && <BankRefusals institutions={visibleInstitutions} />}
          {activeTab === 'users' && role === 'admin' && (
            <UserManagement institutions={institutions} />
          )}
        </Suspense>
      </main>

      <Suspense fallback={null}>
        <AIAssistant />
      </Suspense>
    </div>
  );
}

export default function App() {
  const { user, isAllowed, role, allowedMosadim, loading, signOut } = useAuth();

  if (loading) {
    return (
      <div className={styles.loadingScreen}>
        <span className={styles.loadingText}>טוען...</span>
      </div>
    );
  }

  if (!user)      return <LoginScreen />;
  if (!isAllowed) return <AccessDenied />;

  return <Dashboard user={user} signOut={signOut} role={role} allowedMosadim={allowedMosadim} />;
}
