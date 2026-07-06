import { useState, useEffect, useCallback } from 'react';
import styles from '../Receipts/Receipts.module.css';
import { supabase } from '../../lib/supabase.js';
import { authFetch } from '../../services/api.js';
import { useAuth } from '../../contexts/AuthContext.jsx';

const FIELD_OPTIONS = [
  { value: 'mosad_number', label: 'מספר מוסד' },
  { value: 'group_name',   label: 'קטגוריה' },
  { value: 'comments',     label: 'הערות' },
  { value: 'masof_id',     label: 'מסוף נדרים' },
];

const OP_OPTIONS = [
  { value: 'eq',          label: 'שווה ל' },
  { value: 'contains',    label: 'מכיל' },
  { value: 'not_contains', label: 'לא מכיל' },
];

const emptyCondition = () => ({ field: 'mosad_number', op: 'eq', value: '' });

async function authHeaders() {
  const { data: { session } } = await supabase.auth.getSession();
  const headers = { 'Content-Type': 'application/json' };
  if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`;
  return headers;
}

export default function FundsManagement() {
  const { role } = useAuth();
  const [funds, setFunds]       = useState([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving]     = useState(false);
  const [msg, setMsg]           = useState({ text: '', ok: false });

  const [name, setName]               = useState('');
  const [conditions, setConditions]   = useState([emptyCondition()]);
  const [feePct, setFeePct]           = useState('');
  const [feeMult, setFeeMult]         = useState('1.17');
  const [extraLiteral, setExtraLiteral] = useState('');
  const [createSheet, setCreateSheet] = useState(true);
  const [spreadsheetId, setSpreadsheetId] = useState('');
  const [sheetName, setSheetName]     = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await authFetch('/api/funds');
      if (!res.ok) throw new Error('load failed');
      const data = await res.json();
      setFunds(Array.isArray(data) ? data : []);
    } catch {
      setError('שגיאה בטעינת הקרנות. נסה לרענן את הדף.');
      setFunds([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const updateCondition = (i, patch) =>
    setConditions((prev) => prev.map((c, idx) => (idx === i ? { ...c, ...patch } : c)));

  const resetForm = () => {
    setName('');
    setConditions([emptyCondition()]);
    setFeePct('');
    setFeeMult('1.17');
    setExtraLiteral('');
    setCreateSheet(true);
    setSpreadsheetId('');
    setSheetName('');
  };

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setMsg({ text: '', ok: false });
    try {
      const res = await fetch('/api/funds', {
        method: 'POST',
        headers: await authHeaders(),
        body: JSON.stringify({
          name,
          conditions,
          feePct: feePct ? parseFloat(feePct) / 100 : 0,
          feeMult: feeMult ? parseFloat(feeMult) : 1,
          extraLiteral: extraLiteral.trim() || undefined,
          createSheet,
          spreadsheetId,
          sheetName,
        }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || 'שגיאה ביצירת הקרן');
      setMsg({ text: `הקרן "${data.name}" נוצרה בהצלחה`, ok: true });
      resetForm();
      setShowForm(false);
      load();
    } catch (err) {
      setMsg({ text: err.message, ok: false });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <h3 className={styles.sectionTitle}>ניהול קרנות</h3>

      {msg.text && (
        <div className={msg.ok ? styles.successMsg : styles.errorMsg}>{msg.text}</div>
      )}

      <div style={{ marginBottom: 14 }}>
        <button
          type="button"
          className={`${styles.btn} ${styles.btnPrimary} ${styles.btnSm}`}
          onClick={() => setShowForm((v) => !v)}
        >
          {showForm ? 'ביטול' : '+ קרן חדשה'}
        </button>
      </div>

      {showForm && (
        <form onSubmit={submit} className={styles.card}>
          <div className={styles.formGrid}>
            <div className={styles.fieldGroup}>
              <label className={styles.fieldLabel}>שם הקרן</label>
              <input className={styles.fieldInput} value={name} onChange={(e) => setName(e.target.value)} required />
            </div>
            <div className={styles.fieldGroup}>
              <label className={styles.fieldLabel}>עמודה נוספת קבועה (אופציונלי, למשל "הו"ק")</label>
              <input className={styles.fieldInput} value={extraLiteral} onChange={(e) => setExtraLiteral(e.target.value)} />
            </div>
            <div className={styles.fieldGroup}>
              <label className={styles.fieldLabel}>אחוז עמלה (אופציונלי, למשל 3)</label>
              <input className={styles.fieldInput} type="number" step="0.1" value={feePct} onChange={(e) => setFeePct(e.target.value)} />
            </div>
            <div className={styles.fieldGroup}>
              <label className={styles.fieldLabel}>מכפיל מע"מ (ברירת מחדל 1.17)</label>
              <input className={styles.fieldInput} type="number" step="0.01" value={feeMult} onChange={(e) => setFeeMult(e.target.value)} />
            </div>
          </div>

          <p style={{ fontSize: 12, color: 'var(--color-text-muted)', margin: '14px 0 6px' }}>
            תנאי ניתוב — עסקה תיכנס לקרן הזו אם **כל** התנאים הבאים מתקיימים:
          </p>
          {conditions.map((c, i) => (
            <div key={i} className={styles.formGrid} style={{ marginBottom: 8 }}>
              <select className={styles.fieldSelect} value={c.field} onChange={(e) => updateCondition(i, { field: e.target.value })}>
                {FIELD_OPTIONS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
              </select>
              <select className={styles.fieldSelect} value={c.op} onChange={(e) => updateCondition(i, { op: e.target.value })}>
                {OP_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
              <input
                className={styles.fieldInput}
                placeholder="ערך"
                value={c.value}
                onChange={(e) => updateCondition(i, { value: e.target.value })}
                required
              />
              {conditions.length > 1 && (
                <button type="button" className={styles.btnIconDanger} onClick={() => setConditions((prev) => prev.filter((_, idx) => idx !== i))}>🗑</button>
              )}
            </div>
          ))}
          <button
            type="button"
            className={`${styles.btn} ${styles.btnGhost} ${styles.btnSm}`}
            onClick={() => setConditions((prev) => [...prev, emptyCondition()])}
          >
            + תנאי נוסף (AND)
          </button>

          <div style={{ marginTop: 16, marginBottom: 10 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
              <input type="checkbox" className={styles.checkbox} checked={createSheet} onChange={(e) => setCreateSheet(e.target.checked)} />
              ליצור גיליון Google Sheets אוטומטית (מתבנית)
            </label>
          </div>

          {!createSheet && (
            <div className={styles.formGrid}>
              <div className={styles.fieldGroup}>
                <label className={styles.fieldLabel}>Spreadsheet ID קיים</label>
                <input className={styles.fieldInput} value={spreadsheetId} onChange={(e) => setSpreadsheetId(e.target.value)} required={!createSheet} />
              </div>
              <div className={styles.fieldGroup}>
                <label className={styles.fieldLabel}>שם הטאב</label>
                <input className={styles.fieldInput} value={sheetName} onChange={(e) => setSheetName(e.target.value)} required={!createSheet} />
              </div>
            </div>
          )}

          <div style={{ marginTop: 16 }}>
            <button type="submit" className={`${styles.btn} ${styles.btnPrimary}`} disabled={saving || role !== 'admin'}>
              {saving ? 'יוצר...' : 'צור קרן'}
            </button>
            {role !== 'admin' && (
              <span style={{ marginRight: 10, fontSize: 12, color: 'var(--color-text-muted)' }}>רק מנהל יכול ליצור קרן חדשה</span>
            )}
          </div>
        </form>
      )}

      {loading ? (
        <div className={styles.placeholder}>טוען...</div>
      ) : error ? (
        <div className={styles.empty} style={{ color: 'var(--color-danger)' }}>{error}</div>
      ) : funds.length === 0 ? (
        <div className={styles.empty}>אין קרנות מוגדרות עדיין</div>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>קרן</th>
                <th>יתרה</th>
                <th>גיליון</th>
              </tr>
            </thead>
            <tbody>
              {funds.map((f) => (
                <tr key={f.id}>
                  <td>{f.name}</td>
                  <td style={{ fontWeight: 700, color: f.balanceError ? 'var(--color-text-muted)' : 'var(--color-success)' }}>
                    {f.balanceError ? 'שגיאה' : (f.balance ?? '—')}
                  </td>
                  <td>
                    <a href={f.sheetUrl} target="_blank" rel="noreferrer" className={styles.receiptSuccessLink}>פתח גיליון</a>
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
