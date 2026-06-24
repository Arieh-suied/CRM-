import { useState, useEffect, useRef, useCallback } from 'react';
import styles from './Receipts.module.css';
import { supabase } from '../../lib/supabase.js';
import TransferScreenshotUpload from './TransferScreenshotUpload.jsx';

const BRANCHES = [
  'סומך נופלים',
  'אור אפרים',
  'אור אפרים שכ"ל',
  'חכמי ירושלים',
  'חכמי ירושלים שכ"ל',
];

const PAYMENT_METHODS = [
  { value: '4', label: 'העברה בנקאית' },
  { value: '1', label: 'מזומן' },
  { value: '2', label: 'המחאה' },
];

const newPayment = () => ({
  id: Math.random().toString(36).slice(2),
  method: '4',
  amount: '',
  bankName: '',
  bankBranch: '',
  bankAccount: '',
  checkNumber: '',
  date: '',
});

export default function QuickReceipt() {
  const [branch, setBranch]     = useState('');
  const [name, setName]         = useState('');
  const [idNum, setIdNum]       = useState('');
  const [phone, setPhone]       = useState('');
  const [email, setEmail]       = useState('');
  const [notes, setNotes]       = useState('');
  const [payments, setPayments] = useState([newPayment()]);
  const [loading, setLoading]   = useState(false);
  const [msg, setMsg]           = useState({ text: '', ok: false });
  const [lastReceipt, setLastReceipt] = useState(null);

  // Autocomplete
  const [suggestions, setSuggestions]       = useState([]);
  const [showSugg, setShowSugg]             = useState(false);
  const [selectedCustomerId, setSelectedCustomerId] = useState(null);
  const suggRef = useRef(null);

  useEffect(() => {
    const handler = (e) => {
      if (suggRef.current && !suggRef.current.contains(e.target)) setShowSugg(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const searchCustomers = useCallback(async (q) => {
    if (q.length < 2) { setSuggestions([]); setShowSugg(false); return; }
    const { data } = await supabase.from('customers')
      .select('*')
      .or(`name.ilike.%${q}%,bank_account.ilike.%${q}%,id_number.ilike.%${q}%`)
      .limit(6);
    if (data?.length) { setSuggestions(data); setShowSugg(true); }
    else { setSuggestions([]); setShowSugg(false); }
  }, []);

  const lookupByAccount = useCallback(async (account) => {
    if (!account || account.length < 4 || name.trim()) return;
    const { data } = await supabase.from('customers')
      .select('*')
      .ilike('bank_account', `%${account}%`)
      .limit(3);
    if (data?.length === 1) {
      selectCustomer(data[0]);
    } else if (data?.length > 1) {
      setSuggestions(data);
      setShowSugg(true);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name]);

  const selectCustomer = (c) => {
    setName(c.name);
    setIdNum(c.id_number || '');
    setPhone(c.phone    || '');
    setEmail(c.email    || '');
    setSelectedCustomerId(c.id);
    setPayments(prev => {
      const updated = [...prev];
      if (c.bank_name)    updated[0] = { ...updated[0], bankName:    c.bank_name };
      if (c.bank_branch)  updated[0] = { ...updated[0], bankBranch:  c.bank_branch };
      if (c.bank_account) updated[0] = { ...updated[0], bankAccount: c.bank_account };
      return updated;
    });
    setShowSugg(false);
  };

  const saveCustomerField = useCallback(async (field, value) => {
    if (!selectedCustomerId) return;
    await supabase.from('customers').update({ [field]: value || null }).eq('id', selectedCustomerId);
  }, [selectedCustomerId]);

  const updatePayment = (id, field, val) =>
    setPayments(prev => prev.map(p => p.id === id ? { ...p, [field]: val } : p));

  const handleExtracted = (data) => {
    if (data.donor_name && !name.trim()) {
      setName(data.donor_name);
      searchCustomers(data.donor_name);
    }
    setPayments(prev => {
      const updated = [...prev];
      const first = { ...updated[0], method: '4' };
      if (data.amount != null)         first.amount      = String(data.amount);
      if (data.transfer_date)          first.date        = data.transfer_date;
      if (data.bank_number)            first.bankName    = data.bank_number;
      if (data.branch_number)          first.bankBranch  = data.branch_number;
      if (data.account_number)         first.bankAccount = data.account_number;
      updated[0] = first;
      return updated;
    });
    const extras = [];
    if (data.asmachta)     extras.push(`אסמכתא: ${data.asmachta}`);
    if (data.account_name) extras.push(`שם בעל חשבון: ${data.account_name}`);
    if (data.remarks)      extras.push(data.remarks);
    if (extras.length) {
      setNotes(prev => prev.trim() ? `${prev.trim()}\n${extras.join(' | ')}` : extras.join(' | '));
    }
  };

  const removePayment = (id) =>
    setPayments(prev => prev.filter(p => p.id !== id));

  const totalAmount = payments.reduce((s, p) => {
    const v = parseFloat(p.amount);
    return s + (isNaN(v) ? 0 : v);
  }, 0);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!branch)     return setMsg({ text: 'יש לבחור מוסד', ok: false });
    if (!name.trim()) return setMsg({ text: 'יש להזין שם לקוח', ok: false });

    const validPayments = payments.filter(p => p.amount && parseFloat(p.amount) > 0);
    if (!validPayments.length) return setMsg({ text: 'יש להזין לפחות תשלום אחד', ok: false });
    if (validPayments.some(p => p.method === '2' && !p.checkNumber.trim()))
      return setMsg({ text: 'יש למלא מספר המחאה', ok: false });
    if (validPayments.some(p => !p.date))
      return setMsg({ text: 'יש למלא תאריך לכל תשלום', ok: false });

    setLoading(true); setMsg({ text: '', ok: false });
    try {
      const body = {
        customerName:  name.trim(),
        customerId:    idNum.trim() || undefined,
        customerPhone: phone.trim() || undefined,
        customerEmail: email.trim() || undefined,
        amount: totalAmount,
        branch,
        payments: validPayments.map(p => ({
          paymentMethod: Number(p.method),
          amount: parseFloat(p.amount),
          bankName:    p.bankName    || undefined,
          bankBranch:  p.bankBranch  || undefined,
          bankAccount: p.bankAccount || undefined,
          checkNumber: p.checkNumber || undefined,
          transferDate: p.date       || undefined,
        })),
        notes: notes.trim() || undefined,
      };

      const res = await fetch('/api/receipts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || 'שגיאה ביצירת הקבלה');

      setLastReceipt({ docNumber: data.docNumber, url: data.docUrl });
      setMsg({ text: `קבלה מספר ${data.docNumber} הופקה בהצלחה!`, ok: true });

      // Reset form
      setBranch(''); setName(''); setIdNum(''); setPhone(''); setEmail(''); setNotes('');
      setPayments([newPayment()]); setSelectedCustomerId(null);
    } catch (err) {
      setMsg({ text: err.message, ok: false });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <h3 className={styles.sectionTitle}>הפקת קבלה חדשה</h3>

      {msg.text && (
        <div className={msg.ok ? styles.successMsg : styles.errorMsg}>{msg.text}</div>
      )}

      {lastReceipt && (
        <div className={styles.receiptSuccess}>
          <span className={styles.receiptSuccessIcon}>✅</span>
          <div>
            <div style={{ fontWeight: 700, marginBottom: 4 }}>קבלה הופקה בהצלחה</div>
            <div style={{ fontSize: 13 }}>מספר קבלה: <strong>{lastReceipt.docNumber}</strong></div>
            {lastReceipt.url && (
              <a
                href={`/api/receipt-proxy?url=${encodeURIComponent(lastReceipt.url)}&filename=קבלה-${lastReceipt.docNumber}`}
                target="_blank"
                rel="noopener noreferrer"
                className={styles.receiptSuccessLink}
              >
                צפה בקבלה ←
              </a>
            )}
          </div>
        </div>
      )}

      <TransferScreenshotUpload onExtracted={handleExtracted} />

      <form onSubmit={handleSubmit}>
        <div className={styles.card}>
          {/* Branch */}
          <div className={styles.formGrid}>
            <div className={styles.fieldGroup}>
              <label className={styles.fieldLabel}>מוסד *</label>
              <select className={styles.fieldSelect} value={branch} onChange={e => setBranch(e.target.value)} required>
                <option value="">בחר מוסד</option>
                {BRANCHES.map(b => <option key={b} value={b}>{b}</option>)}
              </select>
            </div>

          </div>

          {/* Customer */}
          <div className={styles.formGrid} style={{ marginTop: 14 }}>
            <div className={styles.fieldGroup}>
              <label className={styles.fieldLabel}>שם הלקוח *</label>
              <div ref={suggRef} style={{ position: 'relative' }}>
                <input
                  className={styles.fieldInput}
                  value={name}
                  onChange={e => { setName(e.target.value); setSelectedCustomerId(null); searchCustomers(e.target.value); }}
                  onFocus={() => suggestions.length && setShowSugg(true)}
                  placeholder="שם מלא"
                  autoComplete="off"
                />
                {showSugg && suggestions.length > 0 && (
                  <div className={styles.autocompleteDropdown}>
                    {suggestions.map(c => (
                      <div key={c.id} className={styles.autocompleteItem} onClick={() => selectCustomer(c)}>
                        <div className={styles.autocompleteItemName}>{c.name}</div>
                        <div className={styles.autocompleteItemSub}>
                          {[c.id_number, c.bank_account, c.email].filter(Boolean).join(' · ')}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className={styles.fieldGroup}>
              <label className={styles.fieldLabel}>מספר זהות / ח.פ.</label>
              <input
                className={styles.fieldInput}
                value={idNum}
                onChange={e => setIdNum(e.target.value)}
                onBlur={e => saveCustomerField('id_number', e.target.value)}
                placeholder="ת.ז. או ח.פ."
                dir="ltr"
              />
            </div>

            <div className={styles.fieldGroup}>
              <label className={styles.fieldLabel}>טלפון</label>
              <input
                className={styles.fieldInput}
                value={phone}
                onChange={e => setPhone(e.target.value)}
                onBlur={e => saveCustomerField('phone', e.target.value)}
                placeholder="050-0000000"
                type="tel"
              />
            </div>

            <div className={styles.fieldGroup}>
              <label className={styles.fieldLabel}>אימייל</label>
              <input
                className={styles.fieldInput}
                value={email}
                onChange={e => setEmail(e.target.value)}
                onBlur={e => saveCustomerField('email', e.target.value)}
                placeholder="email@example.com"
                type="email"
                dir="ltr"
              />
            </div>
          </div>
        </div>

        {/* Payments */}
        <div className={styles.card}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <h3 className={styles.sectionTitle} style={{ margin: 0 }}>תשלומים</h3>
            <button
              type="button"
              className={styles.btnAddPayment}
              onClick={() => setPayments(prev => {
                const first = prev[0];
                const p = newPayment();
                if (first) { p.bankName = first.bankName; p.bankBranch = first.bankBranch; p.bankAccount = first.bankAccount; }
                return [...prev, p];
              })}
            >
              + הוסף תשלום
            </button>
          </div>

          {payments.map((p, idx) => (
            <div key={p.id} className={styles.paymentCard} style={{ marginBottom: 12 }}>
              <div className={styles.paymentCardHeader}>
                <span>תשלום {idx + 1}</span>
                {payments.length > 1 && (
                  <button type="button" className={styles.btnIconDanger} onClick={() => removePayment(p.id)}>✕</button>
                )}
              </div>

              <div className={styles.paymentGrid}>
                <div className={styles.fieldGroup}>
                  <label className={styles.fieldLabel}>אמצעי תשלום</label>
                  <select className={styles.fieldSelect} value={p.method} onChange={e => updatePayment(p.id, 'method', e.target.value)}>
                    {PAYMENT_METHODS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                  </select>
                </div>
                <div className={styles.fieldGroup}>
                  <label className={styles.fieldLabel}>סכום (₪) *</label>
                  <input
                    className={`${styles.fieldInput} ${styles.amountInput}`}
                    type="number"
                    min="0"
                    step="0.01"
                    value={p.amount}
                    onChange={e => updatePayment(p.id, 'amount', e.target.value)}
                    placeholder="0.00"
                    dir="ltr"
                  />
                </div>
              </div>

              {(p.method === '4' || p.method === '2') && (
                <div className={styles.bankGrid} style={{ marginTop: 10 }}>
                  <div className={styles.fieldGroup}>
                    <label className={styles.fieldLabel}>בנק</label>
                    <input className={styles.fieldInput} value={p.bankName} onChange={e => updatePayment(p.id, 'bankName', e.target.value)} placeholder="בנק" />
                  </div>
                  <div className={styles.fieldGroup}>
                    <label className={styles.fieldLabel}>סניף</label>
                    <input className={styles.fieldInput} value={p.bankBranch} onChange={e => updatePayment(p.id, 'bankBranch', e.target.value)} placeholder="סניף" dir="ltr" />
                  </div>
                  <div className={styles.fieldGroup}>
                    <label className={styles.fieldLabel}>חשבון</label>
                    <input
                      className={styles.fieldInput}
                      value={p.bankAccount}
                      onChange={e => updatePayment(p.id, 'bankAccount', e.target.value)}
                      onBlur={e => lookupByAccount(e.target.value)}
                      placeholder="חשבון"
                      dir="ltr"
                    />
                  </div>
                </div>
              )}

              {p.method === '2' && (
                <div className={styles.formGrid} style={{ marginTop: 10 }}>
                  <div className={styles.fieldGroup}>
                    <label className={styles.fieldLabel}>מספר המחאה *</label>
                    <input className={styles.fieldInput} value={p.checkNumber} onChange={e => updatePayment(p.id, 'checkNumber', e.target.value)} placeholder="מספר המחאה" dir="ltr" />
                  </div>
                </div>
              )}

              <div className={styles.fieldGroup} style={{ marginTop: 10 }}>
                <label className={styles.fieldLabel}>
                  {p.method === '1' ? 'תאריך הפקדה' : p.method === '2' ? 'תאריך המחאה' : 'תאריך העברה'} *
                </label>
                <input
                  className={styles.fieldInput}
                  type="date"
                  value={p.date}
                  onChange={e => updatePayment(p.id, 'date', e.target.value)}
                  max={new Date().toISOString().slice(0, 10)}
                />
              </div>
            </div>
          ))}

          {payments.length > 1 && (
            <div className={styles.paymentTotal}>
              <span>סה״כ</span>
              <span className={styles.paymentTotalAmount}>₪{totalAmount.toFixed(2)}</span>
            </div>
          )}
        </div>

        {/* Notes */}
        <div className={styles.card}>
          <div className={styles.fieldGroup}>
            <label className={styles.fieldLabel}>הערות (אופציונלי)</label>
            <textarea
              className={styles.fieldTextarea}
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="הערות נוספות..."
              rows={2}
            />
          </div>
        </div>

        <button
          type="submit"
          className={`${styles.btn} ${styles.btnPrimary}`}
          style={{ width: '100%', justifyContent: 'center', padding: '12px 24px', fontSize: 14 }}
          disabled={loading}
        >
          {loading ? 'מפיק קבלה...' : '📄 הפק קבלה'}
        </button>
      </form>
    </div>
  );
}
