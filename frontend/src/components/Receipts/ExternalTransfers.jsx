import { useState, useEffect, useCallback, useRef } from 'react';
import styles from './Receipts.module.css';
import { authFetch } from '../../services/api.js';
import { supabase } from '../../lib/supabase.js';
import { TRANSFER_INSTITUTIONS } from '../../constants/transferInstitutions.js';

const FIELDS = [
  { key: 'institution_id', label: 'מוסד', type: 'select' },
  { key: 'customer_name', label: 'שם השולח', type: 'autocomplete' },
  { key: 'id_number', label: 'תעודת זהות', type: 'text' },
  { key: 'email', label: 'כתובת מייל', type: 'email' },
  { key: 'phone', label: 'מספר טלפון', type: 'tel' },
  { key: 'address', label: 'כתובת מגורים', type: 'text' },
  { key: 'amount', label: 'סכום (₪)', type: 'number' },
  { key: 'transfer_date', label: 'תאריך העברה', type: 'text' },
  { key: 'asmachta', label: 'אסמכתא', type: 'text' },
  { key: 'category', label: 'קטגוריה', type: 'text' },
  { key: 'bank_name', label: 'בנק', type: 'text' },
  { key: 'bank_branch', label: 'סניף', type: 'text' },
  { key: 'bank_account', label: 'חשבון', type: 'text' },
  { key: 'notes', label: 'הערות', type: 'text' },
];

