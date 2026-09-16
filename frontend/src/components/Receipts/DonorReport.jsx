import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import styles from './Receipts.module.css';
import { supabase } from '../../lib/supabase.js';
import { fetchDonorReport, downloadDonorReportPdf } from '../../services/api.js';
import { buildReceiptProxyUrl } from '../../lib/receiptProxy.js';
import { debounce } from '../../lib/debounce.js';

const CURRENT_YEAR = new Date().getFullYear();
const YEARS = Array.from({ length: 6 }, (_, i) => CURRENT_YEAR - i);

function ReceiptLink({ receipt }) {
  const [href, setHref] = useState(null);
  useEffect(() => {
    let cancelled = false;
    if (receipt.pdf_url) {
      buildReceiptProxyUrl(receipt.pdf_url, `קבלה-${receipt.receipt_number || ''}`)
        .then((u) => { if (!cancelled) setHref(u); });
    }
    return () => { cancelled = true; };
  }, [receipt.pdf_url, receipt.receipt_number]);
  if (!href) return null;
  return <a className={styles.receiptSuccessLink} href={href} target="_blank" rel="noreferrer">הצג קבלה</a>;
}

export default function DonorReport() {
  const [name, setName] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [year, setYear] = useState(String(CURRENT_YEAR));
  const [suggestions, setSuggestions] = useState([]);
  const [showSugg, setShowSugg] = useState(false);
  const suggRef = useRef(null);

  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const handler = (e) => {
      if (suggRef.current && !suggRef.current.contains(e.target)) setShowSugg(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const runCustomerSearch = useCallback(async (q) => {
    if (q.length < 2) { setSuggestions([]); setShowSugg(false); return; }
    const { data } = await supabase.from('customers')
      .select('*')
      .or(`name.ilike.%${q}%,id_number.ilike.%${q}%`)
      .limit(6);
    if (data?.length) { setSuggestions(data); setShowSugg(true); }
    else { setSuggestions([]); setShowSugg(false); }
  }, []);
  const searchCustomers = useMemo(() => debounce(runCustomerSearch, 300), [runCustomerSearch]);

  const selectCustomer = (c) => {
    setName(c.name);
    setSelectedCustomer(c);
    setShowSugg(false);
    setResult(null);
  };

  const handleNameChange = (v) => {
    setName(v);
    setSelectedCustomer(null);
    setResult(null);
    searchCustomers(v);
  };

  const runReport = async () => {
    if (!name.trim()) return;
    setLoading(true);
    setError('');
    setResult(null);
    try {
      const data = await fetchDonorReport({
        customerName: name.trim(),
        customerIdNumber: selectedCustomer?.id_number || '',
        year,
      });
      setResult(data);
    } catch (err) {
      setError(err.message || 'שגיאה בטעינת הדוח');
    } finally {
      setLoading(false);
    }
  };

  const downloadMerged = async () => {
    setDownloading(true);
    setError('');
    try {
      await downloadDonorReportPdf({
        customerName: name.trim(),
        customerIdNumber: selectedCustomer?.id_number || '',
        year,
      });
    } catch (err) {
      setError(err.message || 'שגיאה בהורדת הקובץ המאוחד');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className={styles.card}>
      <div className={styles.sectionTitle}>דוח קבלות שנתי לתורם</div>

      <div className={styles.formGrid}>
        <div className={styles.fieldGroup} ref={suggRef}>
          <label className={styles.fieldLabel}>שם תורם</label>
          <input
            className={styles.fieldInput}
            value={name}
            onChange={(e) => handleNameChange(e.target.value)}
            placeholder="הקלד שם לחיפוש..."
          />
          {showSugg && suggestions.length > 0 && (
            <div className={styles.autocompleteDropdown}>
              {suggestions.map((c) => (
                <div key={c.id} className={styles.autocompleteItem} onClick={() => selectCustomer(c)}>
                  <div className={styles.autocompleteItemName}>{c.name}</div>
                  <div className={styles.autocompleteItemSub}>{c.id_number || ''}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className={styles.fieldGroup}>
          <label className={styles.fieldLabel}>שנה</label>
          <select className={styles.fieldSelect} value={year} onChange={(e) => setYear(e.target.value)}>
            {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
      </div>

      <div className={styles.entryActions} style={{ marginTop: 14 }}>
        <button className={`${styles.btn} ${styles.btnPrimary}`} disabled={!name.trim() || loading} onClick={runReport}>
          {loading ? 'טוען...' : 'הצג דוח'}
        </button>
        {result?.receipts?.length > 0 && (
          <button className={`${styles.btn} ${styles.btnGhost}`} disabled={downloading} onClick={downloadMerged}>
            {downloading ? 'מכין PDF...' : 'הורד PDF מאוחד'}
          </button>
        )}
      </div>

      {error && <div className={styles.errorMsg} style={{ marginTop: 14 }}>{error}</div>}

      {result && (
        result.receipts.length === 0 ? (
          <div className={styles.empty}>לא נמצאו קבלות עבור {name} בשנת {year}</div>
        ) : (
          <div className={styles.tableWrap} style={{ marginTop: 16 }}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>תאריך</th>
                  <th>מוסד</th>
                  <th>סוג קבלה</th>
                  <th>סכום</th>
                  <th>קישור</th>
                </tr>
              </thead>
              <tbody>
                {result.receipts.map((r, i) => (
                  <tr key={r.receipt_number || i}>
                    <td>{r.issue_date}</td>
                    <td>{r.institution_name}</td>
                    <td>{r.receipt_type}</td>
                    <td>{Number(r.amount).toLocaleString('he-IL')} ₪</td>
                    <td><ReceiptLink receipt={r} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className={styles.paymentTotal} style={{ marginTop: 10 }}>
              <span>סה"כ {result.count} קבלות</span>
              <span className={styles.paymentTotalAmount}>{result.total.toLocaleString('he-IL')} ₪</span>
            </div>
          </div>
        )
      )}
    </div>
  );
}
