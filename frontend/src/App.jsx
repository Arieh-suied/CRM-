import { useState, useEffect, useCallback, useMemo } from 'react';
import styles from './App.module.css';
import NavTabs from './components/NavTabs/NavTabs.jsx';
import LoginScreen from './components/LoginScreen/LoginScreen.jsx';
import AccessDenied from './components/AccessDenied/AccessDenied.jsx';
import { useAuth } from './contexts/AuthContext.jsx';
import FiltersBar from './components/FiltersBar/FiltersBar.jsx';
import TransactionsTable from './components/TransactionsTable/TransactionsTable.jsx';
import StripeDonations from './components/StripeDonations/StripeDonations.jsx';
import BankTransfers from './components/BankTransfers/BankTransfers.jsx';
import { useTransactions } from './hooks/useTransactions.js';
import { fetchInstitutions, fetchFilterOptions } from './services/api.js';
import StandingOrders from './components/StandingOrders/StandingOrders.jsx';
import Receipts from './components/Receipts/Receipts.jsx';
import GrowTransactions from './components/GrowTransactions/GrowTransactions.jsx';
import UserManagement from './components/UserManagement/UserManagement.jsx';
import AIAssistant from './components/AIAssistant/AIAssistant.jsx';
import FundsManagement from './components/Funds/FundsManagement.jsx';

const EMPTY_FILTERS = {
  mosad_number: '', transaction_type: '', group_name: '',
  date_from: '', date_to: '', search: '',
};

const DEFAULT_SORT = { sort_by: 'transaction_time_iso', sort_dir: 'desc' };

function UserAvatar({ email }) {
  const initial = email ? email[0].toUpperCase() : '?';
  return <div className={styles.avatar}>{initial}</div>;
}

function Dashboard({ user, signOut, role, allowedMosadim }) {
  const [activeTab, setActiveTab]   = useState('transactions');
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
        <NavTabs active={activeTab} onChange={setActiveTab} role={role} />

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

        {activeTab === 'stripe'    && <StripeDonations />}
        {activeTab === 'bank'      && <BankTransfers institutions={visibleInstitutions} />}
        {activeTab === 'keva'      && <StandingOrders institutions={visibleInstitutions} />}
        {activeTab === 'receipts'  && <Receipts />}
        {activeTab === 'grow'      && <GrowTransactions />}
        {activeTab === 'funds'     && <FundsManagement />}
        {activeTab === 'users' && role === 'admin' && (
          <UserManagement institutions={institutions} />
        )}
      </main>

      <AIAssistant />
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
