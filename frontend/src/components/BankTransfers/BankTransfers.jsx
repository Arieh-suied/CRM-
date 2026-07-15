import { useState, useEffect, useCallback } from 'react';
import styles from './BankTransfers.module.css';
import ReceiptModal from '../ReceiptModal/ReceiptModal.jsx';
import { authFetch } from '../../services/api.js';
import SortThBase from '../shared/SortTh.jsx';
import { exportXlsx, dateStamp } from '../../lib/exportXlsx.js';

const SortTh = (props) => <SortThBase className={styles.sortable} {...props} />;

const fmt = (n, currency = 'ILS') => {
  try {
    return new Intl.NumberFormat('he-IL', { style: 'currency', currency, maximumFractionDigits: 2 }).format(n ?? 0);
  } catch { return `${n ?? 0} ${currency}`; }
};

// raw dates arrive in mixed formats (YYYY-MM-DD / DD/MM/YYYY / D.M.YY) — normalize to DD/MM/YYYY
const fmtDate = (raw, iso) => {
  const s = String(raw ?? iso ?? '').trim();
  if (!s) return '';
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[3].padStart(2, '0')}/${m[2].padStart(2, '0')}/${m[1]}`;
  m = s.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})/);
  if (m) {
    const y = m[3].length === 2 ? `20${m[3]}` : m[3];
    return `${m[1].padStart(2, '0')}/${m[2].padStart(2, '0')}/${y}`;
  }
  return s;
};

export default function BankTransfers({ institutions }) {
  const [data, setData]           = useState([]);
  const [total, setTotal]         = useState(0);
  const [page, setPage]           = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch]       = useState('');
  const [query, setQuery]         = useState('');
  const [mosadFilter, setMosadFilter] = useState('');
  const [loading, setLoading]     = useState(false);
  const [receipt, setReceipt]     = useState(null);
  const [exporting, setExporting] = useState(false);
  const [sort, setSort]           = useState({ col: 'document_date', dir: 'desc' });

  const institutionMap = Object.fromEntries(
    (institutions ?? []).map((i) => [i.mosad_number, i.mosad_name])
  );

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
    if (query)       params.search       = query;
    if (mosadFilter) params.mosad_number = mosadFilter;
    const qs = new URLSearchParams(params).toString();
    const res = await authFetch(`/api/bank-transfers?${qs}`);
    const json = await res.json();
    setData(json.data ?? []);
    setTotal(json.total ?? 0);
    setTotalPages(json.totalPages ?? 1);
    setPage(p);
    setLoading(false);
  }, [query, mosadFilter, sort]);

  useEffect(() => { load(1); }, [load]);

  const exportAll = async () => {
    setExporting(true);
    try {
      const params = { all: 1, sort_by: sort.col, sort_dir: sort.dir };
      if (query)       params.search       = query;
      if (mosadFilter) params.mosad_number = mosadFilter;
      const res  = await authFetch(`/api/bank-transfers?${new URLSearchParams(params)}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Export failed');
      const rows = (json.data ?? []).map(r => ({
        'תאריך':   fmtDate(r.document_date_raw, r.document_date),
        'שם לקוח': r.customer_name ?? '',
        'ת"ז':     r.customer_id_number ?? '',
        'מייל':    r.customer_email ?? '',
        'סכום':    r.transfer_amount ?? '',
        'מטבע':    r.currency ?? '',
        'בנק':     r.bank_name ?? '',
        'סניף':    r.bank_branch ?? '',
        'חשבון':   r.bank_account ?? '',
        'מוסד':    institutionMap[r.mosad_number] ?? r.mosad_number ?? '',
        'מסמך':    r.document_number ?? '',
        'הערה':    r.document_note ?? '',
      }));
      if (rows.length) await exportXlsx(rows, `bank-transfers-${dateStamp()}.xlsx`, 'העברות');
    } catch (e) { alert(`שגיאה בייצוא: ${e.message}`); }
    finally { setExporting(false); }
  };

  const s = { col: sort.col, dir: sort.dir };

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
            placeholder="חיפוש לפי שם, מייל, תז, מסמך..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && setQuery(search)}
          />
          {search && (
            <button className={styles.clearBtn} onClick={() => { setSearch(''); setQuery(''); }}>✕</button>
          )}
        </div>

        <select
          className={styles.select}
          value={mosadFilter}
          onChange={(e) => setMosadFilter(e.target.value)}
        >
          <option value="">כל המוסדות</option>
          {(institutions ?? []).map((i) => (
            <option key={i.mosad_number} value={i.mosad_number}>{i.mosad_name}</option>
          ))}
        </select>

        <span className={styles.count}>סה"כ {total.toLocaleString('he-IL')} העברות</span>

        <button className={styles.exportBtn} onClick={exportAll} disabled={exporting || !total}>
          {exporting ? 'מייצא...' : '⬇ ייצוא אקסל'}
        </button>
      </div>

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <SortTh label="תאריך"   col="document_date"      sort={s} onSort={handleSort} />
              <SortTh label="שם לקוח" col="customer_name"      sort={s} onSort={handleSort} />
              <SortTh label='ת"ז'     col="customer_id_number" sort={s} onSort={handleSort} />
              <SortTh label="מייל"    col="customer_email"     sort={s} onSort={handleSort} />
              <SortTh label="סכום"    col="transfer_amount"    sort={s} onSort={handleSort} />
              <SortTh label="בנק"     col="bank_name"          sort={s} onSort={handleSort} />
              <SortTh label="סניף"    col="bank_branch"        sort={s} onSort={handleSort} />
              <SortTh label="חשבון"   col="bank_account"       sort={s} onSort={handleSort} />
              <SortTh label="מוסד"    col="mosad_number"       sort={s} onSort={handleSort} />
              <SortTh label="מסמך"    col="document_number"    sort={s} onSort={handleSort} />
              <th>הערה</th>
              <th>קבלה</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={12} className={styles.center}>טוען...</td></tr>
            ) : !data.length ? (
              <tr><td colSpan={12} className={styles.center}>אין נתונים</td></tr>
            ) : data.map((row) => (
              <tr key={row.id}>
                <td className={styles.date}>{fmtDate(row.document_date_raw, row.document_date) || '—'}</td>
                <td className={styles.name}>{row.customer_name ?? '—'}</td>
                <td className={styles.muted}>{row.customer_id_number ?? '—'}</td>
                <td className={styles.muted}>{row.customer_email ?? '—'}</td>
                <td className={styles.amount}>{fmt(row.transfer_amount, row.currency)}</td>
                <td className={styles.muted}>{row.bank_name ?? '—'}</td>
                <td className={styles.muted}>{row.bank_branch ?? '—'}</td>
                <td className={styles.muted}>{row.bank_account ?? '—'}</td>
                <td>{institutionMap[row.mosad_number] ?? row.mosad_number ?? '—'}</td>
                <td className={styles.muted}>{row.document_number ?? '—'}</td>
                <td className={styles.note}>{row.document_note ?? '—'}</td>
                <td>
                  {row.receipt_id
                    ? <button
                        className={styles.receiptLink}
                        onClick={() => setReceipt({
                          url: `https://files.ezcount.co.il/front/documents/get/${row.receipt_id}`,
                          title: `קבלה ${row.document_number ?? ''} — ${row.customer_name ?? ''}`,
                        })}
                      >
                        {row.document_number ?? 'קבלה'}
                      </button>
                    : <span className={styles.muted}>—</span>
                  }
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
