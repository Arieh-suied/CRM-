import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import styles from './Funds.module.css';
import { authFetch } from '../../services/api.js';
import { formatCurrency, toInputDate } from '../../lib/format.js';
import {
  Card, CardBody, CardFooter, Stack, SegmentedControl, Field, Input, Select, Button, Alert, formStyles, useToast,
} from '../ui';

const DEFAULT_DESCRIPTION = 'בוצע העברה';

const DIRECTIONS = [
  { value: 'transfer', label: 'העברה לנתמך', icon: 'arrowLeftRight' },
  { value: 'donation', label: 'תרומה שהתקבלה (מזומן / העברה ידנית)', icon: 'plus' },
];

// DD/MM/YYYY, matching how the row will actually be written to the sheet.
function formatDmy(isoDate) {
  const [y, m, d] = isoDate.split('-');
  return `${d}/${m}/${y}`;
}

export default function FundTransferForm() {
  const toast = useToast();
  const [funds, setFunds]     = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [direction, setDirection]   = useState('transfer');
  const [fundId, setFundId]         = useState('');
  const [date, setDate]             = useState(() => toInputDate());
  const [description, setDescription] = useState(DEFAULT_DESCRIPTION);
  const [amount, setAmount]         = useState('');
  const [saving, setSaving]         = useState(false);
  const [error, setError]           = useState('');
  const amountRef = useRef(null);

  const isDonation = direction === 'donation';

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const res = await authFetch('/api/funds');
      if (!res.ok) throw new Error('load failed');
      const data = await res.json();
      setFunds(Array.isArray(data) ? data : []);
    } catch {
      setLoadError('שגיאה בטעינת הקרנות. נסה לרענן את הדף.');
      setFunds([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const changeDirection = (dir) => {
    setDirection(dir);
    // "transfer" always writes the same fixed label; "donation" needs the
    // donor's actual name, so don't carry the fixed label over as a default.
    setDescription(dir === 'transfer' ? DEFAULT_DESCRIPTION : '');
  };

  const selectedFundName = useMemo(
    () => funds.find((f) => f.id === fundId)?.name ?? '',
    [funds, fundId]
  );

  const validAmount = Number(amount) > 0;
  const validDescription = isDonation ? description.trim().length > 0 : true;
  const canSubmit = fundId && validAmount && validDescription;

  const submit = async (e) => {
    e.preventDefault();
    if (!canSubmit) return;

    setSaving(true);
    setError('');
    try {
      const res = await authFetch('/api/fund-transfer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fundId, date, description, amount: Number(amount), direction }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || 'שגיאה ברישום');
      const verb = isDonation ? 'נרשמה תרומה' : 'נרשמה העברה';
      toast.success(`${verb} של ${formatCurrency(Number(amount))} בקרן "${data.fundName}"`);
      setAmount('');
      setDate(toInputDate());
      if (isDonation) setDescription('');
      amountRef.current?.focus();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Stack>
      <div>
        <SegmentedControl options={DIRECTIONS} value={direction} onChange={changeDirection} aria-label="סוג התנועה" />
      </div>

      {loadError && <Alert tone="danger">{loadError}</Alert>}

      <Card as="form" onSubmit={submit} className={styles.formCard}>
        <CardBody>
          {error && <Alert tone="danger" className={styles.mb} onClose={() => setError('')}>{error}</Alert>}
          <div className={formStyles.grid2}>
            <Field label="קרן" required className={formStyles.full}>
              <Select value={fundId} onChange={(e) => setFundId(e.target.value)} required>
                <option value="" disabled>{loading ? 'טוען…' : 'בחר קרן…'}</option>
                {funds.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
              </Select>
            </Field>
            <Field label="תאריך" required>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
            </Field>
            <Field label="סכום (₪)" required>
              <Input
                ref={amountRef}
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0"
                placeholder="0"
                dir="ltr"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                required
              />
            </Field>
            <Field label={isDonation ? 'שם התורם' : 'תיאור (יופיע בגיליון)'} required={isDonation} className={formStyles.full}>
              <Input
                placeholder={isDonation ? 'שם התורם' : ''}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                required={isDonation}
              />
            </Field>
          </div>

          {fundId && validAmount && (
            <p className={styles.preview}>
              {isDonation ? 'יתווסף' : 'ייכתב'} בגיליון של <strong>{selectedFundName}</strong>:{' '}
              {formatDmy(date)} · {description || DEFAULT_DESCRIPTION} · <strong dir="ltr">{isDonation ? '+' : '-'}{formatCurrency(Number(amount))}</strong>
            </p>
          )}
        </CardBody>
        <CardFooter>
          <Button type="submit" variant="primary" icon="check" loading={saving} disabled={loading || !canSubmit}>
            {isDonation ? 'רישום התרומה' : 'רישום ההעברה'}
          </Button>
        </CardFooter>
      </Card>
    </Stack>
  );
}
