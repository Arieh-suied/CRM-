import { useState, useEffect } from 'react';
import styles from './StandingOrders.module.css';
import { fetchStandingOrders } from '../../services/api.js';

const fmt = (n, currency = 'ILS') => {
  try {
    return new Intl.NumberFormat('he-IL', { style: 'currency', currency, maximumFractionDigits: 2 }).format(n ?? 0);
  } catch { return `${n ?? 0} ${currency}`; }
};

function parseExpiry(raw) {
  if (!raw || raw.length < 4) return raw ?? '—';
  const month = raw.slice(0, 2);
  const year  = raw.slice(2, 4);
  return `${month}/${year}`;
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

function CreditTable({ rows }) {
  if (!rows?.length) return <p className={styles.empty}>אין הוראות קבע אשראי</p>;
  return (
    <div className={styles.tableWrap}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th>#</th>
            <th>שם מלא</th>
            <th>סכום</th>
            <th>קטגוריה</th>
            <th>חיוב הבא</th>
            <th>יתרת חיובים</th>
            <th>חיובים בוצעו</th>
            <th>4 ספרות כרטיס</th>
            <th>תוקף</th>
            <th>שגיאה</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.DT_RowId}>
              <td className={styles.muted}>{row.DT_RowId}</td>
              <td className={styles.name}>{row['2'] ?? '—'}</td>
              <td className={styles.amount}>{row['4'] ? fmt(parseFloat(row['4'])) : '—'}</td>
              <td className={styles.muted}>{row['5'] ?? '—'}</td>
              <td className={styles.date}>{row['9'] ?? '—'}</td>
              <td className={styles.muted}>{row['7'] ?? '—'}</td>
              <td className={styles.muted}>{row['8'] ?? '—'}</td>
              <td className={styles.muted}>{row['11'] ? `****${row['11']}` : '—'}</td>
              <td className={styles.muted}>{parseExpiry(row['12'])}</td>
              <td className={row['10'] ? styles.error : styles.muted}>{row['10'] || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function BankTable({ rows }) {
  if (!rows?.length) return <p className={styles.empty}>אין הוראות קבע בנקאיות</p>;
  return (
    <div className={styles.tableWrap}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th>#</th>
            <th>שם לקוח</th>
            <th>פרטי חשבון</th>
            <th>סכום חודשי</th>
            <th>חיוב הבא</th>
            <th>יתרת חיובים</th>
            <th>קטגוריה</th>
            <th>הערה</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.DT_RowId}>
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
  );
}

export default function StandingOrders({ institutions }) {
  const [mosadFilter, setMosadFilter] = useState('');
  const [activeType, setActiveType]   = useState('credit');
  const [creditData, setCreditData]   = useState(null);
  const [bankData, setBankData]       = useState(null);
  const [loading, setLoading]         = useState(false);
  const [errorMsg, setErrorMsg]       = useState('');

  const eligibleInstitutions = (institutions ?? []).filter((i) => i.has_api_password);

  useEffect(() => {
    if (!mosadFilter) { setCreditData(null); setBankData(null); return; }
    setLoading(true);
    setErrorMsg('');
    fetchStandingOrders(mosadFilter)
      .then((res) => {
        setCreditData(res.credit ?? null);
        setBankData(res.bank ?? null);
      })
      .catch((e) => setErrorMsg(e.message))
      .finally(() => setLoading(false));
  }, [mosadFilter]);

  const creditRows = creditData?.data ?? [];
  const bankRows   = bankData?.data ?? [];

  return (
    <div className={styles.wrapper}>
      <div className={styles.toolbar}>
        <select
          className={styles.select}
          value={mosadFilter}
          onChange={(e) => setMosadFilter(e.target.value)}
        >
          <option value="">בחר מוסד</option>
          {eligibleInstitutions.map((i) => (
            <option key={i.mosad_number} value={i.mosad_number}>{i.mosad_name}</option>
          ))}
        </select>

        {mosadFilter && !loading && (
          <div className={styles.typeTabs}>
            <button
              className={`${styles.typeTab} ${activeType === 'credit' ? styles.typeTabActive : ''}`}
              onClick={() => setActiveType('credit')}
            >
              אשראי ({creditRows.length})
            </button>
            <button
              className={`${styles.typeTab} ${activeType === 'bank' ? styles.typeTabActive : ''}`}
              onClick={() => setActiveType('bank')}
            >
              בנקאי ({bankRows.length})
            </button>
          </div>
        )}
      </div>

      {!mosadFilter && (
        <p className={styles.placeholder}>בחר מוסד כדי לטעון הוראות קבע</p>
      )}

      {loading && <p className={styles.placeholder}>טוען...</p>}

      {errorMsg && <p className={styles.errorMsg}>{errorMsg}</p>}

      {!loading && mosadFilter && activeType === 'credit' && (
        <>
          {creditData && !creditData.error && (
            <SummaryBar totalMonth={creditData.TotalMonth} totalYear={creditData.TotalYear} />
          )}
          {creditData?.error
            ? <p className={styles.errorMsg}>{creditData.error}</p>
            : <CreditTable rows={creditRows} />
          }
        </>
      )}

      {!loading && mosadFilter && activeType === 'bank' && (
        <>
          {bankData?.error
            ? <p className={styles.errorMsg}>{bankData.error}</p>
            : <BankTable rows={bankRows} />
          }
        </>
      )}
    </div>
  );
}
