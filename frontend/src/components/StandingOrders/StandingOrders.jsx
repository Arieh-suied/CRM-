import { useState, useEffect, useCallback } from 'react';
import styles from './StandingOrders.module.css';
import { fetchStandingOrders, exportCreditOrders, exportBankOrders, authFetch } from '../../services/api.js';
import { filterRowsByDateRange, exportAoaXlsx } from '../../lib/exportXlsx.js';
import CreditModal from './CreditModal.jsx';
import BankModal from './BankModal.jsx';
import SortThBase, { sortRows } from '../shared/SortTh.jsx';

const SortTh = (props) => <SortThBase className={styles.sortable} {...props} />;

const fmt = (n, currency = 'ILS') => {
  try { return new Intl.NumberFormat('he-IL', { style: 'currency', currency, maximumFractionDigits: 2 }).format(n ?? 0); }
  catch { return `${n ?? 0} ${currency}`; }
};

function parseExpiry(raw) {
  if (!raw || raw.length < 4) return raw ?? '—';
  return `${raw.slice(0, 2)}/${raw.slice(2, 4)}`;
}

function SummaryBar({ totalMonth, totalYear }) {
  return (
    <div className={styles.summaryBar}>
      <div className={styles.summaryCard}>
        <span className={styles.summaryLabel}>סה"כ חודשי (פעיל)</span>
        <span className={styles.summaryValue}>{fmt(totalMonth)}</span>
      </div>
      <div className={styles.summaryCard}>
        <span className={styles.summaryLabel}>צפי 12 חודשים</span>
        <span className={styles.summaryValue}>{fmt(totalYear)}</span>
      </div>
    </div>
  );
}