// Free-text "שם השולח" input that also searches the existing customers table
// as the reviewer types, so they can pick a known donor from a dropdown
// instead of retyping details already on file (mirrors QuickReceipt.jsx's
// customer autocomplete). Selecting one fills id_number/email/phone/bank
// details via onSelect, without overwriting anything already filled in.
function CustomerNameField({ value, onChange, onSelect, disabled }) {
  const [suggestions, setSuggestions] = useState([]);
  const [showSugg, setShowSugg] = useState(false);
  const wrapRef = useRef(null);

  useEffect(() => {
    const handler = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setShowSugg(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  async function search(q) {
    if (q.trim().length < 2) { setSuggestions([]); setShowSugg(false); return; }
    const { data } = await supabase.from('customers')
      .select('*')
      .or(`name.ilike.%${q}%,bank_account.ilike.%${q}%,id_number.ilike.%${q}%`)
      .limit(6);
    if (data?.length) { setSuggestions(data); setShowSugg(true); }
    else { setSuggestions([]); setShowSugg(false); }
  }

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <input
        className={styles.fieldInput}
        value={value}
        onChange={(e) => { onChange(e.target.value); search(e.target.value); }}
        onFocus={() => suggestions.length > 0 && setShowSugg(true)}
        disabled={disabled}
        autoComplete="off"
      />
      {showSugg && suggestions.length > 0 && (
        <div className={styles.autocompleteDropdown}>
          {suggestions.map((c) => (
            <div
              key={c.id}
              className={styles.autocompleteItem}
              onClick={() => { onSelect(c); setShowSugg(false); }}
            >
              <div className={styles.autocompleteItemName}>{c.name}</div>
              <div className={styles.autocompleteItemSub}>
                {[c.id_number, c.bank_account, c.email].filter(Boolean).join(' · ')}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function ExternalTransfers() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await authFetch('/api/toldot-submissions');
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || 'שגיאה בטעינה');
      setRows((data.data || []).map((r) => ({ ...r, _fields: extractFields(r) })));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  function setField(id, key, value) {
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, _fields: { ...r._fields, [key]: value } } : r)));
  }

  // Applies a picked customer over the row's fields — fills name always, and
  // fills id_number/email/phone/bank details only where the reviewer hasn't
  // already entered something, so a manual edit is never clobbered.
  function selectCustomer(id, c) {
    setRows((rs) => rs.map((r) => {
      if (r.id !== id) return r;
      const f = { ...r._fields, customer_name: c.name };
      if (!f.id_number && c.id_number)       f.id_number = c.id_number;
      if (!f.email && c.email)               f.email = c.email;
      if (!f.phone && c.phone)               f.phone = c.phone;
      if (!f.bank_name && c.bank_name)       f.bank_name = c.bank_name;
      if (!f.bank_branch && c.bank_branch)   f.bank_branch = c.bank_branch;
      if (!f.bank_account && c.bank_account) f.bank_account = c.bank_account;
      return { ...r, _fields: f };
    }));
  }

  async function act(row, action) {
    setBusyId(row.id);
    setError('');
    setSuccess('');
    try {
      const res = await authFetch('/api/toldot-submissions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: row.id, action, fields: row._fields }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || 'שגיאה');
      if (action === 'approve' && data.docNumber) {
        setSuccess(`קבלה הונפקה בהצלחה (${data.institutionLabel || ''}) — מספר ${data.docNumber}`);
      }
      // Drop the handled row from the queue.
      setRows((rs) => rs.filter((r) => r.id !== row.id));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <h3 className={styles.sectionTitle} style={{ margin: 0 }}>העברות מהדף החיצוני</h3>
        <button className={`${styles.btn} ${styles.btnGhost} ${styles.btnSm}`} onClick={load} disabled={loading}>↻ רענן</button>
      </div>
      <p style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 0 }}>
        הגשות שהתקבלו מהדף הציבורי. אישור מנפיק קבלה במוסד שנבחר ורושם את ההעברה במערכת.
      </p>

      {error && <div className={styles.errorMsg}>{error}</div>}
      {success && <div className={styles.successMsg}>{success}</div>}

      {loading ? (
        <div className={styles.placeholder}>טוען...</div>
      ) : rows.length === 0 ? (
        <div className={styles.empty}>אין העברות ממתינות לאישור.</div>
      ) : (
        rows.map((row) => (
          <div key={row.id} className={styles.card} style={{ marginBottom: 14 }}>
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
              {row.screenshot_url && (
                <a href={row.screenshot_url} target="_blank" rel="noreferrer" style={{ flex: '0 0 auto' }}>
                  <img
                    src={row.screenshot_url}
                    alt="צילום ההעברה"
                    style={{ maxWidth: 240, maxHeight: 300, borderRadius: 8, border: '1px solid var(--color-border)' }}
                  />
                </a>
              )}
              <div style={{ flex: '1 1 260px', minWidth: 240 }}>
                <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginBottom: 8 }}>
                  התקבל: {new Date(row.created_at).toLocaleString('he-IL')}
                </div>
                <div className={styles.formGrid}>
                  {FIELDS.map(({ key, label, type }) => (
                    <div key={key} className={styles.fieldGroup}>
                      <label className={styles.fieldLabel}>{label}</label>
                      {type === 'select' ? (
                        <select
                          className={styles.fieldSelect}
                          value={row._fields[key] ?? ''}
                          onChange={(e) => setField(row.id, key, e.target.value)}
                          disabled={busyId === row.id}
                        >
                          {TRANSFER_INSTITUTIONS.map((inst) => (
                            <option key={inst.id} value={inst.id}>{inst.label}</option>
                          ))}
                        </select>
                      ) : type === 'autocomplete' ? (
                        <CustomerNameField
                          value={row._fields[key] ?? ''}
                          onChange={(v) => setField(row.id, key, v)}
                          onSelect={(c) => selectCustomer(row.id, c)}
                          disabled={busyId === row.id}
                        />
                      ) : (
                        <input
                          className={styles.fieldInput}
                          type={type}
                          value={row._fields[key] ?? ''}
                          onChange={(e) => setField(row.id, key, e.target.value)}
                          disabled={busyId === row.id}
                        />
                      )}
                      {key === 'id_number' && !row.id_number && row.suggested_id_number && (
                        <div style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>
                          מולא אוטומטית לפי לקוח קיים — ניתן לערוך
                        </div>
                      )}
                      {key === 'email' && !row.email && row.suggested_email && (
                        <div style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>
                          מולא אוטומטית לפי לקוח קיים — ניתן לערוך
                        </div>
                      )}
                    </div>
                  ))}
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                  <button
                    className={`${styles.btn} ${styles.btnPrimary} ${styles.btnSm}`}
                    onClick={() => act(row, 'approve')}
                    disabled={busyId === row.id}
                  >
                    {busyId === row.id ? 'מנפיק...' : '✓ אשר והנפק קבלה'}
                  </button>
                  <button
                    className={`${styles.btn} ${styles.btnDanger} ${styles.btnSm}`}
                    onClick={() => act(row, 'reject')}
                    disabled={busyId === row.id}
                  >
                    ✕ דחה
                  </button>
                </div>
              </div>
            </div>
          </div>
        ))
      )}
    </div>
  );
}

// EZCount needs DD/MM/YYYY — show the reviewer the date in that format too, so
// what they see matches what gets sent on the receipt.
function toDmy(raw) {
  if (!raw) return '';
  const s = String(raw).trim();
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return `${iso[3]}/${iso[2]}/${iso[1]}`;
  return s;
}

function extractFields(r) {
  return {
    institution_id: r.institution_id || 'toldot', // rows submitted before multi-institution support
    customer_name: r.customer_name ?? '',
    id_number: r.id_number || r.suggested_id_number || '',
    email: r.email || r.suggested_email || '',
    phone: r.phone ?? '',
    address: r.address ?? '',
    amount: r.amount != null ? String(r.amount) : '',
    transfer_date: toDmy(r.transfer_date),
    asmachta: r.asmachta ?? '',
    category: '',
    bank_name: r.bank_name ?? '',
    bank_branch: r.bank_branch ?? '',
    bank_account: r.bank_account ?? '',
    notes: r.notes ?? '',
  };
}
