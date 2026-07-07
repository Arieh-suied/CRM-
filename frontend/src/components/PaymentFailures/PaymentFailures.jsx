import { useState, useEffect, useCallback } from 'react';
import styles from './PaymentFailures.module.css';
import { fetchPaymentFailures, syncGmailFailures } from '../../services/api.js';
import SortTh from '../shared/SortTh.jsx';
import { exportXlsx, dateStamp } from '../../lib/exportXlsx.js';

const fmt = (n) => {
  if (n == null) return '—';
  return new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS', maximumFractionDigits: 0 }).format(n);
};

const fmtDate = (iso) => {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: '2-digit' });
};

const toExportRow = (row) => ({
  'תאריך':       fmtDate(row.created_at),
  'מוסד':        row.institution_name ?? '',
  'שם לקוח':     row.customer_name ?? '',
  'ת"ז':         row.customer_id_number ?? '',
  'סכום':        row.amount ?? '',
  'סיבת סירוב':  row.error_reason ?? '',
  'מספר הוראה':  row.order_number ?? '',
  '4 ספרות':     row.last4 ?? '',
  'טלפון':       row.donor_phone ?? '',
  'מייל':        row.donor_email ?? '',
});

export default function PaymentFailures() {
  const [data, setData]           = useState([]);
  const [total, setTotal]         = useState(0);
  const [page, setPage]           = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch]       = useState('');
  const [query, setQuery]         = useState('');
  const [instFilter, setInstFilter] = useState('');
  const [instOptions, setInstOptions] = useState([]);
  const [dateFrom, setDateFrom]   = useState('');
  const [dateTo, setDateTo]       = useState('');
  const [sort, setSort]           = useState({ col: 'created_at', dir: 'desc' });
  const [loading, setLoading]     = useState(false);
  const [syncing, setSyncing]     = useState(false);
  const [exporting, setExporting] = useState(false);
  const [syncResult, setSyncResult] = useState(null);

  const handleSort = useCallback((col) => {
    setSort((prev) => prev.col === col
      ? { col, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
      : { col, dir: 'desc' });
  }, []);

  const filterParams = useCallback(() => ({
    ...(query ? { search: query } : {}),
    ...(instFilter ? { institution: instFilter } : {}),
    ...(dateFrom ? { date_from: dateFrom } : {}),
    ...(dateTo ? { date_to: dateTo } : {}),
    sort_by: sort.col, sort_dir: sort.dir,
  }), [query, instFilter, dateFrom, dateTo, sort]);

  const load = useCallback(async (p = 1) => {
    setLoading(true);
    try {
      const res = await fetchPaymentFailures({ page: p, ...filterParams() });
      setData(res.data ?? []);
      setTotal(res.total ?? 0);
      setTotalPages(res.totalPages ?? 1);
      setPage(p);
    } finally {
      setLoading(false);
    }
  }, [filterParams]);

  useEffect(() => { load(1); }, [load]);

  useEffect(() => {
    fetchPaymentFailures({ action: 'institutions' })
      .then((res) => setInstOptions(res.data ?? []))
      .catch(() => {});
  }, []);

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

  const handleExport = async () => {
    setExporting(true);
    try {
      const res = await fetchPaymentFailures({ all: 1, ...filterParams() });
      const rows = (res.data ?? []).map(toExportRow);
      if (rows.length) await exportXlsx(rows, `payment-failures-${dateStamp()}.xlsx`, 'סירובים');
    } catch (err) {
      setSyncResult({ ok: false, message: err.message });
    } finally {
      setExporting(false);
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

        <select className={styles.select} value={instFilter} onChange={(e) => setInstFilter(e.target.value)}>
          <option value="">כל המוסדות</option>
          {instOptions.map((name) => <option key={name} value={name}>{name}</option>)}
        </select>

        <div className={styles.dateRange}>
          <input className={styles.dateInput} type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          <span className={styles.dateSep}>—</span>
          <input className={styles.dateInput} type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
          {(dateFrom || dateTo) && (
            <button className={styles.clearBtn} style={{ position: 'static' }} onClick={() => { setDateFrom(''); setDateTo(''); }}>✕</button>
          )}
        </div>

        <span className={styles.count}>סה"כ {total.toLocaleString('he-IL')} סירובים</span>

        <div className={styles.syncArea}>
          {syncResult && (
            <span className={syncResult.ok ? styles.syncSuccess : styles.syncError}>
              {syncResult.message}
            </span>
          )}
          <button className={styles.exportBtn} onClick={handleExport} disabled={exporting || !total}>
            {exporting ? 'מייצא...' : '⬇ ייצוא אקסל'}
          </button>
          <button className={styles.syncBtn} onClick={handleSync} disabled={syncing}>
            {syncing ? 'מסנכרן...' : 'סנכרן'}
          </button>
        </div>
      </div>

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <SortTh label="תאריך"       col="created_at"         sort={sort} onSort={handleSort} />
              <SortTh label="מוסד"        col="institution_name"   sort={sort} onSort={handleSort} />
              <SortTh label="שם לקוח"     col="customer_name"      sort={sort} onSort={handleSort} />
              <SortTh label='ת"ז'         col="customer_id_number" sort={sort} onSort={handleSort} />
              <SortTh label="סכום"        col="amount"             sort={sort} onSort={handleSort} />
              <SortTh label="סיבת סירוב"  col="error_reason"       sort={sort} onSort={handleSort} />
              <SortTh label="מספר הוראה"  col="order_number"       sort={sort} onSort={handleSort} />
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
