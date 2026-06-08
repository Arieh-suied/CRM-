import { useState, useEffect, useCallback } from 'react';
import styles from './StripeDonations.module.css';

const fmt = (n, currency = 'USD') =>
  new Intl.NumberFormat('he-IL', { style: 'currency', currency, maximumFractionDigits: 2 }).format(n ?? 0);

function formatDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('he-IL', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function SortTh({ label, col, sort, onSort }) {
  const active = sort.col === col;
  return (
    <th
      onClick={() => onSort(col)}
      style={{ cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }}
    >
      {label}
      <span style={{ marginRight: 4, opacity: active ? 1 : 0.35, fontSize: 10 }}>
        {active ? (sort.dir === 'asc' ? '▲' : '▼') : '⇅'}
      </span>
    </th>
  );
}

export default function StripeDonations() {
  const [data, setData]           = useState([]);
  const [total, setTotal]         = useState(0);
  const [page, setPage]           = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch]       = useState('');
  const [query, setQuery]         = useState('');
  const [loading, setLoading]     = useState(false);
  const [syncing, setSyncing]     = useState(false);
  const [syncMsg, setSyncMsg]     = useState('');
  const [sort, setSort]           = useState({ col: 'paid_at', dir: 'desc' });

  const handleSort = useCallback((col) => {
    setSort(prev =>
      prev.col === col
        ? { col, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
        : { col, dir: 'asc' }
    );
  }, []);

  const load = useCallback(async (p = 1) => {
    setLoading(true);
    const params = { page: p, sort_by: sort.col, sort_dir: sort.dir };
    if (query) params.search = query;
    const qs = new URLSearchParams(params).toString();
    const res = await fetch(`/api/stripe-donations?${qs}`);
    const json = await res.json();
    setData(json.data ?? []);
    setTotal(json.total ?? 0);
    setTotalPages(json.totalPages ?? 1);
    setPage(p);
    setLoading(false);
  }, [query, sort]);

  useEffect(() => { load(1); }, [load]);

  const syncCustomers = async () => {
    setSyncing(true);
    setSyncMsg('');
    try {
      const res = await fetch('/api/stripe-donations', { method: 'POST' });
      const json = await res.json();
      if (!res.ok) { setSyncMsg(`שגיאה: ${json.error}`); return; }
      setSyncMsg(`עודכנו ${json.updated} מתוך ${json.total} לקוחות`);
      load(1);
    } catch {
      setSyncMsg('שגיאת רשת');
    } finally {
      setSyncing(false);
    }
  };

  const s = sort;

  return (
    <div className={styles.wrapper}>
      <div className={styles.toolbar}>
        <div className={styles.searchWrap}>
          <svg className={styles.searchIcon} viewBox="0 0 20 20" fill="none">
            <circle cx="9" cy="9" r="6" stroke="currentColor" strokeWidth="1.8"/>
            <path d="M14 14l3 3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
          </svg>
          <input
            className={styles.search}
            placeholder="חיפוש לפי שם, מייל, ID..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && setQuery(search)}
          />
          {search && (
            <button className={styles.clearBtn} onClick={() => { setSearch(''); setQuery(''); }}>✕</button>
          )}
        </div>
        <span className={styles.count}>סה"כ {total.toLocaleString('he-IL')} תרומות</span>
        <div className={styles.syncArea}>
          <button className={styles.syncBtn} onClick={syncCustomers} disabled={syncing}>
            {syncing ? 'מסנכרן...' : '⟳ סנכרן שמות'}
          </button>
          {syncMsg && <span className={syncMsg.startsWith('שגיאה') ? styles.syncError : styles.syncSuccess}>{syncMsg}</span>}
        </div>
      </div>

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <SortTh label="שם תורם"  col="resolved_name"      sort={s} onSort={handleSort} />
              <SortTh label="מייל"     col="donor_email"        sort={s} onSort={handleSort} />
              <SortTh label="סכום"     col="amount"             sort={s} onSort={handleSort} />
              <SortTh label="תאריך"    col="paid_at"            sort={s} onSort={handleSort} />
              <SortTh label="ID תורם"  col="stripe_customer_id" sort={s} onSort={handleSort} />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} className={styles.center}>טוען...</td></tr>
            ) : !data.length ? (
              <tr><td colSpan={5} className={styles.center}>אין נתונים</td></tr>
            ) : data.map((row) => (
              <tr key={row.id}>
                <td className={styles.name}>{row.resolved_name ?? row.donor_name ?? '—'}</td>
                <td className={styles.email}>{row.resolved_email ?? row.donor_email ?? '—'}</td>
                <td className={styles.amount}>{fmt(row.amount, row.currency)}</td>
                <td className={styles.date}>{formatDate(row.paid_at)}</td>
                <td className={styles.id}>{row.stripe_customer_id ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className={styles.pagination}>
        <span className={styles.paginationInfo}>עמוד {page} מתוך {totalPages}</span>
        <div className={styles.paginationBtns}>
          <button className={styles.pageBtn} disabled={page <= 1} onClick={() => load(page - 1)}>הקודם</button>
          <button className={styles.pageBtn} disabled={page >= totalPages} onClick={() => load(page + 1)}>הבא</button>
        </div>
      </div>
    </div>
  );
}
