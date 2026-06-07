import { useState, useEffect, useCallback } from 'react';
import styles from './BankTransfers.module.css';
import ReceiptModal from '../ReceiptModal/ReceiptModal.jsx';

const fmt = (n, currency = 'ILS') => {
  try {
    return new Intl.NumberFormat('he-IL', { style: 'currency', currency, maximumFractionDigits: 2 }).format(n ?? 0);
  } catch { return `${n ?? 0} ${currency}`; }
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
  const [receipt, setReceipt]     = useState(null); // { url, title }

  const institutionMap = Object.fromEntries(
    (institutions ?? []).map((i) => [i.mosad_number, i.mosad_name])
  );

  const load = useCallback(async (p = 1) => {
    setLoading(true);
    const params = { page: p };
    if (query)       params.search       = query;
    if (mosadFilter) params.mosad_number = mosadFilter;
    const qs = new URLSearchParams(params).toString();
    const res = await fetch(`/api/bank-transfers?${qs}`);
    const json = await res.json();
    setData(json.data ?? []);
    setTotal(json.total ?? 0);
    setTotalPages(json.totalPages ?? 1);
    setPage(p);
    setLoading(false);
  }, [query, mosadFilter]);

  useEffect(() => { load(1); }, [load]);

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
      </div>

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>תאריך</th>
              <th>שם לקוח</th>
              <th>ת"ז</th>
              <th>מייל</th>
              <th>סכום</th>
              <th>בנק</th>
              <th>סניף</th>
              <th>חשבון</th>
              <th>מוסד</th>
              <th>מסמך</th>
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
                <td className={styles.date}>{row.document_date_raw ?? row.document_date ?? '—'}</td>
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
