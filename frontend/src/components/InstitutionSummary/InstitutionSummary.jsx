import { useState, useEffect } from 'react';
import styles from './InstitutionSummary.module.css';
import { fetchInstitutionSummary } from '../../services/api.js';
import { formatCurrency, formatNumber } from '../../lib/format.js';
import { Card, Stack, StatGrid, Stat, StateMessage, Table, Button, tableStyles as t } from '../ui';

const MONTH_NAMES = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'];

function formatMonth(dateStr) {
  const [y, m] = dateStr.split('-').map(Number);
  return `${MONTH_NAMES[m - 1]} ${y}`;
}

export default function InstitutionSummary() {
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);

  const load = () => {
    setLoading(true);
    setError(null);
    fetchInstitutionSummary()
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  if (loading) return <Card><StateMessage kind="loading" /></Card>;
  if (error) {
    return <Card><StateMessage kind="error" description={error} action={<Button size="sm" icon="refresh" onClick={load}>נסה שוב</Button>} /></Card>;
  }

  const months = [...data.months].reverse();
  const best = Math.max(0, ...months.map((m) => Number(m.total_amount) || 0));

  return (
    <Stack>
      <StatGrid>
        <Stat label='סה"כ החודש' value={formatCurrency(data.monthTotal)} tone="success" />
        <Stat label='סה"כ השנה' value={formatCurrency(data.yearTotal)} />
        <Stat label="מספר תרומות השנה" value={formatNumber(data.yearCount)} />
      </StatGrid>

      <Card clip>
        {months.length === 0 ? (
          <StateMessage title="אין נתונים עדיין" icon="barChart" />
        ) : (
          <Table stackOnMobile>
            <thead>
              <tr>
                <th>חודש</th>
                <th>סה"כ</th>
                <th>מספר תרומות</th>
                <th className={styles.barCol} aria-hidden="true" />
              </tr>
            </thead>
            <tbody>
              {months.map((row) => (
                <tr key={row.month}>
                  <td data-label="חודש" className={t.strong}>{formatMonth(row.month)}</td>
                  <td data-label='סה"כ' className={t.amount}>{formatCurrency(row.total_amount)}</td>
                  <td data-label="תרומות" className={t.num}>{formatNumber(row.donation_count)}</td>
                  <td className={styles.barCol} aria-hidden="true">
                    <div className={styles.bar} style={{ width: `${best ? (Number(row.total_amount) / best) * 100 : 0}%` }} />
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </Stack>
  );
}
