import { useState, useEffect } from 'react';
import styles from './StandingOrders.module.css';
import { fetchStandingOrderDetail, updateCreditOrder, creditOrderAction, chargeCreditOrder } from '../../services/api.js';

const fmt = (n, cur = 'ILS') => {
  try { return new Intl.NumberFormat('he-IL', { style: 'currency', currency: cur, maximumFractionDigits: 2 }).format(n ?? 0); }
  catch { return `${n ?? 0}`; }
};

function parseExpiry(raw) {
  if (!raw) return '—';
  const s = String(raw);
  if (s.includes('/')) return s;       // already formatted (e.g. "2/04")
  if (s.length < 4) return s;
  return `${s.slice(0, 2)}/${s.slice(2, 4)}`;
}

const stripHtml = (s) => String(s ?? '').replace(/<[^>]*>/g, '').trim();

const KEVA_STATUS   = { '1': 'פעילה', '2': 'מוקפאת', '3': 'נמחקה' };
const KEVA_FREQ     = { '1': 'חודשי', '2': 'שבועי', '3': 'יזכור' };
const HIST_STATUS   = { '1': 'בוצע', '2': 'סירוב', '3': 'בוטלה' };

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

export default function CreditModal({ kevaId, mosadNumber, onClose, onRefresh }) {
  const [data, setData]         = useState(null);
  const [loading, setLoading]   = useState(true);
  const [fetchErr, setFetchErr] = useState('');
  const [tab, setTab]           = useState('details');
  const [editForm, setEditForm] = useState({});
  const [chargeForm, setChargeForm] = useState({ Currency: '1', JoinToKevaId: 'Join' });
  const [saving, setSaving]     = useState(false);
  const [msg, setMsg]           = useState({ text: '', ok: false });

  const load = () => {
    setLoading(true); setFetchErr('');
    fetchStandingOrderDetail(mosadNumber, kevaId)
      .then(d => {
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
      .catch(e => setFetchErr(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(load, [mosadNumber, kevaId]);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const set = (key) => (val) => setEditForm(p => ({ ...p, [key]: val }));

  const statusKey   = String(data?.KevaStatus ?? '');
  const isFrozen    = statusKey === '2';
  const isDeleted   = statusKey === '3';
  const currency    = data?.KevaCurrency === '2' ? 'USD' : 'ILS';
  const statusClass = statusKey === '1' ? styles.badgeActive : statusKey === '2' ? styles.badgeFrozen : styles.badgeDeleted;

  const showMsg = (text, ok) => setMsg({ text, ok });

  const handleSave = async () => {
    setSaving(true); setMsg({ text: '', ok: false });
    try {
      const r = await updateCreditOrder(mosadNumber, kevaId, editForm);
      if (r.Result === 'OK') { showMsg('נשמר בהצלחה', true); load(); onRefresh(); }
      else showMsg(r.Message || 'שגיאה בשמירה', false);
    } catch (e) { showMsg(e.message, false); }
    setSaving(false);
  };

  const handleAction = async (action) => {
    if (action === 'delete' && !window.confirm('האם למחוק את הוראת הקבע? פעולה זו אינה הפיכה.')) return;
    setSaving(true); setMsg({ text: '', ok: false });
    try {
      const r = await creditOrderAction(mosadNumber, kevaId, action);
      const ok = r.Result === 'OK';
      showMsg(ok ? 'בוצע בהצלחה' : (r.Message || r.Result || 'שגיאה'), ok);
      if (ok) { onRefresh(); if (action === 'delete') { setTimeout(onClose, 1000); } else load(); }
    } catch (e) { showMsg(e.message, false); }
    setSaving(false);
  };

  const handleCharge = async () => {
    setSaving(true); setMsg({ text: '', ok: false });
    try {
      const r = await chargeCreditOrder(mosadNumber, { KevaId: kevaId, ...chargeForm });
      const ok = r.Status === 'OK';
      showMsg(ok ? 'חיוב בוצע בהצלחה' : (r.Message || 'שגיאה בחיוב'), ok);
      if (ok) onRefresh();
    } catch (e) { showMsg(e.message, false); }
    setSaving(false);
  };

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={`הוראת קבע אשראי ${kevaId}`}>
        <button className={styles.modalClose} onClick={onClose} aria-label="סגור">✕</button>

        {loading && <p className={styles.placeholder}>טוען...</p>}
        {fetchErr && <p className={styles.errorMsg}>{fetchErr}</p>}

        {!loading && data && (
          <>
            <div className={styles.modalHeader}>
              <div>
                <h2 className={styles.modalName}>{data.KevaName ?? '—'}</h2>
                <span className={styles.modalId}>#{kevaId}</span>
              </div>
              <div className={styles.modalHeaderRight}>
                {!isDeleted && (
                  <button className={styles.actionBtn} onClick={() => handleAction(isFrozen ? 'enable' : 'disable')} disabled={saving}>
                    {isFrozen ? 'הפעל' : 'הקפא'}
                  </button>
                )}
                {!isDeleted && (
                  <button className={styles.dangerBtn} onClick={() => handleAction('delete')} disabled={saving}>מחק</button>
                )}
                <span className={`${styles.badge} ${statusClass}`}>{KEVA_STATUS[statusKey] ?? '—'}</span>
              </div>
            </div>

            {msg.text && <p className={msg.ok ? styles.successMsg : styles.errorMsg}>{msg.text}</p>}

            <div className={styles.modalTabs}>
              {['details', 'edit', 'charge'].map(t => (
                <button key={t} className={`${styles.modalTab} ${tab === t ? styles.modalTabActive : ''}`} onClick={() => { setTab(t); setMsg({ text: '', ok: false }); }}>
                  {t === 'details' ? 'פרטים' : t === 'edit' ? 'עריכה' : 'גבה תשלום'}
                </button>
              ))}
            </div>

            {tab === 'details' && (
              <>
                <div className={styles.infoGrid}>
                  <InfoRow label="ת.ז."         value={data.KevaZeout} />
                  <InfoRow label="כתובת"         value={[data.KevaAdresse, data.KevaCity].filter(Boolean).join(', ')} />
                  <InfoRow label="טלפון"         value={data.KevaPhone} />
                  <InfoRow label="מייל"          value={data.KevaMail} />
                  <InfoRow label="קטגוריה"       value={data.KevaGroupe} />
                  <InfoRow label="הערה"          value={data.KevaAvour} />
                  <InfoRow label="סכום חודשי"    value={fmt(data.KevaAmount, currency)} />
                  <InfoRow label="תדירות"        value={KEVA_FREQ[String(data.KevaFrequency)] ?? '—'} />
                  <InfoRow label="יתרת חיובים"   value={data.KevaTashlumim} />
                  <InfoRow label="חיובים בוצעו"  value={data.KevaSuccess} />
                  <InfoRow label="חיוב הבא"      value={data.KevaNextDate} />
                  <InfoRow label="תאריך הקמה"    value={data.CreatedDate} />
                  <InfoRow label="4 ספרות"       value={data.KevaLastNum ? `****${data.KevaLastNum}` : null} />
                  <InfoRow label="תוקף"          value={parseExpiry(data.KevaTokef)} />
                  <InfoRow label="סה״כ חויב"     value={fmt(data.TotalHistoryAmount, currency)} />
                  <InfoRow label="הערות מערכת"   value={data.KevaObservation} />
                </div>

                {data.HistoryData?.length > 0 && (
                  <div className={styles.historySection}>
                    <h3 className={styles.historyTitle}>היסטוריית חיובים ({data.HistoryCount})</h3>
                    <div className={styles.tableWrap}>
                      <table className={styles.table}>
                        <thead>
                          <tr><th>תאריך</th><th>סטטוס</th><th>סכום</th><th>על שם</th><th>כרטיס</th><th>מזהה</th></tr>
                        </thead>
                        <tbody>
                          {data.HistoryData.map((h, i) => {
                            const hs = String(h.ID ?? '');
                            return (
                              <tr key={i}>
                                <td className={styles.date}>{h.Date ?? '—'}</td>
                                <td className={hs === '1' ? styles.active : hs === '2' ? styles.error : styles.muted}>{HIST_STATUS[hs] ?? '—'}</td>
                                <td className={styles.amount}>{h.Amount ? fmt(parseFloat(stripHtml(h.Amount)), currency) : '—'}</td>
                                <td className={styles.muted}>{h.Name ?? '—'}</td>
                                <td className={styles.muted}>{h.LastNum ? `****${h.LastNum}` : '—'}</td>
                                <td className={styles.muted}>{h.TransactionId ?? '—'}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </>
            )}

            {tab === 'edit' && (
              <div className={styles.editSection}>
                <div className={styles.formGrid}>
                  <Field label="שם לקוח"   value={editForm.ClientName} onChange={set('ClientName')} />
                  <Field label="ת.ז."       value={editForm.Zeout}      onChange={set('Zeout')} />
                  <Field label="כתובת"      value={editForm.Adresse}    onChange={set('Adresse')} />
                  <Field label="עיר"        value={editForm.City}       onChange={set('City')} />
                  <Field label="טלפון"      value={editForm.Phone}      onChange={set('Phone')} />
                  <Field label="מייל"       value={editForm.Mail}       onChange={set('Mail')} type="email" />
                  <Field label="סכום (₪)"   value={editForm.Amount}     onChange={set('Amount')} type="number" />
                  <Field label="תדירות"     value={editForm.Frequency}  onChange={set('Frequency')}>
                    <select className={styles.fieldInput} value={editForm.Frequency} onChange={e => set('Frequency')(e.target.value)}>
                      <option value="1">חודשי</option>
                      <option value="2">שבועי</option>
                      <option value="3">יזכור</option>
                    </select>
                  </Field>
                  <Field label="תאריך חיוב הבא"  value={editForm.NextDate}   onChange={set('NextDate')} />
                  <Field label="יתרת חיובים"      value={editForm.Tashlumim} onChange={set('Tashlumim')} type="number" />
                  <Field label="קטגוריה"           value={editForm.Groupe}    onChange={set('Groupe')} />
                  <Field label="הערה"              value={editForm.Avour}     onChange={set('Avour')} />
                  <Field label="כרטיס (4 ספרות / מלא)" value={editForm.CreditCard} onChange={set('CreditCard')} />
                  <Field label="תוקף (MM/YY)"      value={editForm.Tokef}     onChange={set('Tokef')} />
                  <Field label="CVV"               value={editForm.CVV}       onChange={set('CVV')} />
                </div>
                <button className={styles.saveBtn} onClick={handleSave} disabled={saving}>
                  {saving ? 'שומר...' : 'שמור שינויים'}
                </button>
              </div>
            )}

            {tab === 'charge' && (
              <div className={styles.editSection}>
                <div className={styles.formGrid}>
                  <Field label="סכום לחיוב" value={chargeForm.Amount || ''} onChange={v => setChargeForm(p => ({ ...p, Amount: v }))} type="number" />
                  <Field label="מטבע" value={chargeForm.Currency} onChange={v => setChargeForm(p => ({ ...p, Currency: v }))}>
                    <select className={styles.fieldInput} value={chargeForm.Currency} onChange={e => setChargeForm(p => ({ ...p, Currency: e.target.value }))}>
                      <option value="1">שקל</option>
                      <option value="2">דולר</option>
                    </select>
                  </Field>
                  <Field label="תשלומים" value={chargeForm.Tashloumim || ''} onChange={v => setChargeForm(p => ({ ...p, Tashloumim: v }))} type="number" />
                  <Field label="קטגוריה" value={chargeForm.Groupe || ''} onChange={v => setChargeForm(p => ({ ...p, Groupe: v }))} />
                  <Field label="הערה" value={chargeForm.Comments || ''} onChange={v => setChargeForm(p => ({ ...p, Comments: v }))} />
                  <Field label="שיוך להוראת קבע" value={chargeForm.JoinToKevaId} onChange={v => setChargeForm(p => ({ ...p, JoinToKevaId: v }))}>
                    <select className={styles.fieldInput} value={chargeForm.JoinToKevaId} onChange={e => setChargeForm(p => ({ ...p, JoinToKevaId: e.target.value }))}>
                      <option value="Join">כן — ירשם בהיסטוריה</option>
                      <option value="NoJoin">לא — עסקה רגילה</option>
                    </select>
                  </Field>
                </div>
                <button className={styles.saveBtn} onClick={handleCharge} disabled={saving || !chargeForm.Amount}>
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
