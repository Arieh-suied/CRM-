import { useState, useEffect, useCallback, useMemo, lazy, Suspense } from 'react';
import styles from './App.module.css';
import { useAuth } from './contexts/AuthContext.jsx';
import { useTransactions } from './hooks/useTransactions.js';
import { fetchInstitutions, fetchFilterOptions, fetchTransactions } from './services/api.js';
import { exportXlsx, dateStamp } from './lib/exportXlsx.js';
import { SCREEN_IDS, findScreen, canSee } from './navigation.js';
import { Alert, Card, Spinner, StateMessage, useToast } from './components/ui';

// Eager — app shell + the default (transactions) tab, needed on first paint.
import AppShell from './components/AppShell/AppShell.jsx';
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
const DonorReport      = lazy(() => import('./components/Receipts/DonorReport.jsx'));
const GrowTransactions = lazy(() => import('./components/GrowTransactions/GrowTransactions.jsx'));
const UserManagement   = lazy(() => import('./components/UserManagement/UserManagement.jsx'));
const FundsManagement  = lazy(() => import('./components/Funds/FundsManagement.jsx'));
const FundTransferForm = lazy(() => import('./components/Funds/FundTransferForm.jsx'));
const PaymentFailures  = lazy(() => import('./components/PaymentFailures/PaymentFailures.jsx'));
const BankRefusals     = lazy(() => import('./components/BankRefusals/BankRefusals.jsx'));
const AIAssistant      = lazy(() => import('./components/AIAssistant/AIAssistant.jsx'));
const EmailTemplate    = lazy(() => import('./components/EmailTemplate/EmailTemplate.jsx'));
const InstitutionSummary = lazy(() => import('./components/InstitutionSummary/InstitutionSummary.jsx'));

const EMPTY_FILTERS = {
  mosad_number: '', transaction_type: '', group_name: '',
  date_from: '', date_to: '', search: '',
};

const DEFAULT_SORT = { sort_by: 'transaction_time_iso', sort_dir: 'desc' };
const DEFAULT_TAB = 'transactions';

// The screen is mirrored in the URL hash (#stripe, #receipts…) so a refresh,
// bookmark, or back/forward keeps you on the same screen. The sidebar items
// are plain #links, so navigating is just a hash change.
function tabFromHash() {
  const h = window.location.hash.slice(1);
  return SCREEN_IDS.has(h) ? h : DEFAULT_TAB;
}

