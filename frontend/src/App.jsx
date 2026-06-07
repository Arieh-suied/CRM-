import { useState, useEffect, useCallback } from 'react';
import styles from './App.module.css';
import NavTabs from './components/NavTabs/NavTabs.jsx';
import LoginScreen from './components/LoginScreen/LoginScreen.jsx';
import AccessDenied from './components/AccessDenied/AccessDenied.jsx';
import { useAuth } from './contexts/AuthContext.jsx';
import SummaryCards from './components/SummaryCards/SummaryCards.jsx';
import FiltersBar from './components/FiltersBar/FiltersBar.jsx';
import SearchBar from './components/SearchBar/SearchBar.jsx';
import TransactionsTable from './components/TransactionsTable/TransactionsTable.jsx';
import StripeDonations from './components/StripeDonations/StripeDonations.jsx';
import BankTransfers from './components/BankTransfers/BankTransfers.jsx';
import { useTransactions } from './hooks/useTransactions.js';
import { fetchInstitutions, fetchFilterOptions } from './services/api.js';
import PaymentFailures from './components/PaymentFailures/PaymentFailures.jsx';

const EMPTY_FILTERS = {
  mosad_number: '', transaction_type: '', group_name: '',
  date_from: '', date_to: '', search: '',
};

const DEFAULT_SORT = { sort_by: 'transaction_time_iso', sort_dir: 'desc' };

function Dashboard({ user, signOut }) {
  const [activeTab, setActiveTab] = useState('transactions');
  const [filters, setFilters]     = useState(EMPTY_FILTERS);
  const [sort, setSort]           = useState(DEFAULT_SORT);
  const [institutions, setInstitutions]   = useState([]);
  const [filterOptions, setFilterOptions] = useState({ transaction_types: [], group_names: [] });

  const { transactions, summary, pagination, loading, error, loadPage } =
    useTransactions(filters, sort);

  useEffect(() => {
    fetchInstitutions().then(setInstitutions).catch(console.error);
    fetchFilterOptions().then(setFilterOptions).catch(console.error);
  }, []);

  const handleFiltersChange = useCallback((newFilters) => {
    setFilters((prev) => ({ ...prev, ...newFilters, search: prev.search }));
  }, []);

  const handleSearch = useCallback((term) => {
    setFilters((prev) => ({ ...prev, search: term }));
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
          <span className={styles.userEmail}>{user.email}</span>
          <button className={styles.signOutBtn} onClick={signOut}>התנתק</button>
        </div>
      </header>

      <main className={styles.main}>
        <NavTabs active={activeTab} onChange={setActiveTab} />

        {activeTab === 'transactions' && (
          <>
            <SummaryCards
              summary={summary}
              institutions={institutions}
              loading={loading}
              selectedMosad={filters.mosad_number}
              onSelectMosad={(mosad_number) => setFilters((prev) => ({ ...prev, mosad_number }))}
            />
            <SearchBar onSearch={handleSearch} />
            <FiltersBar
              filters={filters}
              onChange={handleFiltersChange}
              institutions={institutions}
              filterOptions={filterOptions}
            />
            {error && <div className={styles.error}>שגיאה: {error}</div>}
            <TransactionsTable
              transactions={transactions}
              institutions={institutions}
              loading={loading}
              pagination={pagination}
              sort={sort}
              onSort={handleSort}
              onPageChange={loadPage}
            />
          </>
        )}

        {activeTab === 'stripe' && <StripeDonations />}
        {activeTab === 'bank' && <BankTransfers institutions={institutions} />}
        {activeTab === 'failures' && <PaymentFailures />}
      </main>
    </div>
  );
}

export default function App() {
  const { user, isAllowed, loading, signOut } = useAuth();

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--color-bg)' }}>
        <span style={{ color: 'var(--color-text-muted)', fontSize: 14 }}>טוען...</span>
      </div>
    );
  }

  if (!user) return <LoginScreen />;
  if (!isAllowed) return <AccessDenied />;

  return <Dashboard user={user} signOut={signOut} />;
}
