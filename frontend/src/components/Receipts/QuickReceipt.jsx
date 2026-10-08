import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import styles from './ReceiptForms.module.css';
import { supabase } from '../../lib/supabase.js';
import { authFetch } from '../../services/api.js';
import { debounce } from '../../lib/debounce.js';
import { buildReceiptProxyUrl } from '../../lib/receiptProxy.js';
import { formatCurrency, toInputDate } from '../../lib/format.js';
import TransferScreenshotUpload from './TransferScreenshotUpload.jsx';
import {
  Card, CardHeader, CardBody, Stack, Field, Input, Select, Textarea, Checkbox, Suggestions,
  Button, IconButton, Alert, formStyles, useToast,
} from '../ui';

const BRANCHES = [
  'סומך נופלים',
  'אור אפרים',
  'אור אפרים שכ"ל',
  'אור אפרים קבלה רגיל',
  'חכמי ירושלים',
  'חכמי ירושלים שכ"ל',
  'חכמי ירושלים קבלה רגיל',
];

const PAYMENT_METHODS = [
  { value: '4', label: 'העברה בנקאית' },
  { value: '1', label: 'מזומן' },
  { value: '2', label: 'המחאה' },
];

const DATE_LABEL = { '1': 'תאריך הפקדה', '2': 'תאריך המחאה', '4': 'תאריך העברה' };

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
  const toast = useToast();
  const [branch, setBranch]     = useState('');
  const [funds, setFunds]       = useState([]);
  const [fundId, setFundId]     = useState('');
  const [sendTelegram, setSendTelegram] = useState(true);
  const [name, setName]         = useState('');
  const [idNum, setIdNum]       = useState('');
  const [phone, setPhone]       = useState('');
  const [email, setEmail]       = useState('');
  const [notes, setNotes]       = useState('');
  const [payments, setPayments] = useState([newPayment()]);
  const [loading, setLoading]   = useState(false);
  const [msg, setMsg]           = useState({ text: '', ok: false });
  const [lastReceipt, setLastReceipt] = useState(null);
  const [lastReceiptLink, setLastReceiptLink] = useState(null);

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

  useEffect(() => {
    authFetch('/api/funds')
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => setFunds(Array.isArray(data) ? data : []))
      .catch(() => setFunds([]));
  }, []);

  useEffect(() => {
    if (!lastReceipt?.url) { setLastReceiptLink(null); return; }
    let cancelled = false;
    buildReceiptProxyUrl(lastReceipt.url, `קבלה-${lastReceipt.docNumber}`)
      .then((u) => { if (!cancelled) setLastReceiptLink(u); });
    return () => { cancelled = true; };
  }, [lastReceipt]);

  const runCustomerSearch = useCallback(async (q) => {
    if (q.length < 2) { setSuggestions([]); setShowSugg(false); return; }
    const { data } = await supabase.from('customers')
      .select('*')
      .or(`name.ilike.%${q}%,bank_account.ilike.%${q}%,id_number.ilike.%${q}%`)
      .limit(6);
    if (data?.length) { setSuggestions(data); setShowSugg(true); }
    else { setSuggestions([]); setShowSugg(false); }
  }, []);
  // Debounced so fast typing doesn't fire a query per keystroke.
  const searchCustomers = useMemo(() => debounce(runCustomerSearch, 300), [runCustomerSearch]);

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
    setPayments((prev) => {
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
    setPayments((prev) => prev.map((p) => (p.id === id ? { ...p, [field]: val } : p)));

  const handleExtracted = (data) => {
    // Discount Bank's "מחויב" confirmation screen always belongs to חכמי ירושלים
    if (data.is_discount_chachmei_screen) setBranch('חכמי ירושלים');

    // Prefer donor_name; fall back to account_name (uncertain — flagged in the upload component) so the field isn't left empty
    const nameToUse = data.donor_name || data.account_name;
    if (nameToUse && !name.trim()) {
      setName(nameToUse);
      searchCustomers(nameToUse);
    }
    setPayments((prev) => {
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
    if (data.asmachta) extras.push(`אסמכתא: ${data.asmachta}`);
    if (data.account_name && data.account_name !== nameToUse) extras.push(`שם בעל חשבון: ${data.account_name}`);
    if (extras.length) {
      setNotes((prev) => (prev.trim() ? `${prev.trim()}\n${extras.join(' | ')}` : extras.join(' | ')));
    }
  };

  const addPayment = () => setPayments((prev) => {
    const first = prev[0];
    const p = newPayment();
    if (first) { p.bankName = first.bankName; p.bankBranch = first.bankBranch; p.bankAccount = first.bankAccount; }
    return [...prev, p];
  });

  const removePayment = (id) =>
    setPayments((prev) => prev.filter((p) => p.id !== id));

  const totalAmount = payments.reduce((s, p) => {
    const v = parseFloat(p.amount);
    return s + (isNaN(v) ? 0 : v);
  }, 0);

  const fail = (text) => setMsg({ text, ok: false });

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!branch)     return fail('יש לבחור מוסד');
    if (!name.trim()) return fail('יש להזין שם לקוח');

    const validPayments = payments.filter((p) => p.amount && parseFloat(p.amount) > 0);
    if (!validPayments.length) return fail('יש להזין לפחות תשלום אחד');
    if (validPayments.some((p) => p.method === '2' && !p.checkNumber.trim()))
      return fail('יש למלא מספר המחאה');
    if (validPayments.some((p) => !p.date))
      return fail('יש למלא תאריך לכל תשלום');

    setLoading(true); setMsg({ text: '', ok: false });
    try {
      const body = {
        customerName:  name.trim(),
        customerId:    idNum.trim() || undefined,
        customerPhone: phone.trim() || undefined,
        customerEmail: email.trim() || undefined,
        amount: totalAmount,
        branch,
        payments: validPayments.map((p) => ({
          paymentMethod: Number(p.method),
          amount: parseFloat(p.amount),
          bankName:    p.bankName    || undefined,
          bankBranch:  p.bankBranch  || undefined,
          bankAccount: p.bankAccount || undefined,
          checkNumber: p.checkNumber || undefined,
          transferDate: p.date       || undefined,
        })),
        notes: notes.trim() || undefined,
        fundId: fundId || undefined,
        sendTelegram,
      };

      const res = await authFetch('/api/receipts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || 'שגיאה ביצירת הקבלה');

      setLastReceipt({ docNumber: data.docNumber, url: data.docUrl });
      const extras = [];
      if (fundId && !data.fundWarning) extras.push('נוספה שורה לאקסל של הקרן.');
      if (data.telegramSent) extras.push('נשלחה הודעה בטלגרם.');
      if (data.fundWarning) extras.push(data.fundWarning);
      setMsg({ text: extras.join(' '), ok: true });
      toast.success(`קבלה מספר ${data.docNumber} הופקה`);

      // Reset form
      setBranch(''); setName(''); setIdNum(''); setPhone(''); setEmail(''); setNotes('');
      setPayments([newPayment()]); setSelectedCustomerId(null); setFundId('');
    } catch (err) {
      fail(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Stack>
      <TransferScreenshotUpload onExtracted={handleExtracted} />

      <form onSubmit={handleSubmit} noValidate>
        <Stack>
          <Card>
            <CardHeader title="פרטי הקבלה" />
            <CardBody>
              <div className={formStyles.grid}>
                <Field label="מוסד" required>
                  <Select value={branch} onChange={(e) => setBranch(e.target.value)}>
                    <option value="">בחר מוסד…</option>
                    {BRANCHES.map((b) => <option key={b} value={b}>{b}</option>)}
                  </Select>
                </Field>
                <Field label="קרן" hint="לא חובה — נרשמת גם באקסל של הקרן וגם לשיוך בדוחות מסוננים">
                  <Select value={fundId} onChange={(e) => setFundId(e.target.value)}>
                    <option value="">ללא קרן</option>
                    {funds.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
                  </Select>
                </Field>
              </div>
              <Checkbox
                className={styles.sectionGap}
                checked={sendTelegram}
                onChange={(e) => setSendTelegram(e.target.checked)}
                label="שליחת הודעה לערוץ הטלגרם של המוסד (אם קיים)"
              />

              <div className={`${formStyles.grid} ${styles.sectionGap}`}>
                <Field label="שם הלקוח" required htmlFor="qr-name">
                  <div ref={suggRef} className={formStyles.suggestWrap}>
                    <Input
                      id="qr-name"
                      value={name}
                      onChange={(e) => { setName(e.target.value); setSelectedCustomerId(null); searchCustomers(e.target.value); }}
                      onFocus={() => suggestions.length && setShowSugg(true)}
                      placeholder="שם מלא"
                      autoComplete="off"
                    />
                    {showSugg && (
                      <Suggestions
                        items={suggestions}
                        onSelect={selectCustomer}
                        getTitle={(c) => c.name}
                        getSub={(c) => [c.id_number, c.bank_account, c.email].filter(Boolean).join(' · ')}
                      />
                    )}
                  </div>
                </Field>
                <Field label="מספר זהות / ח.פ.">
                  <Input value={idNum} onChange={(e) => setIdNum(e.target.value)} onBlur={(e) => saveCustomerField('id_number', e.target.value)} placeholder='ת"ז או ח.פ.' dir="ltr" inputMode="numeric" />
                </Field>
                <Field label="טלפון">
                  <Input value={phone} onChange={(e) => setPhone(e.target.value)} onBlur={(e) => saveCustomerField('phone', e.target.value)} placeholder="050-0000000" type="tel" dir="ltr" />
                </Field>
                <Field label="אימייל">
                  <Input value={email} onChange={(e) => setEmail(e.target.value)} onBlur={(e) => saveCustomerField('email', e.target.value)} placeholder="email@example.com" type="email" dir="ltr" />
                </Field>
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="תשלומים" actions={<Button size="sm" variant="soft" icon="plus" onClick={addPayment}>הוספת תשלום</Button>} />
            <CardBody>
              {payments.map((p, idx) => (
                <div key={p.id} className={styles.payment}>
                  <div className={styles.paymentHead}>
                    <span>תשלום {idx + 1}</span>
                    {payments.length > 1 && <IconButton size="sm" icon="trash" label={`הסרת תשלום ${idx + 1}`} onClick={() => removePayment(p.id)} />}
                  </div>

                  <div className={formStyles.grid}>
                    <Field label="אמצעי תשלום">
                      <Select value={p.method} onChange={(e) => updatePayment(p.id, 'method', e.target.value)}>
                        {PAYMENT_METHODS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                      </Select>
                    </Field>
                    <Field label="סכום (₪)" required>
                      <Input
                        className={styles.amountInput}
                        type="number"
                        inputMode="decimal"
                        min="0"
                        step="0.01"
                        value={p.amount}
                        onChange={(e) => updatePayment(p.id, 'amount', e.target.value)}
                        placeholder="0.00"
                        dir="ltr"
                      />
                    </Field>
                    <Field label={DATE_LABEL[p.method]} required>
                      <Input type="date" value={p.date} onChange={(e) => updatePayment(p.id, 'date', e.target.value)} max={toInputDate()} />
                    </Field>
                    {p.method === '2' && (
                      <Field label="מספר המחאה" required>
                        <Input value={p.checkNumber} onChange={(e) => updatePayment(p.id, 'checkNumber', e.target.value)} placeholder="מספר המחאה" dir="ltr" />
                      </Field>
                    )}
                  </div>

                  {(p.method === '4' || p.method === '2') && (
                    <div className={`${styles.bankGrid} ${styles.sectionGap}`}>
                      <Field label="בנק">
                        <Input value={p.bankName} onChange={(e) => updatePayment(p.id, 'bankName', e.target.value)} placeholder="בנק" />
                      </Field>
                      <Field label="סניף">
                        <Input value={p.bankBranch} onChange={(e) => updatePayment(p.id, 'bankBranch', e.target.value)} placeholder="סניף" dir="ltr" inputMode="numeric" />
                      </Field>
                      <Field label="חשבון">
                        <Input
                          value={p.bankAccount}
                          onChange={(e) => updatePayment(p.id, 'bankAccount', e.target.value)}
                          onBlur={(e) => lookupByAccount(e.target.value)}
                          placeholder="חשבון"
                          dir="ltr"
                          inputMode="numeric"
                        />
                      </Field>
                    </div>
                  )}
                </div>
              ))}
            </CardBody>
          </Card>

          <Card>
            <CardBody>
              <Field label="הערות" hint="לא חובה">
                <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="הערות נוספות…" rows={2} />
              </Field>
            </CardBody>
          </Card>

          {msg.text && !msg.ok && <Alert tone="danger" onClose={() => setMsg({ text: '', ok: false })}>{msg.text}</Alert>}
          {lastReceipt && (
            <Alert tone="success" title={`קבלה מספר ${lastReceipt.docNumber} הופקה בהצלחה`} onClose={() => { setLastReceipt(null); setMsg({ text: '', ok: false }); }}>
              {msg.ok && msg.text && <div>{msg.text}</div>}
              {lastReceiptLink && <a href={lastReceiptLink} target="_blank" rel="noopener noreferrer">פתיחת הקבלה בלשונית חדשה</a>}
            </Alert>
          )}

          <Card className={styles.submitBar}>
            <div className={styles.total}>
              סה״כ לקבלה
              <span className={styles.totalValue}>{formatCurrency(totalAmount)}</span>
            </div>
            <Button type="submit" variant="primary" size="lg" icon="receipt" loading={loading}>
              {loading ? 'מפיק קבלה…' : 'הפקת קבלה'}
            </Button>
          </Card>
        </Stack>
      </form>
    </Stack>
  );
}
