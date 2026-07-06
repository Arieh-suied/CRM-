import { useState, useEffect } from 'react';
import styles from './StandingOrders.module.css';
import { fetchBankOrderDetail, updateBankOrder, setBankStatus, chargeBankOrder } from '../../services/api.js';

const fmt = (n) => {
  try { return new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS', maximumFractionDigits: 2 }).format(n ?? 0); }
  catch { return `${n ?? 0}`; }
};

function InfoRow({ label, value }) {
  if (value === null || value === undefined || value === '') return null;
  return (
    <div className={styles.infoRow}>
      <span className={styles.infoLabel}>{label}</span>
      <span className={styles.infoValue}>{value}</span>
    </div>
  );
}

function Field({ label, value, onChange, type = 'text', children }) {
  return (
    <div className={styles.fieldGroup}>
      <label className={styles.fieldLabel}>{label}</label>
      {children ?? <input className={styles.fieldInput} type={type} value={value ?? ''} onChange={e => onChange(e.target.value)} />}
    </div>
  );
}

const STATUS_OPTIONS = [
  { value: '1',  label: 'הפעל הוראת קבע',          needsComment: false },
  { value: '7',  label: 'הקפא הוראת קבע',           needsComment: false },
  { value: '4',  label: 'הטופס נשלח לבנק',           needsComment: false },
  { value: '10', label: 'נדחה ע"י הבנק',            needsComment: true  },
  { value: '8',  label: 'הקפצה לחודש קודם',          needsComment: false },
  { value: '9',  label: 'דחה חודש קדימה',           needsComment: false },
];

export default function BankModal({ masavId, mosadNumber, onClose, onRefresh }) {
  const [data, setData]           = useState(null);
  const [loading, setLoading]     = useState(true);
  const [fetchErr, setFetchErr]   = useState('');
  const [tab, setTab]             = useState('details');
  const [editForm, setEditForm]   = useState({});
  const [chargeForm, setChargeForm] = useState({ amount: '', date: '' });
  const [statusNum, setStatusNum] = useState('');
  const [statusComment, setStatusComment] = useState('');
  const [saving, setSaving]       = useState(false);
  const [msg, setMsg]             = useState({ text: '', ok: false });

  const load = () => {
    setLoading(true); setFetchErr('');
    fetchBankOrderDetail(mosadNumber, masavId)
      .then(d => {
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
      .catch(e => setFetchErr(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(load, [mosadNumber, masavId]);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const set = (key) => (val) => setEditForm(p => ({ ...p, [key]: val }));
  const showMsg = (text, ok) => setMsg({ text, ok });

  const handleSave = async () => {
    setSaving(true); setMsg({ text: '', ok: false });
    try {
      const r = await updateBankOrder(mosadNumber, masavId, editForm);
      if (r.Result === 'OK') { showMsg('נשמר בהצלחה', true); load(); onRefresh(); }
      else showMsg(r.Message || 'שגיאה בשמירה', false);
    } catch (e) { showMsg(e.message, false); }
    setSaving(false);
  };

  const handleStatus = async () => {
    if (!statusNum) return;
    const opt = STATUS_OPTIONS.find(o => o.value === statusNum);
    if (opt?.needsComment && !statusComment.trim()) { showMsg('יש להזין סיבה', false); return; }
    setSaving(true); setMsg({ text: '', ok: false });
    try {
      const r = await setBankStatus(mosadNumber, masavId, statusNum, statusComment);
      const ok = r.Result === 'OK';
      showMsg(ok ? 'הסטטוס עודכן בהצלחה' : (r.Message || 'שגיאה'), ok);
      if (ok) { load(); onRefresh(); }
    } catch (e) { showMsg(e.message, false); }
    setSaving(false);
  };

  const handleCharge = async () => {
    setSaving(true); setMsg({ text: '', ok: false });
    try {
      const r = await chargeBankOrder(mosadNumber, masavId, chargeForm.amount, chargeForm.date);
      const ok = r.Result === 'OK';
      showMsg(ok ? 'חיוב בוצע בהצלחה' : (r.Message || 'שגיאה'), ok);
      if (ok) onRefresh();
    } catch (e) { showMsg(e.message, false); }
    setSaving(false);
  };

  const selectedStatus = STATUS_OPTIONS.find(o => o.value === statusNum);

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={`הוראת קבע בנקאית ${masavId}`}>
        <button className={styles.modalClose} onClick={onClose} aria-label="סגור">✕</button>

        {loading && <p className={styles.placeholder}>טוען...</p>}
        {fetchErr && <p className={styles.errorMsg}>{fetchErr}</p>}

        {!loading && data && (
          <>
            <div className={styles.modalHeader}>
              <div>
                <h2 className={styles.modalName}>{data.ClientName ?? '—'}</h2>
                <span className={styles.modalId}>#{masavId}</span>
              </div>
              <span className={styles.badge} style={{ background: 'rgba(79,126,248,0.12)', color: 'var(--color-primary)' }}>
                {data.StatusText ?? '—'}
              </span>
            </div>

            {msg.text && <p className={msg.ok ? styles.successMsg : styles.errorMsg}>{msg.text}</p>}

            <div className={styles.modalTabs}>
              {['details', 'edit', 'status', 'charge'].map(t => (
                <button key={t} className={`${styles.modalTab} ${tab === t ? styles.modalTabActive : ''}`} onClick={() => { setTab(t); setMsg({ text: '', ok: false }); }}>
                  {t === 'details' ? 'פרטים' : t === 'edit' ? 'עריכה' : t === 'status' ? 'שינוי סטטוס' : 'גבה תשלום'}
                </button>
              ))}
            </div>

            {tab === 'details' && (
              <div className={styles.infoGrid}>
                <InfoRow label="שם לקוח"       value={data.ClientName} />
                <InfoRow label="ת.ז."           value={data.ClientZeout} />
                <InfoRow label="כתובת"          value={data.ClientAdresse} />
                <InfoRow label="טלפון"          value={data.ClientPhone} />
                <InfoRow label="מייל"           value={data.ClientMail} />
                <InfoRow label="בנק"            value={data.Bank} />
                <InfoRow label="סניף"           value={data.Agency} />
                <InfoRow label="חשבון"          value={data.Account} />
                <InfoRow label="פרטי בנק"       value={data.BankData} />
                <InfoRow label="סכום חודשי"     value={fmt(data.Amount)} />
                <InfoRow label="יום גביה"       value={data.NextDate} />
                <InfoRow label="חיוב הבא"       value={data.FullNextDate} />
                <InfoRow label="יתרת חיובים"    value={data.Tashlumim} />
                <InfoRow label="קטגוריה"        value={data.Groupe} />
                <InfoRow label="הערה"           value={data.Comments} />
                <InfoRow label="סטטוס"          value={data.StatusText} />
                <InfoRow label="חתימה"          value={data.AsSign === 'True' ? 'התקבל' : 'לא התקבל'} />
              </div>
            )}

            {tab === 'edit' && (
              <div className={styles.editSection}>
                <div className={styles.formGrid}>
                  <Field label="שם לקוח"       value={editForm.ClientName}    onChange={set('ClientName')} />
                  <Field label="ת.ז."           value={editForm.ClientZeout}   onChange={set('ClientZeout')} />
                  <Field label="כתובת"          value={editForm.ClientAdresse} onChange={set('ClientAdresse')} />
                  <Field label="טלפון"          value={editForm.ClientPhone}   onChange={set('ClientPhone')} />
                  <Field label="מייל"           value={editForm.ClientMail}    onChange={set('ClientMail')} type="email" />
                  <Field label="סכום חודשי"     value={editForm.Amount}        onChange={set('Amount')} type="number" />
                  <Field label="יום גביה (1/5/10/15/20/25/28)" value={editForm.NextDate} onChange={set('NextDate')} />
                  <Field label="יתרת חיובים"    value={editForm.Tashlumim}     onChange={set('Tashlumim')} type="number" />
                  <Field label="בנק"            value={editForm.Bank}          onChange={set('Bank')} />
                  <Field label="סניף"           value={editForm.Agency}        onChange={set('Agency')} />
                  <Field label="חשבון"          value={editForm.Account}       onChange={set('Account')} />
                  <Field label="קטגוריה"        value={editForm.Groupe}        onChange={set('Groupe')} />
                  <Field label="הערה"           value={editForm.Comments}      onChange={set('Comments')} />
                </div>
                <button className={styles.saveBtn} onClick={handleSave} disabled={saving}>
                  {saving ? 'שומר...' : 'שמור שינויים'}
                </button>
              </div>
            )}

            {tab === 'status' && (
              <div className={styles.editSection}>
                <div className={styles.formGrid}>
                  <Field label="פעולה">
                    <select className={styles.fieldInput} value={statusNum} onChange={e => { setStatusNum(e.target.value); setStatusComment(''); }}>
                      <option value="">בחר פעולה</option>
                      {STATUS_OPTIONS.map(o => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                  </Field>
                  {selectedStatus?.needsComment && (
                    <Field label="סיבת דחייה" value={statusComment} onChange={setStatusComment} />
                  )}
                </div>
                <button className={styles.saveBtn} onClick={handleStatus} disabled={saving || !statusNum}>
                  {saving ? 'מבצע...' : 'בצע'}
                </button>
              </div>
            )}

            {tab === 'charge' && (
              <div className={styles.editSection}>
                <div className={styles.formGrid}>
                  <Field label="סכום לחיוב (₪)" value={chargeForm.amount} onChange={v => setChargeForm(p => ({ ...p, amount: v }))} type="number" />
                  <Field label="תאריך גביה (DD/MM/YYYY)" value={chargeForm.date} onChange={v => setChargeForm(p => ({ ...p, date: v }))} />
                </div>
                <p className={styles.chargeNote}>הגבייה תרשם בהיסטוריית הוראת הקבע אך לא תשפיע על יתרת החיובים או תאריך הגביה הבא.</p>
                <button className={styles.saveBtn} onClick={handleCharge} disabled={saving || !chargeForm.amount || !chargeForm.date}>
                  {saving ? 'מבצע חיוב...' : 'גבה תשלום'}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
