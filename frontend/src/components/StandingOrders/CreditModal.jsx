import { useState, useEffect } from 'react';
import styles from './StandingOrders.module.css';
import { fetchStandingOrderDetail, updateCreditOrder, creditOrderAction, chargeCreditOrder } from '../../services/api.js';
import { formatCurrency } from '../../lib/format.js';
import {
  Modal, SegmentedControl, InfoGrid, Field, Input, Select, Button, Badge, Alert, StateMessage,
  Table, Card, formStyles, tableStyles as t, useToast, useConfirm,
} from '../ui';

function parseExpiry(raw) {
  if (!raw) return '—';
  const s = String(raw);
  if (s.includes('/')) return s;       // already formatted (e.g. "2/04")
  if (s.length < 4) return s;
  return `${s.slice(0, 2)}/${s.slice(2, 4)}`;
}

const stripHtml = (s) => String(s ?? '').replace(/<[^>]*>/g, '').trim();

const KEVA_STATUS = { '1': { label: 'פעילה', tone: 'success' }, '2': { label: 'מוקפאת', tone: 'warning' }, '3': { label: 'נמחקה', tone: 'danger' } };
const KEVA_FREQ   = { '1': 'חודשי', '2': 'שבועי', '3': 'יזכור' };
const HIST_STATUS = { '1': { label: 'בוצע', tone: 'success' }, '2': { label: 'סירוב', tone: 'danger' }, '3': { label: 'בוטלה', tone: 'neutral' } };

const TABS = [
  { value: 'details', label: 'פרטים' },
  { value: 'edit', label: 'עריכה' },
  { value: 'charge', label: 'גביית תשלום' },
];

function TextField({ label, value, onChange, type = 'text' }) {
  return (
    <Field label={label}>
      <Input type={type} value={value ?? ''} onChange={(e) => onChange(e.target.value)} />
    </Field>
  );
}

