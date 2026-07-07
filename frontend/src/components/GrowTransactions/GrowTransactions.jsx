import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabase.js';
import ReceiptModal from '../ReceiptModal/ReceiptModal.jsx';
import styles from './GrowTransactions.module.css';
import SortThBase from '../shared/SortTh.jsx';
import { exportXlsx, dateStamp } from '../../lib/exportXlsx.js';

const SortTh = (props) => <SortThBase className={styles.sortable} {...props} />;

const PAGE_SIZE = 50;

const fmt = (n) => {
  try {
    return new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS', maximumFractionDigits: 2 }).format(n ?? 0);
  } catch { return `${n ?? 0} ₪`; }
};

const STATUS_LABEL = { received: 'התקבל', success: 'הופקה קבלה', failed: 'נכשל' };

function StatusBadge({ status }) {
  const cls = status === 'success' ? styles.badgeSuccess : status === 'failed' ? styles.badgeFailed : styles.badgeReceived;
  return <span className={`${styles.badge} ${cls}`}>{STATUS_LABEL[status] ?? status}</span>;
}

export default function GrowTransactions() {
  const [data, setData]       = useState([]);
  const [total, setTotal]     = useState(0);
  const [page, setPage]       = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch]   = useState('');
  const [query, setQuery]     = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [sort, setSort]       = useState({ col: 'created_at', dir: 'desc' });
  const [receipt, setReceipt] = useState(null);

  const handleSort = useCallback((col) => {
    setSort((prev) => prev.col === col
      ? { col, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
      : { col, dir: 'asc' });
  }, []);

  const load = useCallback(async (p = 1) => {
    setLoading(true);
    const from = (p - 1) * PAGE_SIZE;
    let q = supabase
      .from('grow_transactions')
      .select('*', { count: 'exact' })
      .order(sort.col, { ascending: sort.dir === 'asc', nullsLast: true })
      .range(from, from + PAGE_SIZE - 1);

    if (statusFilter) q = q.eq('status', statusFilter);
    if (query) q = q.or(`full_name.ilike.%${query}%,payer_email.ilike.%${query}%,transaction_code.ilike.%${query}%,asmachta.ilike.%${query}%`);

    const { data: rows, count, error } = await q;
    if (!error) {
      setData(rows ?? []);
      setTotal(count ?? 0);
      setTotalPages(Math.max(1, Math.ceil((count ?? 0) / PAGE_SIZE)));
    }
    setPage(p);
    setLoading(false);
  }, [query, statusFilter, sort]);

  useEffect(() => { load(1); }, [load]);

  // Export pulls every matching row in 1000-row chunks (Supabase caps each
  // request), with the same filters and sort as the table.
  const exportAll = async () => {
    setExporting(true);
    try {
      const CHUNK = 1000;
      const all = [];
      for (let from = 0; from < 20000; from += CHUNK) {
        let q = supabase
          .from('grow_transactions')
          .select('*')
          .order(sort.col, { ascending: sort.dir === 'asc', nullsLast: true })
          .range(from, from + CHUNK - 1);
        if (statusFilter) q = q.eq('status', statusFilter);
        if (query) q = q.or(`full_name.ilike.%${query}%,payer_email.ilike.%${query}%,transaction_code.ilike.%${query}%,asmachta.ilike.%${query}%`);
        const { data: rows, error } = await q;
        if (error) throw new Error(error.message);
        all.push(...(rows ?? []));
        if (!rows || rows.length < CHUNK) break;
      }
      const out = all.map((r) => ({
        'תאריך':     r.payment_date ?? new Date(r.created_at).toLocaleDateString('he-IL'),
        'תורם':      r.full_name ?? '',
        'מייל':      r.payer_email ?? '',
        'סכום':      r.payment_sum ?? '',
        'אסמכתא':    r.asmachta ?? '',
        'סטטוס':     STATUS_LABEL[r.status] ?? r.status ?? '',
        'מס\' קבלה': r.ezcount_doc_number ?? '',
      }));
      if (out.length) await exportXlsx(out, `grow-transactions-${dateStamp()}.xlsx`, 'עסקאות Grow');
    } catch (e) { alert(`שגיאה בייצוא: ${e.message}`); }
    finally { setExporting(false); }
  };

  return (
    <>
    <div className={styles.wrapper}>
      <div className={styles.toolbar}>
        <div className={styles.searchWrap}>
          <svg className={styles.searchIcon} viewBox="0 0 20 20" fill="none">
            <circle cx="9" cy="9" r="6" stroke="currentColor" strokeWidth="1.8"/>
            <path d="M14 14l3 3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
          </svg>
          <input
            className={styles.search}
            placeholder="חיפוש לפי שם, מייל, אסמכתא..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && setQuery(search)}
          />
          {search && <button className={styles.clearBtn} onClick={() => { setSearch(''); setQuery(''); }}>✕</button>}
        </div>

        <select className={styles.select} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="">כל הסטטוסים</option>
          <option value="success">הופקה קבלה</option>
          <option value="failed">נכשל</option>
          <option value="received">התקבל</option>
        </select>

        <span className={styles.count}>סה"כ {total.toLocaleString('he-IL')} עסקאות</span>

        <button className={styles.exportBtn} onClick={exportAll} disabled={exporting || !total}>
          {exporting ? 'מייצא...' : '⬇ ייצוא אקסל'}
        </button>
      </div>

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <SortTh label="תאריך"  col="created_at"       sort={sort} onSort={handleSort} />
              <SortTh label="תורם"   col="full_name"         sort={sort} onSort={handleSort} />
              <SortTh label="מייל"   col="payer_email"       sort={sort} onSort={handleSort} />
              <SortTh label="סכום"   col="payment_sum"       sort={sort} onSort={handleSort} />
              <SortTh label="אסמכתא" col="asmachta"          sort={sort} onSort={handleSort} />
              <SortTh label="סטטוס"  col="status"            sort={sort} onSort={handleSort} />
              <th>קבלה</th>
              <th>שגיאה</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={8} className={styles.center}>טוען...</td></tr>
            ) : !data.length ? (
              <tr><td colSpan={8} className={styles.center}>אין נתונים</td></tr>
            ) : data.map((row) => (
              <tr key={row.id}>
                <td className={styles.date}>{row.payment_date ?? new Date(row.created_at).toLocaleDateString('he-IL')}</td>
                <td className={styles.name}>{row.full_name ?? '—'}</td>
                <td className={styles.muted}>{row.payer_email ?? '—'}</td>
                <td className={styles.amount}>{fmt(row.payment_sum)}</td>
                <td className={styles.muted}>{row.asmachta ?? '—'}</td>
                <td><StatusBadge status={row.status} /></td>
                <td>
                  {row.ezcount_response?.pdf_link
                    ? <button
                        className={styles.receiptLink}
                        onClick={() => setReceipt({
                          url: row.ezcount_response.pdf_link,
                          title: `קבלה ${row.ezcount_doc_number ?? ''} — ${row.full_name ?? ''}`,
                        })}
                      >
                        קבלה
                      </button>
                    : <span className={styles.muted}>—</span>
                  }
                </td>
                <td className={styles.note}>
                  {row.status === 'failed'
                    ? (row.ezcount_response?.error || row.ezcount_response?.errMsg || 'שגיאה לא ידועה')
                    : '—'}
                </td>
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

    {receipt && (
      <ReceiptModal
        url={receipt.url}
        title={receipt.title}
        onClose={() => setReceipt(null)}
      />
    )}
    </>
  );
}