function Dashboard({ user, signOut, role, allowedMosadim, extraTabs }) {
  const toast = useToast();
  const [hashTab, setHashTab]       = useState(tabFromHash);
  const [filters, setFilters]       = useState(EMPTY_FILTERS);
  const [sort, setSort]             = useState(DEFAULT_SORT);
  const [institutions, setInstitutions]   = useState([]);
  const [filterOptions, setFilterOptions] = useState({ transaction_types: [], group_names: [] });
  const [loadError, setLoadError]         = useState(null);
  const [exporting, setExporting]         = useState(false);

  // A hash pointing at a screen this user can't open (old bookmark, shared
  // link) falls back to the default screen instead of an empty page.
  const activeTab = canSee(findScreen(hashTab), role, extraTabs) ? hashTab : DEFAULT_TAB;

  const { transactions, pagination, loading, error, loadPage } =
    useTransactions(filters, sort);

  useEffect(() => {
    const onLoadErr = () => setLoadError('חלק מהנתונים הבסיסיים (מוסדות/מסננים) לא נטענו. נסה לרענן את הדף.');
    fetchInstitutions().then(setInstitutions).catch(onLoadErr);
    fetchFilterOptions().then(setFilterOptions).catch(onLoadErr);
  }, []);

  // Sync the screen when the hash changes (sidebar link, back/forward, manual edit).
  useEffect(() => {
    const onHashChange = () => setHashTab(tabFromHash());
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  // New screen: start at the top, and name the browser tab after it.
  useEffect(() => {
    window.scrollTo(0, 0);
    const screen = findScreen(activeTab);
    document.title = screen ? `${screen.label} · לוח עסקאות` : 'לוח עסקאות';
  }, [activeTab]);

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

  const handleExport = useCallback(async () => {
    setExporting(true);
    try {
      const res = await fetchTransactions({ ...filters, ...sort, all: 1 });
      const instMap = Object.fromEntries(visibleInstitutions.map((i) => [i.mosad_number, i.mosad_name]));
      const rows = (res.data ?? []).map((tx) => ({
        'תאריך':    tx.transaction_time_raw ?? tx.transaction_time_iso ?? '',
        'שם תורם':  tx.client_name ?? '',
        'סכום':     tx.amount ?? '',
        'מטבע':     tx.currency ?? '',
        'סוג עסקה': tx.transaction_type ?? '',
        'קבוצה':    tx.group_name ?? '',
        'מוסד':     instMap[tx.mosad_number] ?? tx.mosad_number ?? '',
        'טלפון':    tx.phone ?? '',
        'מייל':     tx.email ?? '',
        'מס\' קבלה': tx.receipt_doc_num ?? '',
      }));
      if (rows.length) await exportXlsx(rows, `transactions-${dateStamp()}.xlsx`, 'עסקאות');
      else toast.info('אין עסקאות לייצוא בסינון הנוכחי');
    } catch (e) {
      toast.error(`הייצוא נכשל: ${e.message}`);
    } finally {
      setExporting(false);
    }
  }, [filters, sort, visibleInstitutions, toast]);

  return (
    <AppShell email={user.email} role={role} extraTabs={extraTabs} active={activeTab} onSignOut={signOut}>
      {loadError && <Alert tone="warning" className={styles.banner} onClose={() => setLoadError(null)}>{loadError}</Alert>}

      {activeTab === 'transactions' && (
        <Card clip>
          <FiltersBar
            filters={filters}
            onChange={handleFiltersChange}
            institutions={visibleInstitutions}
            filterOptions={filterOptions}
            onExport={handleExport}
            exporting={exporting}
            total={loading && !transactions.length ? null : pagination.total}
          />
          <TransactionsTable
            transactions={transactions}
            institutions={visibleInstitutions}
            loading={loading}
            error={error}
            onRetry={() => loadPage(pagination.page)}
            filtered={Object.values(filters).some(Boolean)}
            pagination={pagination}
            sort={sort}
            onSort={handleSort}
            onPageChange={loadPage}
            role={role}
          />
        </Card>
      )}

      <Suspense fallback={<StateMessage kind="loading" />}>
        {activeTab === 'stripe'    && <StripeDonations />}
        {activeTab === 'bank'      && <BankTransfers institutions={visibleInstitutions} />}
        {activeTab === 'keva' && (role !== 'institution' || extraTabs?.includes('keva')) && (
          <StandingOrders institutions={visibleInstitutions} />
        )}
        {activeTab === 'receipts'  && <Receipts />}
        {activeTab === 'donor-report' && (role !== 'institution' || extraTabs?.includes('donor-report')) && (
          <DonorReport />
        )}
        {activeTab === 'grow'      && <GrowTransactions />}
        {activeTab === 'funds'     && <FundsManagement />}
        {activeTab === 'fund-transfer' && <FundTransferForm />}
        {activeTab === 'failures'  && <PaymentFailures />}
        {activeTab === 'bank-refusals' && (role !== 'institution' || extraTabs?.includes('bank-refusals')) && (
          <BankRefusals institutions={visibleInstitutions} />
        )}
        {activeTab === 'summary' && role === 'institution' && <InstitutionSummary />}
        {activeTab === 'email-template' && ['admin', 'editor'].includes(role) && (
          <EmailTemplate institutions={visibleInstitutions} />
        )}
        {activeTab === 'users' && role === 'admin' && (
          <UserManagement institutions={institutions} groupNames={filterOptions.group_names} />
        )}
      </Suspense>

      {role !== 'institution' && (
        <Suspense fallback={null}>
          <AIAssistant />
        </Suspense>
      )}
    </AppShell>
  );
}

export default function App() {
  const { user, isAllowed, role, allowedMosadim, extraTabs, loading, signOut } = useAuth();

  if (loading) {
    return (
      <div className={styles.loadingScreen}>
        <Spinner size={28} className={styles.loadingSpinner} />
      </div>
    );
  }

  if (!user)      return <LoginScreen />;
  if (!isAllowed) return <AccessDenied />;

  return <Dashboard user={user} signOut={signOut} role={role} allowedMosadim={allowedMosadim} extraTabs={extraTabs} />;
}