export default function CreditModal({ kevaId, mosadNumber, onClose, onRefresh }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [data, setData]         = useState(null);
  const [loading, setLoading]   = useState(true);
  const [fetchErr, setFetchErr] = useState('');
  const [tab, setTab]           = useState('details');
  const [editForm, setEditForm] = useState({});
  const [chargeForm, setChargeForm] = useState({ Currency: '1', JoinToKevaId: 'Join' });
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState('');

  const load = () => {
    setLoading(true); setFetchErr('');
    fetchStandingOrderDetail(mosadNumber, kevaId)
      .then((d) => {
        setData(d);
        setEditForm({
          ClientName: d.KevaName    || '',
          Zeout:      d.KevaZeout   || '',
          Adresse:    d.KevaAdresse || '',
          City:       d.KevaCity    || '',
          Phone:      d.KevaPhone   || '',
          Mail:       d.KevaMail    || '',
          Amount:     d.KevaAmount  || '',
          Frequency:  String(d.KevaFrequency || '1'),
          NextDate:   d.KevaNextDate || '',
          Tashlumim:  d.KevaTashlumim || '',
          Groupe:     d.KevaGroupe  || '',
          Avour:      d.KevaAvour   || '',
          CreditCard: d.KevaLastNum || '',
          Tokef:      d.KevaTokef ? parseExpiry(d.KevaTokef) : '',
          CVV:        '',
        });
      })
      .catch((e) => setFetchErr(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(load, [mosadNumber, kevaId]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (key) => (val) => setEditForm((p) => ({ ...p, [key]: val }));
  const setCharge = (key) => (val) => setChargeForm((p) => ({ ...p, [key]: val }));

  const statusKey = String(data?.KevaStatus ?? '');
  const status    = KEVA_STATUS[statusKey];
  const isFrozen  = statusKey === '2';
  const isDeleted = statusKey === '3';
  const currency  = data?.KevaCurrency === '2' ? 'USD' : 'ILS';

  const run = async (fn) => {
    setSaving(true); setError('');
    try { await fn(); } catch (e) { setError(e.message); }
    setSaving(false);
  };

  const handleSave = () => run(async () => {
    const r = await updateCreditOrder(mosadNumber, kevaId, editForm);
    if (r.Result !== 'OK') throw new Error(r.Message || 'שגיאה בשמירה');
    toast.success('השינויים נשמרו');
    load(); onRefresh();
  });

  const handleAction = async (action) => {
    if (action === 'delete') {
      const ok = await confirm({
        title: 'מחיקת הוראת קבע',
        message: `למחוק את הוראת הקבע של ${data?.KevaName ?? ''} (#${kevaId})?\nפעולה זו אינה הפיכה.`,
        confirmText: 'מחיקה',
        tone: 'danger',
      });
      if (!ok) return;
    }
    run(async () => {
      const r = await creditOrderAction(mosadNumber, kevaId, action);
      if (r.Result !== 'OK') throw new Error(r.Message || r.Result || 'שגיאה');
      onRefresh();
      if (action === 'delete') { toast.success('הוראת הקבע נמחקה'); onClose(); return; }
      toast.success(action === 'disable' ? 'הוראת הקבע הוקפאה' : 'הוראת הקבע הופעלה');
      load();
    });
  };

  const handleCharge = async () => {
    const chargeCurrency = chargeForm.Currency === '2' ? 'USD' : 'ILS';
    const card = data?.KevaLastNum ? ` מכרטיס ****${data.KevaLastNum}` : '';
    const ok = await confirm({
      title: 'גביית תשלום',
      message: `לחייב ${formatCurrency(chargeForm.Amount, chargeCurrency)}${card} עכשיו?`,
      confirmText: 'חיוב',
    });
    if (!ok) return;
    run(async () => {
      const r = await chargeCreditOrder(mosadNumber, { KevaId: kevaId, ...chargeForm });
      if (r.Status !== 'OK') throw new Error(r.Message || 'שגיאה בחיוב');
      toast.success('החיוב בוצע בהצלחה');
      onRefresh();
    });
  };

  const changeTab = (next) => { setTab(next); setError(''); };

  const footer = !data ? null : tab === 'details' ? (!isDeleted && (
    <>
      <Button variant="dangerSoft" icon="trash" onClick={() => handleAction('delete')} disabled={saving}>מחיקה</Button>
      <Button onClick={() => handleAction(isFrozen ? 'enable' : 'disable')} loading={saving}>
        {isFrozen ? 'הפעלה' : 'הקפאה'}
      </Button>
    </>
  )) : tab === 'edit' ? (
    <Button variant="primary" onClick={handleSave} loading={saving}>שמירת שינויים</Button>
  ) : (
    <Button variant="primary" icon="creditCard" onClick={handleCharge} loading={saving} disabled={!chargeForm.Amount}>גביית תשלום</Button>
  );

  return (
    <Modal
      size="lg"
      title={data?.KevaName || 'הוראת קבע באשראי'}
      subtitle={`הוראת קבע באשראי · #${kevaId}`}
      headerActions={status && <Badge tone={status.tone} dot>{status.label}</Badge>}
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
            <>
              <InfoGrid items={[
                ['ת.ז.', data.KevaZeout],
                ['כתובת', [data.KevaAdresse, data.KevaCity].filter(Boolean).join(', ')],
                ['טלפון', data.KevaPhone],
                ['מייל', data.KevaMail],
                ['קטגוריה', data.KevaGroupe],
                ['הערה', data.KevaAvour],
                ['סכום חודשי', formatCurrency(data.KevaAmount, currency)],
                ['תדירות', KEVA_FREQ[String(data.KevaFrequency)] ?? '—'],
                ['יתרת חיובים', data.KevaTashlumim],
                ['חיובים בוצעו', data.KevaSuccess],
                ['חיוב הבא', data.KevaNextDate],
                ['תאריך הקמה', data.CreatedDate],
                ['4 ספרות', data.KevaLastNum ? `****${data.KevaLastNum}` : null],
                ['תוקף', parseExpiry(data.KevaTokef)],
                ['סה״כ חויב', formatCurrency(data.TotalHistoryAmount, currency)],
                ['הערות מערכת', data.KevaObservation],
              ]} />

              {data.HistoryData?.length > 0 && (
                <>
                  <h3 className={styles.historyTitle}>היסטוריית חיובים ({data.HistoryCount})</h3>
                  <Card clip className={styles.historyCard}>
                    <Table stackOnMobile>
                      <thead>
                        <tr><th>תאריך</th><th>סטטוס</th><th>סכום</th><th>על שם</th><th>כרטיס</th><th>מזהה</th></tr>
                      </thead>
                      <tbody>
                        {data.HistoryData.map((h, i) => {
                          const hs = HIST_STATUS[String(h.ID ?? '')];
                          return (
                            <tr key={i}>
                              <td data-label="תאריך" className={t.date}>{h.Date ?? '—'}</td>
                              <td data-label="סטטוס">{hs ? <Badge tone={hs.tone}>{hs.label}</Badge> : '—'}</td>
                              <td data-label="סכום" className={t.amount}>{h.Amount ? formatCurrency(parseFloat(stripHtml(h.Amount)), currency) : '—'}</td>
                              <td data-label="על שם" className={t.muted}>{h.Name ?? '—'}</td>
                              <td data-label="כרטיס" className={t.mono}>{h.LastNum ? `****${h.LastNum}` : '—'}</td>
                              <td data-label="מזהה" className={t.mono}>{h.TransactionId ?? '—'}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </Table>
                  </Card>
                </>
              )}
            </>
          )}

          {tab === 'edit' && (
            <div className={formStyles.grid}>
              <TextField label="שם לקוח" value={editForm.ClientName} onChange={set('ClientName')} />
              <TextField label="ת.ז." value={editForm.Zeout} onChange={set('Zeout')} />
              <TextField label="כתובת" value={editForm.Adresse} onChange={set('Adresse')} />
              <TextField label="עיר" value={editForm.City} onChange={set('City')} />
              <TextField label="טלפון" value={editForm.Phone} onChange={set('Phone')} type="tel" />
              <TextField label="מייל" value={editForm.Mail} onChange={set('Mail')} type="email" />
              <TextField label="סכום (₪)" value={editForm.Amount} onChange={set('Amount')} type="number" />
              <Field label="תדירות">
                <Select value={editForm.Frequency} onChange={(e) => set('Frequency')(e.target.value)}>
                  <option value="1">חודשי</option>
                  <option value="2">שבועי</option>
                  <option value="3">יזכור</option>
                </Select>
              </Field>
              <TextField label="תאריך חיוב הבא" value={editForm.NextDate} onChange={set('NextDate')} />
              <TextField label="יתרת חיובים" value={editForm.Tashlumim} onChange={set('Tashlumim')} type="number" />
              <TextField label="קטגוריה" value={editForm.Groupe} onChange={set('Groupe')} />
              <TextField label="הערה" value={editForm.Avour} onChange={set('Avour')} />
              <TextField label="כרטיס (4 ספרות / מלא)" value={editForm.CreditCard} onChange={set('CreditCard')} />
              <TextField label="תוקף (MM/YY)" value={editForm.Tokef} onChange={set('Tokef')} />
              <TextField label="CVV" value={editForm.CVV} onChange={set('CVV')} />
            </div>
          )}

          {tab === 'charge' && (
            <div className={formStyles.grid}>
              <TextField label="סכום לחיוב" value={chargeForm.Amount || ''} onChange={setCharge('Amount')} type="number" />
              <Field label="מטבע">
                <Select value={chargeForm.Currency} onChange={(e) => setCharge('Currency')(e.target.value)}>
                  <option value="1">שקל</option>
                  <option value="2">דולר</option>
                </Select>
              </Field>
              <TextField label="תשלומים" value={chargeForm.Tashloumim || ''} onChange={setCharge('Tashloumim')} type="number" />
              <TextField label="קטגוריה" value={chargeForm.Groupe || ''} onChange={setCharge('Groupe')} />
              <TextField label="הערה" value={chargeForm.Comments || ''} onChange={setCharge('Comments')} />
              <Field label="שיוך להוראת קבע">
                <Select value={chargeForm.JoinToKevaId} onChange={(e) => setCharge('JoinToKevaId')(e.target.value)}>
                  <option value="Join">כן — ירשם בהיסטוריה</option>
                  <option value="NoJoin">לא — עסקה רגילה</option>
                </Select>
              </Field>
            </div>
          )}
        </>
      )}
    </Modal>
  );
}
