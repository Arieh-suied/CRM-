import { useState, useEffect } from 'react';
import styles from './SendEmailModal.module.css';
import { fetchEmailTemplate, sendDonorEmail, searchDonors } from '../../services/api.js';
import { fillTemplate, DEFAULT_TEMPLATE } from '../../lib/emailTemplate.js';

// Manual "send email to donor" modal. Two entry points:
//   - with `tx`   (transactions table row) — straight to compose
//   - without `tx` (template tab)          — donor search step first; picking a
//     donor uses their latest transaction so placeholders and the mosad
//     template match their most recent donation.
// Compose is prefilled from the transaction's institution template (generic
// default when the mosad has none), everything editable, confirm before send.
export default function SendEmailModal({ tx: initialTx = null, institutionName, institutions = [], onClose }) {
  const [tx, setTx]           = useState(initialTx);
  const [to, setTo]           = useState(initialTx?.email || '');
  const [subject, setSubject] = useState('');
  const [body, setBody]       = useState('');
  const [loading, setLoading] = useState(Boolean(initialTx));
  const [confirming, setConfirming] = useState(false);
  const [sending, setSending] = useState(false);
  const [msg, setMsg]         = useState(null); // { text, ok }

  // Donor-search step (only when opened without a transaction)
  const [query, setQuery]     = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);

  const institutionMap = Object.fromEntries(
    institutions.map((i) => [i.mosad_number, i.mosad_name])
  );

  useEffect(() => {
    if (!tx) return;
    setLoading(true);
    const instName = institutionName || institutionMap[tx.mosad_number] || '';
    const fundName = tx.group_name || instName;
    const prefill = (tpl) => {
      setSubject(fillTemplate(tpl.subject, tx, fundName));
      setBody(fillTemplate(tpl.body, tx, fundName));
    };
    if (!tx.mosad_number) {
      prefill(DEFAULT_TEMPLATE);
      setLoading(false);
      return;
    }
    fetchEmailTemplate(tx.mosad_number)
      .then((tpl) => prefill(tpl || DEFAULT_TEMPLATE))
      .catch(() => prefill(DEFAULT_TEMPLATE))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tx]);

  // Debounced donor search
  useEffect(() => {
    if (tx || query.trim().length < 2) {
      setResults([]);
      return;
    }
    setSearching(true);
    const t = setTimeout(() => {
      searchDonors(query.trim())
        .then((rows) => setResults(Array.isArray(rows) ? rows : []))
        .catch(() => setResults([]))
        .finally(() => setSearching(false));
    }, 300);
    return () => clearTimeout(t);
  }, [query, tx]);

  useEffect(() => {
    function handleKey(e) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  function pickDonor(donor) {
    setTx(donor);
    setTo(donor.email || '');
    setMsg(null);
  }

  async function send() {
    setSending(true);
    setMsg(null);
    try {
      await sendDonorEmail({ transactionId: tx?.id, to, subject, body });
      setMsg({ text: `המייל נשלח בהצלחה אל ${to}`, ok: true });
      setConfirming(false);
    } catch (e) {
      setMsg({ text: e.message, ok: false });
      setConfirming(false);
    } finally {
      setSending(false);
    }
  }

  const canSend = to.trim().includes('@') && subject.trim() && body.trim();
  const searchStep = !tx;

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="שליחת מייל לתורם">
        <div className={styles.header}>
          <span className={styles.title}>
            {searchStep ? 'שליחת מייל לתורם' : `שליחת מייל — ${tx.client_name || 'תורם'}`}
          </span>
          <button className={styles.closeBtn} onClick={onClose} aria-label="סגור">✕</button>
        </div>

        <div className={styles.body}>
          {searchStep ? (
            <>
              <label className={styles.label}>
                חיפוש תורם (שם, מייל או טלפון)
                <input
                  className={styles.input}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="לפחות 2 תווים…"
                  dir="rtl"
                  autoFocus
                />
              </label>
              {searching && <div className={styles.searchHint}>מחפש…</div>}
              {!searching && query.trim().length >= 2 && results.length === 0 && (
                <div className={styles.searchHint}>לא נמצאו תורמים עם כתובת מייל</div>
              )}
              <div className={styles.results}>
                {results.map((d) => (
                  <button key={d.id} type="button" className={styles.resultRow} onClick={() => pickDonor(d)}>
                    <span className={styles.resultName}>{d.client_name || '—'}</span>
                    <span className={styles.resultEmail} dir="ltr">{d.email}</span>
                    <span className={styles.resultMeta}>
                      {institutionMap[d.mosad_number] || d.mosad_number || ''}
                      {d.transaction_time_raw ? ` · ${d.transaction_time_raw}` : ''}
                    </span>
                  </button>
                ))}
              </div>
            </>
          ) : loading ? (
            <div className={styles.loading}>טוען תבנית…</div>
          ) : (
            <>
              {!initialTx && (
                <button type="button" className={styles.backBtn} onClick={() => { setTx(null); setMsg(null); }}>
                  ‹ החלף תורם
                </button>
              )}
              <label className={styles.label}>
                אל
                <input
                  className={styles.input}
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                  dir="ltr"
                />
              </label>
              <label className={styles.label}>
                נושא
                <input
                  className={styles.input}
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  dir="rtl"
                />
              </label>
              <label className={styles.label}>
                תוכן ההודעה
                <textarea
                  className={styles.textarea}
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  rows={9}
                  dir="rtl"
                />
              </label>
            </>
          )}

          {msg && <div className={msg.ok ? styles.msgOk : styles.msgErr}>{msg.text}</div>}
        </div>

        {!searchStep && (
          <div className={styles.footer}>
            {confirming ? (
              <>
                <span className={styles.confirmText}>לשלוח את המייל אל {to}?</span>
                <button className={styles.sendBtn} onClick={send} disabled={sending}>
                  {sending ? 'שולח…' : 'כן, שלח'}
                </button>
                <button className={styles.cancelBtn} onClick={() => setConfirming(false)} disabled={sending}>
                  ביטול
                </button>
              </>
            ) : msg?.ok ? (
              <button className={styles.cancelBtn} onClick={onClose}>סגור</button>
            ) : (
              <>
                <button
                  className={styles.sendBtn}
                  onClick={() => setConfirming(true)}
                  disabled={loading || !canSend}
                >
                  שלח
                </button>
                <button className={styles.cancelBtn} onClick={onClose}>ביטול</button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
