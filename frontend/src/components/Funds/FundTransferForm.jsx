import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import styles from '../Receipts/Receipts.module.css';
import { supabase } from '../../lib/supabase.js';
import { authFetch } from '../../services/api.js';

const DEFAULT_DESCRIPTION = 'בוצע העברה';

const today = () => new Date().toISOString().slice(0, 10);

const formatILS = (n) => `₪${Math.abs(n).toLocaleString('he-IL', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

// The shared .fieldInput/.fieldSelect border is a translucent white edge meant
// for cards over a colored backdrop — invisible on this form's plain white
// card. Give the fields a real visible border here without touching the
// shared style (used as-is elsewhere).
const fieldBorder = { border: '1px solid var(--color-border)' };

// DD/MM/YYYY, matching how the row will actually be written to the sheet.
function formatDmy(isoDate) {
  const [y, m, d] = isoDate.split('-');
  return `${d}/${m}/${y}`;
}

async function authHeaders() {
  const { data: { session } } = await supabase.auth.getSession();
  const headers = { 'Content-Type': 'application/json' };
  if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`;
  return headers;
}

export default function FundTransferForm() {
  const [funds, setFunds]     = useState([]);
  const [loading, setLoading] = useState(true);
  const [fundId, setFundId]         = useState('');
  const [date, setDate]             = useState(today);
  const [description, setDescription] = useState(DEFAULT_DESCRIPTION);
  const [amount, setAmount]         = useState('');
  const [saving, setSaving]         = useState(false);
  const [msg, setMsg]               = useState({ text: '', ok: false });
  const amountRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await authFetch('/api/funds');
      if (!res.ok) throw new Error('load failed');
      const data = await res.json();
      setFunds(Array.isArray(data) ? data : []);
    } catch {
      setMsg({ text: 'שגיאה בטעינת הקרנות. נסה לרענן את הדף.', ok: false });
      setFunds([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const selectedFundName = useMemo(
    () => funds.find((f) => f.id === fundId)?.name ?? '',
    [funds, fundId]
  );

  const validAmount = Number(amount) > 0;

  const submit = async (e) => {
    e.preventDefault();
    if (!fundId || !validAmount) return;

    setSaving(true);
    setMsg({ text: '', ok: false });
    try {
      const res = await fetch('/api/fund-transfer', {
        method: 'POST',
        headers: await authHeaders(),
        body: JSON.stringify({ fundId, date, description, amount: Number(amount) }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || 'שגיאה ברישום ההעברה');
      setMsg({ text: `נרשמה העברה של ${formatILS(Number(amount))} מקרן "${data.fundName}"`, ok: true });
      setAmount('');
      setDate(today());
      amountRef.current?.focus();
    } catch (err) {
      setMsg({ text: err.message, ok: false });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <h3 className={styles.sectionTitle}>העברה לנתמך</h3>

      {msg.text && (
        <div className={msg.ok ? styles.successMsg : styles.errorMsg}>{msg.text}</div>
      )}

      <form onSubmit={submit} className={styles.card}>
        <div className={styles.formGrid}>
          <div className={`${styles.fieldGroup} ${styles.formGridFull}`}>
            <label className={styles.fieldLabel}>קרן</label>
            <select className={styles.fieldSelect} style={fieldBorder} value={fundId} onChange={(e) => setFundId(e.target.value)} required>
              <option value="" disabled>{loading ? 'טוען...' : 'בחר קרן'}</option>
              {funds.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
          </div>

          <div className={styles.fieldGroup}>
            <label className={styles.fieldLabel}>תאריך</label>
            <input className={styles.fieldInput} style={fieldBorder} type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
          </div>
          <div className={styles.fieldGroup}>
            <label className={styles.fieldLabel}>סכום</label>
            <input
              ref={amountRef}
              className={styles.fieldInput}
              style={fieldBorder}
              type="number"
              inputMode="decimal"
              step="0.01"
              min="0"
              placeholder="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
            />
          </div>

          <div className={`${styles.fieldGroup} ${styles.formGridFull}`}>
            <label className={styles.fieldLabel}>תיאור (יופיע בגיליון)</label>
            <input className={styles.fieldInput} style={fieldBorder} value={description} onChange={(e) => setDescription(e.target.value)} required />
          </div>
        </div>

        {fundId && validAmount && (
          <p style={{ fontSize: 12, color: 'var(--color-text-muted)', margin: '14px 0 0' }}>
            ייכתב בגיליון של "{selectedFundName}": {formatDmy(date)} · {description || DEFAULT_DESCRIPTION} · ‎-{formatILS(Number(amount))}
          </p>
        )}

        <div style={{ marginTop: 16 }}>
          <button type="submit" className={`${styles.btn} ${styles.btnPrimary}`} disabled={saving || loading || !fundId || !validAmount}>
            {saving ? 'רושם...' : 'רשום העברה'}
          </button>
        </div>
      </form>
    </div>
  );
}
