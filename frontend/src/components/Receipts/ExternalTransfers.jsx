import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import styles from './ReceiptForms.module.css';
import { authFetch } from '../../services/api.js';
import { supabase } from '../../lib/supabase.js';
import { debounce } from '../../lib/debounce.js';
import { formatDateTime, formatCurrency } from '../../lib/format.js';
import { TRANSFER_INSTITUTIONS } from '../../constants/transferInstitutions.js';
import {
  Card, CardHeader, CardBody, CardFooter, Stack, Field, Input, Select, Suggestions, Button, Alert, Badge,
  StateMessage, formStyles, useToast, useConfirm,
} from '../ui';

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

const LTR_FIELDS = new Set(['id_number', 'email', 'phone', 'amount', 'transfer_date', 'asmachta', 'bank_branch', 'bank_account']);

function CustomerNameField({ id, value, onChange, onSelect, disabled }) {
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

  async function runSearch(q) {
    if (q.trim().length < 2) { setSuggestions([]); setShowSugg(false); return; }
    const { data } = await supabase.from('customers')
      .select('*')
      .or(`name.ilike.%${q}%,bank_account.ilike.%${q}%,id_number.ilike.%${q}%`)
      .limit(6);
    if (data?.length) { setSuggestions(data); setShowSugg(true); }
    else { setSuggestions([]); setShowSugg(false); }
  }
  const search = useMemo(() => debounce(runSearch, 300), []);

  return (
    <div ref={wrapRef} className={formStyles.suggestWrap}>
      <Input
        id={id}
        value={value}
        onChange={(e) => { onChange(e.target.value); search(e.target.value); }}
        onFocus={() => suggestions.length > 0 && setShowSugg(true)}
        disabled={disabled}
        autoComplete="off"
      />
      {showSugg && (
        <Suggestions
          items={suggestions}
          onSelect={(c) => { onSelect(c); setShowSugg(false); }}
          getTitle={(c) => c.name}
          getSub={(c) => [c.id_number, c.bank_account, c.email].filter(Boolean).join(' · ')}
        />
      )}
    </div>
  );
}

const AUTO_FILLED_HINT = 'מולא אוטומטית לפי לקוח קיים — אפשר לערוך';

export default function ExternalTransfers() {
  const toast = useToast();
  const confirm = useConfirm();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
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
    if (action === 'reject') {
      const ok = await confirm({
        title: 'דחיית הגשה',
        message: `לדחות את ההגשה של ${row._fields.customer_name || 'השולח'}? היא תוסר מהרשימה ולא תונפק לה קבלה.`,
        confirmText: 'דחייה',
        tone: 'danger',
      });
      if (!ok) return;
    }
    setBusyId(row.id);
    setError('');
    try {
      const res = await authFetch('/api/toldot-submissions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: row.id, action, fields: row._fields }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || 'שגיאה');
      if (action === 'approve' && data.docNumber) {
        toast.success(`קבלה מספר ${data.docNumber} הונפקה${data.institutionLabel ? ` (${data.institutionLabel})` : ''}`);
      } else if (action === 'reject') {
        toast.info('ההגשה נדחתה');
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
    <Stack>
      <div className={styles.queueHead}>
        <p className={styles.queueText}>
          {!loading && <><strong>{rows.length}</strong> הגשות ממתינות · </>}
          אישור מנפיק קבלה במוסד שנבחר ורושם את ההעברה במערכת.
        </p>
        <Button size="sm" icon="refresh" onClick={load} loading={loading}>רענון</Button>
      </div>

      {error && <Alert tone="danger" onClose={() => setError('')}>{error}</Alert>}

      {loading && !rows.length ? (
        <Card><StateMessage kind="loading" /></Card>
      ) : rows.length === 0 ? (
        <Card><StateMessage title="אין העברות שממתינות לאישור" description="הגשות חדשות מהדף הציבורי יופיעו כאן" icon="inbox" /></Card>
      ) : rows.map((row) => {
        const busy = busyId === row.id;
        return (
          <Card key={row.id}>
            <CardHeader
              title={row._fields.customer_name || 'הגשה ללא שם'}
              subtitle={`התקבלה ${formatDateTime(row.created_at)}`}
              actions={row._fields.amount && <Badge tone="success">{formatCurrency(Number(row._fields.amount))}</Badge>}
            />
            <CardBody>
              <div className={styles.submission}>
                {row.screenshot_url && (
                  <a href={row.screenshot_url} target="_blank" rel="noreferrer" className={styles.shot} title="פתיחת הצילום בגודל מלא">
                    <img src={row.screenshot_url} alt="צילום ההעברה" />
                  </a>
                )}
                <div className={formStyles.grid}>
                  {FIELDS.map(({ key, label, type }) => {
                    const autoFilled = (key === 'id_number' && !row.id_number && row.suggested_id_number)
                      || (key === 'email' && !row.email && row.suggested_email);
                    const fieldId = `ext-${row.id}-${key}`;
                    return (
                      <Field key={key} label={label} hint={autoFilled ? AUTO_FILLED_HINT : undefined} htmlFor={fieldId}>
                        {type === 'select' ? (
                          <Select id={fieldId} value={row._fields[key] ?? ''} onChange={(e) => setField(row.id, key, e.target.value)} disabled={busy}>
                            {TRANSFER_INSTITUTIONS.map((inst) => <option key={inst.id} value={inst.id}>{inst.label}</option>)}
                          </Select>
                        ) : type === 'autocomplete' ? (
                          <CustomerNameField
                            id={fieldId}
                            value={row._fields[key] ?? ''}
                            onChange={(v) => setField(row.id, key, v)}
                            onSelect={(c) => selectCustomer(row.id, c)}
                            disabled={busy}
                          />
                        ) : (
                          <Input
                            id={fieldId}
                            type={type}
                            dir={LTR_FIELDS.has(key) ? 'ltr' : undefined}
                            value={row._fields[key] ?? ''}
                            onChange={(e) => setField(row.id, key, e.target.value)}
                            disabled={busy}
                          />
                        )}
                      </Field>
                    );
                  })}
                </div>
              </div>
            </CardBody>
            <CardFooter>
              <Button variant="primary" icon="check" onClick={() => act(row, 'approve')} loading={busy}>
                {busy ? 'מנפיק…' : 'אישור והנפקת קבלה'}
              </Button>
              <Button variant="dangerSoft" icon="x" onClick={() => act(row, 'reject')} disabled={busy}>דחייה</Button>
            </CardFooter>
          </Card>
        );
      })}
    </Stack>
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
