import { useState, useEffect, useCallback } from 'react';
import styles from './Funds.module.css';
import { authFetch } from '../../services/api.js';
import { useAuth } from '../../contexts/AuthContext.jsx';
import {
  Card, CardHeader, CardBody, CardFooter, Stack, Field, Input, Select, Checkbox, Button, IconButton, Alert,
  StateMessage, Table, Toolbar, ToolbarSpacer, ToolbarMeta, buttonClass, formStyles, tableStyles as t, useToast,
} from '../ui';

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

// Balance comes from cell A1 of the fund's sheet as display text ("-450 ₪").
const isNegative = (balance) => /[-−]/.test(String(balance ?? ''));

export default function FundsManagement() {
  const { role } = useAuth();
  const toast = useToast();
  const isAdmin = role === 'admin';
  const [funds, setFunds]       = useState([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving]     = useState(false);
  const [formError, setFormError] = useState('');

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
    setFormError('');
  };

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setFormError('');
    try {
      const res = await authFetch('/api/funds', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
      toast.success(`הקרן "${data.name}" נוצרה`);
      resetForm();
      setShowForm(false);
      load();
    } catch (err) {
      setFormError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Stack>
      {showForm && (
        <Card as="form" onSubmit={submit}>
          <CardHeader title="קרן חדשה" subtitle="עסקאות שעומדות בכל התנאים ינותבו לגיליון של הקרן" />
          <CardBody>
            {formError && <Alert tone="danger" className={styles.mb} onClose={() => setFormError('')}>{formError}</Alert>}
            <div className={formStyles.grid}>
              <Field label="שם הקרן" required>
                <Input value={name} onChange={(e) => setName(e.target.value)} required />
              </Field>
              <Field label="עמודה נוספת קבועה" hint='לא חובה, למשל "הו"ק"'>
                <Input value={extraLiteral} onChange={(e) => setExtraLiteral(e.target.value)} />
              </Field>
              <Field label="אחוז עמלה" hint="לא חובה, למשל 3">
                <Input type="number" step="0.1" value={feePct} onChange={(e) => setFeePct(e.target.value)} dir="ltr" />
              </Field>
              <Field label='מכפיל מע"מ' hint="ברירת מחדל 1.17">
                <Input type="number" step="0.01" value={feeMult} onChange={(e) => setFeeMult(e.target.value)} dir="ltr" />
              </Field>
            </div>

            <h4 className={styles.subTitle}>תנאי ניתוב</h4>
            <p className={styles.hint}>עסקה תיכנס לקרן רק אם <strong>כל</strong> התנאים מתקיימים.</p>
            {conditions.map((c, i) => (
              <div key={i} className={styles.condition}>
                <Select value={c.field} onChange={(e) => updateCondition(i, { field: e.target.value })} aria-label="שדה">
                  {FIELD_OPTIONS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
                </Select>
                <Select value={c.op} onChange={(e) => updateCondition(i, { op: e.target.value })} aria-label="תנאי">
                  {OP_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </Select>
                <Input placeholder="ערך" aria-label="ערך" value={c.value} onChange={(e) => updateCondition(i, { value: e.target.value })} required />
                {conditions.length > 1 ? (
                  <IconButton icon="trash" label="הסרת התנאי" onClick={() => setConditions((prev) => prev.filter((_, idx) => idx !== i))} />
                ) : <span />}
              </div>
            ))}
            <Button size="sm" variant="ghost" icon="plus" onClick={() => setConditions((prev) => [...prev, emptyCondition()])}>
              תנאי נוסף (וגם)
            </Button>

            <h4 className={styles.subTitle}>גיליון Google Sheets</h4>
            <Checkbox checked={createSheet} onChange={(e) => setCreateSheet(e.target.checked)} label="יצירת גיליון חדש אוטומטית (מהתבנית)" />
            {!createSheet && (
              <div className={`${formStyles.grid} ${styles.mt}`}>
                <Field label="Spreadsheet ID קיים" required>
                  <Input value={spreadsheetId} onChange={(e) => setSpreadsheetId(e.target.value)} required={!createSheet} dir="ltr" />
                </Field>
                <Field label="שם הטאב" required>
                  <Input value={sheetName} onChange={(e) => setSheetName(e.target.value)} required={!createSheet} />
                </Field>
              </div>
            )}
          </CardBody>
          <CardFooter>
            <Button type="submit" variant="primary" icon="check" loading={saving} disabled={!isAdmin}>יצירת הקרן</Button>
            <Button variant="ghost" onClick={() => { setShowForm(false); resetForm(); }}>ביטול</Button>
            {!isAdmin && <span className={styles.hint}>רק מנהל יכול ליצור קרן חדשה</span>}
          </CardFooter>
        </Card>
      )}

      <Card clip>
        <Toolbar>
          <ToolbarMeta>{loading ? 'טוען…' : `${funds.length} קרנות`}</ToolbarMeta>
          <ToolbarSpacer />
          <Button icon="refresh" onClick={load} loading={loading}>רענון יתרות</Button>
          {!showForm && <Button variant="primary" icon="plus" onClick={() => setShowForm(true)}>קרן חדשה</Button>}
        </Toolbar>
        {loading && !funds.length ? (
          <StateMessage kind="loading" />
        ) : error ? (
          <StateMessage kind="error" description={error} action={<Button size="sm" icon="refresh" onClick={load}>נסה שוב</Button>} />
        ) : funds.length === 0 ? (
          <StateMessage title="אין קרנות מוגדרות עדיין" description="קרן חדשה מנתבת עסקאות לגיליון משלה" icon="coins" />
        ) : (
          <Table stackOnMobile busy={loading}>
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
                  <td data-label="קרן" className={t.strong}>{f.name}</td>
                  <td data-label="יתרה" className={f.balanceError ? t.danger : isNegative(f.balance) ? `${t.num} ${t.danger}` : t.amount}>
                    {f.balanceError ? 'לא נטענה' : (f.balance ?? '—')}
                  </td>
                  <td data-label="גיליון">
                    <a href={f.sheetUrl} target="_blank" rel="noreferrer" className={buttonClass({ variant: 'ghost', size: 'sm' })}>
                      פתיחת הגיליון
                    </a>
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
