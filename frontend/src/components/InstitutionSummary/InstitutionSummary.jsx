import { useState, useEffect } from 'react';
import styles from './InstitutionSummary.module.css';
import { fetchInstitutionSummary } from '../../services/api.js';

const MONTH_NAMES = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'];

function formatMonth(dateStr) {
  const [y, m] = dateStr.split('-').map(Number);
  return `${MONTH_NAMES[m - 1]} ${y}`;
}

function formatAmount(n) {
  return `${Number(n).toLocaleString('he-IL', { maximumFractionDigits: 0 })}₪`;
}

export default function InstitutionSummary() {
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);

  useEffect(() => {
    fetchInstitutionSummary()
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className={styles.loadingState}>טוען...</div>;
  if (error)   return <div className={styles.errorBanner}>{error}</div>;

  const months = [...data.months].reverse();

  return (
    <div className={styles.page}>
      <div className={styles.cards}>
        <div className={styles.card}>
          <span className={styles.cardLabel}>סה"כ החודש</span>
          <span className={styles.cardValue}>{formatAmount(data.monthTotal)}</span>
        </div>
        <div className={styles.card}>
          <span className={styles.cardLabel}>סה"כ השנה</span>
          <span className={styles.cardValue}>{formatAmount(data.yearTotal)}</span>
        </div>
        <div className={styles.card}>
          <span className={styles.cardLabel}>מספר תרומות השנה</span>
          <span className={styles.cardValue}>{data.yearCount.toLocaleString('he-IL')}</span>
        </div>
      </div>

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>חודש</th>
              <th>סה"כ</th>
              <th>מספר תרומות</th>
            </tr>
          </thead>
          <tbody>
            {months.map((row) => (
              <tr key={row.month}>
                <td>{formatMonth(row.month)}</td>
                <td>{formatAmount(row.total_amount)}</td>
                <td>{row.donation_count}</td>
              </tr>
            ))}
            {months.length === 0 && (
              <tr><td colSpan={3} className={styles.emptyState}>אין נתונים עדיין</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
