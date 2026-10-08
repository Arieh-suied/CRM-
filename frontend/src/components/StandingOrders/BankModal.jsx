import { useState, useEffect } from 'react';
import styles from './StandingOrders.module.css';
import { fetchBankOrderDetail, updateBankOrder, setBankStatus, chargeBankOrder } from '../../services/api.js';
import { formatCurrency } from '../../lib/format.js';
import {
  Modal, SegmentedControl, InfoGrid, Field, Input, Select, Button, Badge, Alert, StateMessage,
  formStyles, useToast, useConfirm,
} from '../ui';

const STATUS_OPTIONS = [
  { value: '1',  label: 'הפעל הוראת קבע',          needsComment: false },
  { value: '7',  label: 'הקפא הוראת קבע',           needsComment: false },
  { value: '4',  label: 'הטופס נשלח לבנק',           needsComment: false },
  { value: '10', label: 'נדחה ע"י הבנק',            needsComment: true  },
  { value: '8',  label: 'הקפצה לחודש קודם',          needsComment: false },
  { value: '9',  label: 'דחה חודש קדימה',           needsComment: false },
];

const TABS = [
  { value: 'details', label: 'פרטים' },
  { value: 'edit', label: 'עריכה' },
  { value: 'status', label: 'שינוי סטטוס' },
  { value: 'charge', label: 'גביית תשלום' },
];

function TextField({ label, value, onChange, type = 'text', hint }) {
  return (
    <Field label={label} hint={hint}>
      <Input type={type} value={value ?? ''} onChange={(e) => onChange(e.target.value)} />
    </Field>
  );
}

