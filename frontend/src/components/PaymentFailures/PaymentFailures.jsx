import { useState, useEffect, useCallback } from 'react';
import styles from './PaymentFailures.module.css';
import { fetchPaymentFailures, syncGmailFailures } from '../../services/api.js';

const fmt = (n) => {
  if (n == null) return '—';
  return new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS', maximumFractionDigits: 0 }).format(n);
};

const fmtDate = (iso) => {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: '2-digit' });
};

export default function PaymentFailures() {
  const [data, setData]           = useState([]);
  const [total, setTotal]         = useState(0);
  const [page, setPage]           = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch]       = useState('');
  const [query, setQuery]         = useState('');
  const [loading, setLoading]     = useState(false);
  const [syncing, setSyncing]     = useState(false);
  const [syncResult, setSyncResult] = useState(null);

  const load = useCallback(async (p = 1) => {
    setLoading(true);
    try {
      const res = await fetchPaymentFailures({ page: p, ...(query ? { search: query } : {}) });
      setData(res.data ?? []);
      setTotal(res.total ?? 0);
      setTotalPages(res.totalPages ?? 1);
      setPage(p);
    } finally {
      setLoading(false);
    }
  }, [query]);

  useEffect(() => { load(1); }, [load]);

  const handleSync = async () => {
    setSyncing(true);
    setSyncResult(null);
    try {
      const res = await syncGmailFailures();
      setSyncResult({ ok: true, message: `סונכרנו ${res.synced} מיילים` });
      load(1);
    } catch (err) {
      setSyncResult({ ok: false, message: err.message });
    } finally {
      setSyncing(false);
    }
  };

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
            placeholder="חיפוש לפי שם, מוסד, מספר הוראה, מייל..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && setQuery(search)}
          />
          {search && (
            <button className={styles.clearBtn} onClick={() => { setSearch(''); setQuery(''); }}>✕</button>
          )}
        </div>

        <span className={styles.count}>סה"כ {total.toLocaleString('he-IL')} סירובים</span>

        <div className={styles.syncArea}>
          {syncResult && (
            <span className={syncResult.ok ? styles.syncSuccess : styles.syncError}>
              {syncResult.message}
            </span>
          )}
          <button className={styles.syncBtn} onClick={handleSync} disabled={syncing}>
            {syncing ? 'מסנכרן...' : 'סנכרן מג׳ימייל'}
          </button>
        </div>
      </div>

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>תאריך</th>
              <th>מוסד</th>
              <th>שם לקוח</th>
              <th>ת"ז</th>
              <th>סכום</th>
              <th>סיבת סירוב</th>
              <th>מספר הוראה</th>
              <th>4 ספרות</th>
              <th>טלפון</th>
              <th>מייל</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={10} className={styles.center}>טוען...</td></tr>
            ) : !data.length ? (
              <tr><td colSpan={10} className={styles.center}>אין סירובים</td></tr>
            ) : data.map((row) => (
              <tr key={row.id ?? row.gmail_message_id}>
                <td className={styles.date}>{fmtDate(row.created_at)}</td>
                <td>{row.institution_name ?? '—'}</td>
                <td className={styles.name}>{row.customer_name ?? '—'}</td>
                <td className={styles.muted}>{row.customer_id_number ?? '—'}</td>
                <td className={styles.amount}>{fmt(row.amount)}</td>
                <td className={styles.error}>{row.error_reason ?? '—'}</td>
                <td className={styles.muted}>{row.order_number ?? '—'}</td>
                <td className={styles.muted}>{row.last4 ?? '—'}</td>
                <td className={styles.muted}>{row.donor_phone ?? '—'}</td>
                <td className={styles.muted}>{row.donor_email ?? '—'}</td>
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