function CreditTable({ rows, mosadNumber, onRefresh }) {
  const [sort, setSort]           = useState({ col: null, dir: 'asc' });
  const [selectedId, setSelectedId] = useState(null);

  const handleSort = useCallback((col) => {
    setSort(prev => prev.col === col ? { col, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { col, dir: 'asc' });
  }, []);

  if (!rows?.length) return <p className={styles.empty}>אין הוראות קבע אשראי</p>;
  const sorted = sortRows(rows, sort.col, sort.dir);

  return (
    <>
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <SortTh label="#"              col="DT_RowId" sort={sort} onSort={handleSort} />
              <SortTh label="שם מלא"         col="2"        sort={sort} onSort={handleSort} />
              <SortTh label="סכום"           col="4"        sort={sort} onSort={handleSort} />
              <SortTh label="קטגוריה"        col="5"        sort={sort} onSort={handleSort} />
              <SortTh label="חיוב הבא"       col="9"        sort={sort} onSort={handleSort} />
              <SortTh label="יתרת חיובים"    col="7"        sort={sort} onSort={handleSort} />
              <SortTh label="חיובים בוצעו"   col="8"        sort={sort} onSort={handleSort} />
              <SortTh label="4 ספרות"        col="11"       sort={sort} onSort={handleSort} />
              <SortTh label="תוקף"           col="12"       sort={sort} onSort={handleSort} />
              <SortTh label="סטטוס"          col="10"       sort={sort} onSort={handleSort} />
            </tr>
          </thead>
          <tbody>
            {sorted.map(row => (
              <tr key={row.DT_RowId} className={styles.clickableRow} onClick={() => setSelectedId(row.DT_RowId)}>
                <td className={styles.muted}>{row.DT_RowId}</td>
                <td className={styles.name}>{row['2'] ?? '—'}</td>
                <td className={styles.amount}>{row['4'] ? fmt(parseFloat(row['4'])) : '—'}</td>
                <td className={styles.muted}>{row['5'] ?? '—'}</td>
                <td className={styles.date}>{row['9'] ?? '—'}</td>
                <td className={styles.muted}>{row['7'] ?? '—'}</td>
                <td className={styles.muted}>{row['8'] ?? '—'}</td>
                <td className={styles.muted}>{row['11'] ? `****${row['11']}` : '—'}</td>
                <td className={styles.muted}>{parseExpiry(row['12'])}</td>
                <td className={row['10'] ? styles.error : styles.active}>{row['10'] || 'פעיל'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {selectedId && (
        <CreditModal
          kevaId={selectedId}
          mosadNumber={mosadNumber}
          onClose={() => setSelectedId(null)}
          onRefresh={onRefresh}
        />
      )}
    </>
  );
}

function BankTable({ rows, mosadNumber, onRefresh }) {
  const [sort, setSort]           = useState({ col: null, dir: 'asc' });
  const [selectedId, setSelectedId] = useState(null);

  const handleSort = useCallback((col) => {
    setSort(prev => prev.col === col ? { col, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { col, dir: 'asc' });
  }, []);

  if (!rows?.length) return <p className={styles.empty}>אין הוראות קבע בנקאיות</p>;
  const sorted = sortRows(rows, sort.col, sort.dir);

  return (
    <>
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <SortTh label="#"             col="DT_RowId" sort={sort} onSort={handleSort} />
              <SortTh label="שם לקוח"       col="2"        sort={sort} onSort={handleSort} />
              <SortTh label="פרטי חשבון"    col="3"        sort={sort} onSort={handleSort} />
              <SortTh label="סכום חודשי"    col="6"        sort={sort} onSort={handleSort} />
              <SortTh label="חיוב הבא"      col="4"        sort={sort} onSort={handleSort} />
              <SortTh label="יתרת חיובים"   col="5"        sort={sort} onSort={handleSort} />
              <SortTh label="קטגוריה"       col="7"        sort={sort} onSort={handleSort} />
              <SortTh label="הערה"          col="8"        sort={sort} onSort={handleSort} />
            </tr>
          </thead>
          <tbody>
            {sorted.map(row => (
              <tr key={row.DT_RowId} className={styles.clickableRow} onClick={() => setSelectedId(row.DT_RowId)}>
                <td className={styles.muted}>{row.DT_RowId}</td>
                <td className={styles.name}>{row['2'] ?? '—'}</td>
                <td className={styles.muted}>{row['3'] ?? '—'}</td>
                <td className={styles.amount}>{row['6'] ? fmt(parseFloat(row['6'])) : '—'}</td>
                <td className={styles.date}>{row['4'] ?? '—'}</td>
                <td className={styles.muted}>{row['5'] ?? '—'}</td>
                <td className={styles.muted}>{row['7'] ?? '—'}</td>
                <td className={styles.note}>{row['8'] ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {selectedId && (
        <BankModal
          masavId={selectedId}
          mosadNumber={mosadNumber}
          onClose={() => setSelectedId(null)}
          onRefresh={onRefresh}
        />
      )}
    </>
  );
}

function monthRange(offset = 0) {
  const now = new Date();
  const first = new Date(now.getFullYear(), now.getMonth() + offset, 1);
  const last  = offset === 0 ? now : new Date(now.getFullYear(), now.getMonth() + offset + 1, 0);
  const str = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return { from: str(first), to: str(last) };
}

function ExportMenu({ mosadNumber, type }) {
  const [open, setOpen]       = useState(false);
  const [exporting, setExp]   = useState(false);
  const [dateFrom, setFrom]   = useState('');
  const [dateTo, setTo]       = useState('');

  const hasRange = !!(dateFrom || dateTo);

  // Nedarim+ can't filter its credit CSVs by date, so when a range is chosen
  // we download the full CSV, filter the rows locally, and save as Excel.
  const exportCreditFiltered = async (exportType) => {
    const res = await authFetch(`/api/standing-orders?mosad_number=${encodeURIComponent(mosadNumber)}&export=${exportType}`);
    if (!res.ok) throw new Error('Export failed');
    const text = await res.text();
    const XLSX = await import('xlsx');
    const wb = XLSX.read(text, { type: 'string', raw: true });
    const aoa = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1 });
    const rows = filterRowsByDateRange(aoa, dateFrom, dateTo);
    if (!rows) throw new Error('לא זוהתה עמודת תאריך בקובץ — ייצא ללא סינון');
    if (rows.length <= 1) throw new Error('אין שורות בטווח התאריכים שנבחר');
    await exportAoaXlsx(rows, `credit-${exportType}-${mosadNumber}-${dateFrom || 'start'}-${dateTo || 'today'}.xlsx`);
  };

  const doExport = async (exportType) => {
    setExp(true);
    try {
      if (type === 'credit') {
        if (hasRange) await exportCreditFiltered(exportType);
        else await exportCreditOrders(mosadNumber, exportType);
      }
      else await exportBankOrders(mosadNumber, exportType, dateFrom, dateTo);
    } catch (e) { alert(`שגיאה: ${e.message}`); }
    setExp(false); setOpen(false);
  };

  return (
    <div style={{ position: 'relative' }}>
      <button className={styles.typeTab} onClick={() => setOpen(p => !p)} disabled={exporting}>
        {exporting ? 'מייצא...' : 'ייצוא ▾'}
      </button>
      {open && (
        <div className={styles.exportMenu}>
          {type === 'credit' ? (
            <>
              <div className={styles.exportDateRow}>
                <span>סינון:</span>
                <input type="date" value={dateFrom} onChange={e => setFrom(e.target.value)} className={styles.dateInput} />
                <span>עד</span>
                <input type="date" value={dateTo} onChange={e => setTo(e.target.value)} className={styles.dateInput} />
              </div>
              <div className={styles.exportPresets}>
                <button onClick={() => { const r = monthRange(0);  setFrom(r.from); setTo(r.to); }}>החודש</button>
                <button onClick={() => { const r = monthRange(-1); setFrom(r.from); setTo(r.to); }}>חודש שעבר</button>
                {hasRange && <button onClick={() => { setFrom(''); setTo(''); }}>✕ נקה</button>}
              </div>
              <button onClick={() => doExport('orders')}>הוראות קבע {hasRange ? '(Excel מסונן)' : '(CSV)'}</button>
              <button onClick={() => doExport('business')}>עסקים {hasRange ? '(Excel מסונן)' : '(CSV)'}</button>
              <button onClick={() => doExport('refusals')}>סירובים {hasRange ? '(Excel מסונן)' : '(CSV)'}</button>
            </>
          ) : (
            <>
              <button onClick={() => doExport('orders')}>הוראות קבע (CSV)</button>
              <div className={styles.exportDateRow}>
                <span>היסטוריה:</span>
                <input type="date" value={dateFrom} onChange={e => setFrom(e.target.value)} className={styles.dateInput} />
                <span>עד</span>
                <input type="date" value={dateTo} onChange={e => setTo(e.target.value)} className={styles.dateInput} />
                <button onClick={() => doExport('history')} disabled={!dateFrom || !dateTo}>ייצא</button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// Rows arrive DataTables-style (numeric string keys), so the free-text search
// just scans every cell value of the row.
function filterRows(rows, q) {
  if (!q) return rows;
  const needle = q.toLowerCase();
  return rows.filter((row) =>
    Object.values(row).some((v) => String(v ?? '').toLowerCase().includes(needle))
  );
}

export default function StandingOrders({ institutions }) {
  const [mosadFilter, setMosadFilter] = useState('');
  const [activeType, setActiveType]   = useState('credit');
  const [creditData, setCreditData]   = useState(null);
  const [bankData, setBankData]       = useState(null);
  const [loading, setLoading]         = useState(false);
  const [errorMsg, setErrorMsg]       = useState('');
  const [search, setSearch]           = useState('');

  const eligibleInstitutions = (institutions ?? []).filter(i => i.has_api_password);

  const load = useCallback(() => {
    if (!mosadFilter) { setCreditData(null); setBankData(null); return; }
    setLoading(true); setErrorMsg('');
    fetchStandingOrders(mosadFilter)
      .then(res => { setCreditData(res.credit ?? null); setBankData(res.bank ?? null); })
      .catch(e => setErrorMsg(e.message))
      .finally(() => setLoading(false));
  }, [mosadFilter]);

  useEffect(load, [load]);

  const creditRows = filterRows(creditData?.data ?? [], search.trim());
  const bankRows   = filterRows(bankData?.data ?? [], search.trim());

  return (
    <div className={styles.wrapper}>
      <div className={styles.toolbar}>
        <select className={styles.select} value={mosadFilter} onChange={e => setMosadFilter(e.target.value)}>
          <option value="">בחר מוסד</option>
          {eligibleInstitutions.map(i => (
            <option key={i.mosad_number} value={i.mosad_number}>{i.mosad_name}</option>
          ))}
        </select>

        {mosadFilter && !loading && (
          <>
            <div className={styles.searchWrap}>
              <svg className={styles.searchIcon} viewBox="0 0 20 20" fill="none">
                <circle cx="9" cy="9" r="6" stroke="currentColor" strokeWidth="1.8"/>
                <path d="M14 14l3 3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
              </svg>
              <input
                className={styles.search}
                placeholder="חיפוש בהוראות..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              {search && <button className={styles.clearBtn} onClick={() => setSearch('')}>✕</button>}
            </div>
            <div className={styles.typeTabs}>
              <button className={`${styles.typeTab} ${activeType === 'credit' ? styles.typeTabActive : ''}`} onClick={() => setActiveType('credit')}>
                אשראי ({creditRows.length})
              </button>
              <button className={`${styles.typeTab} ${activeType === 'bank' ? styles.typeTabActive : ''}`} onClick={() => setActiveType('bank')}>
                בנקאי ({bankRows.length})
              </button>
            </div>
            <ExportMenu mosadNumber={mosadFilter} type={activeType} />
          </>
        )}
      </div>

      {!mosadFilter && <p className={styles.placeholder}>בחר מוסד כדי לטעון הוראות קבע</p>}
      {loading && <p className={styles.placeholder}>טוען...</p>}
      {errorMsg && <p className={styles.errorMsg}>{errorMsg}</p>}

      {!loading && mosadFilter && activeType === 'credit' && (
        <>
          {creditData && !creditData.error && (
            <SummaryBar totalMonth={creditData.TotalMonth} totalYear={creditData.TotalYear} />
          )}
          {creditData?.error
            ? <p className={styles.errorMsg}>{creditData.error}</p>
            : <CreditTable rows={creditRows} mosadNumber={mosadFilter} onRefresh={load} />
          }
        </>
      )}

      {!loading && mosadFilter && activeType === 'bank' && (
        <>
          {bankData?.error
            ? <p className={styles.errorMsg}>{bankData.error}</p>
            : <BankTable rows={bankRows} mosadNumber={mosadFilter} onRefresh={load} />
          }
        </>
      )}
    </div>
  );
}