export default function BankModal({ masavId, mosadNumber, onClose, onRefresh }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [data, setData]           = useState(null);
  const [loading, setLoading]     = useState(true);
  const [fetchErr, setFetchErr]   = useState('');
  const [tab, setTab]             = useState('details');
  const [editForm, setEditForm]   = useState({});
  const [chargeForm, setChargeForm] = useState({ amount: '', date: '' });
  const [statusNum, setStatusNum] = useState('');
  const [statusComment, setStatusComment] = useState('');
  const [saving, setSaving]       = useState(false);
  const [error, setError]         = useState('');

  const load = () => {
    setLoading(true); setFetchErr('');
    fetchBankOrderDetail(mosadNumber, masavId)
      .then((d) => {
        setData(d);
        setEditForm({
          ClientName:    d.ClientName    || '',
          ClientAdresse: d.ClientAdresse || '',
          ClientZeout:   d.ClientZeout   || '',
          ClientPhone:   d.ClientPhone   || '',
          ClientMail:    d.ClientMail    || '',
          NextDate:      d.NextDate      || '',
          Amount:        d.Amount        || '',
          Tashlumim:     d.Tashlumim     || '',
          Groupe:        d.Groupe        || '',
          Comments:      d.Comments      || '',
          Bank:          d.Bank          || '',
          Agency:        d.Agency        || '',
          Account:       d.Account       || '',
        });
      })
      .catch((e) => setFetchErr(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(load, [mosadNumber, masavId]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (key) => (val) => setEditForm((p) => ({ ...p, [key]: val }));

  const run = async (fn) => {
    setSaving(true); setError('');
    try { await fn(); } catch (e) { setError(e.message); }
    setSaving(false);
  };

  const handleSave = () => run(async () => {
    const r = await updateBankOrder(mosadNumber, masavId, editForm);
    if (r.Result !== 'OK') throw new Error(r.Message || 'שגיאה בשמירה');
    toast.success('השינויים נשמרו');
    load(); onRefresh();
  });

  const selectedStatus = STATUS_OPTIONS.find((o) => o.value === statusNum);

  const handleStatus = () => {
    if (!statusNum) return;
    if (selectedStatus?.needsComment && !statusComment.trim()) { setError('יש להזין סיבה'); return; }
    run(async () => {
      const r = await setBankStatus(mosadNumber, masavId, statusNum, statusComment);
      if (r.Result !== 'OK') throw new Error(r.Message || 'שגיאה');
      toast.success('הסטטוס עודכן');
      load(); onRefresh();
    });
  };

  const handleCharge = async () => {
    const ok = await confirm({
      title: 'גביית תשלום',
      message: `לגבות ${formatCurrency(chargeForm.amount)} מהחשבון של ${data?.ClientName ?? ''} בתאריך ${chargeForm.date}?`,
      confirmText: 'גבייה',
    });
    if (!ok) return;
    run(async () => {
      const r = await chargeBankOrder(mosadNumber, masavId, chargeForm.amount, chargeForm.date);
      if (r.Result !== 'OK') throw new Error(r.Message || 'שגיאה');
      toast.success('הגבייה נרשמה בהצלחה');
      onRefresh();
    });
  };

  const changeTab = (next) => { setTab(next); setError(''); };

  const footer = !data || tab === 'details' ? null : tab === 'edit' ? (
    <Button variant="primary" onClick={handleSave} loading={saving}>שמירת שינויים</Button>
  ) : tab === 'status' ? (
    <Button variant="primary" onClick={handleStatus} loading={saving} disabled={!statusNum}>עדכון סטטוס</Button>
  ) : (
    <Button variant="primary" icon="landmark" onClick={handleCharge} loading={saving} disabled={!chargeForm.amount || !chargeForm.date}>גביית תשלום</Button>
  );

  return (
    <Modal
      size="lg"
      title={data?.ClientName || 'הוראת קבע בנקאית'}
      subtitle={`הוראת קבע בנקאית · #${masavId}`}
      headerActions={data?.StatusText && <Badge tone="primary">{data.StatusText}</Badge>}
      onClose={onClose}
      footer={footer}
    >
      {loading && <StateMessage kind="loading" />}
      {!loading && fetchErr && (
        <StateMessage kind="error" description={fetchErr} action={<Button size="sm" icon="refresh" onClick={load}>נסה שוב</Button>} />
      )}

      {!loading && data && (
        <>
          <SegmentedControl options={TABS} value={tab} onChange={changeTab} className={styles.modalTabs} aria-label="אזורי הוראת הקבע" />
          {error && <Alert tone="danger" className={styles.formAlert} onClose={() => setError('')}>{error}</Alert>}

          {tab === 'details' && (
            <InfoGrid items={[
              ['שם לקוח', data.ClientName],
              ['ת.ז.', data.ClientZeout],
              ['כתובת', data.ClientAdresse],
              ['טלפון', data.ClientPhone],
              ['מייל', data.ClientMail],
              ['בנק', data.Bank],
              ['סניף', data.Agency],
              ['חשבון', data.Account],
              ['פרטי בנק', data.BankData],
              ['סכום חודשי', formatCurrency(data.Amount)],
              ['יום גבייה', data.NextDate],
              ['חיוב הבא', data.FullNextDate],
              ['יתרת חיובים', data.Tashlumim],
              ['קטגוריה', data.Groupe],
              ['הערה', data.Comments],
              ['סטטוס', data.StatusText],
              ['חתימה', data.AsSign === 'True' ? 'התקבלה' : 'לא התקבלה'],
            ]} />
          )}

          {tab === 'edit' && (
            <div className={formStyles.grid}>
              <TextField label="שם לקוח" value={editForm.ClientName} onChange={set('ClientName')} />
              <TextField label="ת.ז." value={editForm.ClientZeout} onChange={set('ClientZeout')} />
              <TextField label="כתובת" value={editForm.ClientAdresse} onChange={set('ClientAdresse')} />
              <TextField label="טלפון" value={editForm.ClientPhone} onChange={set('ClientPhone')} type="tel" />
              <TextField label="מייל" value={editForm.ClientMail} onChange={set('ClientMail')} type="email" />
              <TextField label="סכום חודשי" value={editForm.Amount} onChange={set('Amount')} type="number" />
              <TextField label="יום גבייה" hint="1 / 5 / 10 / 15 / 20 / 25 / 28" value={editForm.NextDate} onChange={set('NextDate')} />
              <TextField label="יתרת חיובים" value={editForm.Tashlumim} onChange={set('Tashlumim')} type="number" />
              <TextField label="בנק" value={editForm.Bank} onChange={set('Bank')} />
              <TextField label="סניף" value={editForm.Agency} onChange={set('Agency')} />
              <TextField label="חשבון" value={editForm.Account} onChange={set('Account')} />
              <TextField label="קטגוריה" value={editForm.Groupe} onChange={set('Groupe')} />
              <TextField label="הערה" value={editForm.Comments} onChange={set('Comments')} />
            </div>
          )}

          {tab === 'status' && (
            <div className={formStyles.grid}>
              <Field label="פעולה">
                <Select value={statusNum} onChange={(e) => { setStatusNum(e.target.value); setStatusComment(''); }}>
                  <option value="">בחר פעולה…</option>
                  {STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </Select>
              </Field>
              {selectedStatus?.needsComment && (
                <TextField label="סיבת הדחייה" value={statusComment} onChange={setStatusComment} />
              )}
            </div>
          )}

          {tab === 'charge' && (
            <>
              <div className={formStyles.grid}>
                <TextField label="סכום לחיוב (₪)" value={chargeForm.amount} onChange={(v) => setChargeForm((p) => ({ ...p, amount: v }))} type="number" />
                <TextField label="תאריך גבייה" hint="DD/MM/YYYY" value={chargeForm.date} onChange={(v) => setChargeForm((p) => ({ ...p, date: v }))} />
              </div>
              <p className={styles.note}>הגבייה תירשם בהיסטוריית הוראת הקבע, אבל לא תשפיע על יתרת החיובים או על תאריך הגבייה הבא.</p>
            </>
          )}
        </>
      )}
    </Modal>
  );
}
