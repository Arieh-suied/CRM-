import { useState, useEffect, useCallback, useMemo } from 'react';
import styles from './BankRefusals.module.css';
import { fetchBankRefusals, syncBankRefusals, resolveBankRefusal } from '../../services/api.js';

// אור אפרים + חכמי ירושלים — תרומות והשכ"ל, ללא הודעת סירוב אוטומטית (בשונה מאשראי)
const BANK_REFUSAL_MOSAD_NUMBERS = ['7001725', '7003860', '7001916', '7003862'];

const fmt = (n) => {
  try { return new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS', maximumFractionDigits: 0 }).format(n ?? 0); }
  catch { return `${n ?? 0}`; }
};

const fmtDate = (iso) => {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: '2-digit' });
};

function defaultPeriod() {
  const d = new Date();
  d.setMonth(d.getMonth() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function StatusBadge({ row }) {
  if (row.status === 'cleared')  return <span className={styles.badgeCleared}>✓ נפרע</span>;
  if (row.status === 'bounced')  return <span className={styles.badgeBounced}>✗ חזר</span>;
  if (row.auto_status === 'cleared') return <span className={styles.badgeSuggestCleared}>נראה שנפרע</span>;
  if (row.auto_status === 'bounced') return <span className={styles.badgeSuggestBounced}>נראה שחזר</span>;
  return <span className={styles.badgeUnknown}>❓ לא זוהה</span>;
}

function SummaryBar({ rows }) {
  const total = rows.length;
  const cleared = rows.filter((r) => r.status === 'cleared');
  const bounced = rows.filter((r) => r.status === 'bounced');
  const pending = rows.filter((r) => r.status === 'pending');
  const sum = (list) => list.reduce((s, r) => s + Number(r.amount || 0), 0);

  return (
    <div className={styles.summaryBar}>
      <div className={styles.summaryCard}>
        <span className={styles.summaryLabel}>סה"כ הוראות</span>
        <span className={styles.summaryValue}>{total} · {fmt(sum(rows))}</span>
      </div>
      <div className={styles.summaryCard}>
        <span className={styles.summaryLabel}>נפרעו</span>
        <span className={styles.summaryValueGood}>{cleared.length} · {fmt(sum(cleared))}</span>
      </div>
      <div className={styles.summaryCard}>
        <span className={styles.summaryLabel}>חזרו</span>
        <span className={styles.summaryValueBad}>{bounced.length} · {fmt(sum(bounced))}</span>
      </div>
      <div className={styles.summaryCard}>
        <span className={styles.summaryLabel}>טרם הוכרע</span>
        <span className={styles.summaryValue}>{pending.length}</span>
      </div>
    </div>
  );
}

function exportCsv(rows, mosadNumber, period) {
  const header = ['תאריך', 'שם', 'ת"ז', 'סכום', 'מספר הוראה', 'סטטוס'];
  const lines = [header.join(',')];
  rows.forEach((r) => {
    lines.push([fmtDate(r.charge_date), r.client_name ?? '', r.client_id_number ?? '', r.amount ?? '', r.masav_id ?? '', r.status].join(','));
  });
  const blob = new Blob(['﻿' + lines.join('\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `bank-refusals-${mosadNumber}-${period}.csv`; a.click();
  URL.revokeObjectURL(url);
}

export default function BankRefusals({ institutions }) {
  const [mosadFilter, setMosadFilter] = useState('');
  const [period, setPeriod]           = useState(defaultPeriod());
  const [rows, setRows]               = useState([]);
  const [loading, setLoading]         = useState(false);
  const [syncing, setSyncing]         = useState(false);
  const [resolvingId, setResolvingId] = useState(null);
  const [errorMsg, setErrorMsg]       = useState('');

  const eligibleInstitutions = useMemo(
    () => (institutions ?? []).filter((i) => BANK_REFUSAL_MOSAD_NUMBERS.includes(i.mosad_number)),
    [institutions]
  );

  const load = useCallback(() => {
    if (!mosadFilter || !period) { setRows([]); return; }
    setLoading(true); setErrorMsg('');
    fetchBankRefusals(mosadFilter, period)
      .then((res) => setRows(res.data ?? []))
      .catch((e) => setErrorMsg(e.message))
      .finally(() => setLoading(false));
  }, [mosadFilter, period]);

  useEffect(load, [load]);

  const handleSync = async () => {
    if (!mosadFilter || !period) return;
    setSyncing(true); setErrorMsg('');
    try {
      await syncBankRefusals(mosadFilter, period);
      load();
    } catch (e) { setErrorMsg(e.message); }
    setSyncing(false);
  };

  const handleResolve = async (row, resolution) => {
    const comment = resolution === 'bounced' ? window.prompt('סיבת החזרה (אופציונלי):', 'הוראת קבע חזרה') ?? '' : undefined;
    setResolvingId(row.id); setErrorMsg('');
    try {
      await resolveBankRefusal(row.id, resolution, comment);
      load();
    } catch (e) { setErrorMsg(e.message); }
    setResolvingId(null);
  };

  const handleMarkManually = async (row, resolution) => {
    setResolvingId(row.id); setErrorMsg('');
    try {
      await resolveBankRefusal(row.id, resolution);
      load();
    } catch (e) { setErrorMsg(e.message); }
    setResolvingId(null);
  };

  return (
    <div className={styles.wrapper}>
      <div className={styles.toolbar}>
        <select className={styles.select} value={mosadFilter} onChange={(e) => setMosadFilter(e.target.value)}>
          <option value="">בחר מוסד</option>
          {eligibleInstitutions.map((i) => (
            <option key={i.mosad_number} value={i.mosad_number}>{i.mosad_name}</option>
          ))}
        </select>
        <input className={styles.monthInput} type="month" value={period} onChange={(e) => setPeriod(e.target.value)} />
        {mosadFilter && (
          <>
            <button className={styles.syncBtn} onClick={handleSync} disabled={syncing}>
              {syncing ? 'מסנכרן...' : 'סנכרן מנדרים+'}
            </button>
            <button className={styles.exportBtn} onClick={() => exportCsv(rows, mosadFilter, period)} disabled={!rows.length}>
              ייצוא CSV
            </button>
          </>
        )}
      </div>

      {!mosadFilter && <p className={styles.placeholder}>בחר מוסד וחודש כדי לטעון את דוח ההוראות הבנקאיות</p>}
      {errorMsg && <p className={styles.errorMsg}>{errorMsg}</p>}

      {mosadFilter && !loading && !errorMsg && rows.length > 0 && <SummaryBar rows={rows} />}

      {loading && <p className={styles.placeholder}>טוען...</p>}

      {mosadFilter && !loading && !rows.length && !errorMsg && (
        <p className={styles.empty}>אין נתונים לחודש זה — נסה לסנכרן מנדרים+</p>
      )}

      {mosadFilter && !loading && rows.length > 0 && (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>תאריך גביה</th>
                <th>שם לקוח</th>
                <th>סכום</th>
                <th>מספר הוראה</th>
                <th>סטטוס</th>
                <th>פעולה</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td className={styles.date}>{fmtDate(row.charge_date)}</td>
                  <td className={styles.name}>{row.client_name ?? '—'}</td>
                  <td className={styles.amount}>{fmt(row.amount)}</td>
                  <td className={styles.muted}>{row.masav_id}</td>
                  <td><StatusBadge row={row} /></td>
                  <td>
                    {row.status === 'pending' ? (
                      <div className={styles.actions}>
                        {row.existing_receipt_number ? (
                          <span className={styles.muted}>קבלה כבר קיימת בנדרים+ (#{row.existing_receipt_number})</span>
                        ) : (
                          <button className={styles.actionBtn} disabled={resolvingId === row.id} onClick={() => handleResolve(row, 'cleared')}>
                            ✅ לא חזר – הוצא קבלה
                          </button>
                        )}
                        <button className={styles.dangerBtn} disabled={resolvingId === row.id} onClick={() => handleResolve(row, 'bounced')}>
                          ↩️ חזר – בטל בנדרים+
                        </button>
                        <button className={styles.actionBtn} disabled={resolvingId === row.id} onClick={() => handleMarkManually(row, 'cleared_manual')}>
                          סמן כנפרע (ללא פעולה)
                        </button>
                        <button className={styles.dangerBtn} disabled={resolvingId === row.id} onClick={() => handleMarkManually(row, 'bounced_manual')}>
                          סמן כחזר (ללא פעולה)
                        </button>
                      </div>
                    ) : (
                      <span className={styles.muted}>{row.resolution === 'receipt_issued' ? 'קבלה הוצאה' : row.resolution === 'cancelled_in_nedarim' ? 'בוטל בנדרים+' : row.resolution === 'marked_manually' ? 'סומן ידנית' : '—'}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
