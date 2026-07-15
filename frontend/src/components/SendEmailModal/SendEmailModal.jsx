import { useState, useEffect } from 'react';
import styles from './SendEmailModal.module.css';
import { fetchEmailTemplate, sendDonorEmail } from '../../services/api.js';
import { fillTemplate, DEFAULT_TEMPLATE } from '../../lib/emailTemplate.js';

// Manual "send email to donor" modal — prefilled from the transaction's
// institution template (or a generic default when the mosad has none),
// everything editable, with an explicit confirm step before sending.
export default function SendEmailModal({ tx, institutionName, onClose }) {
  const [to, setTo]           = useState(tx.email || '');
  const [subject, setSubject] = useState('');
  const [body, setBody]       = useState('');
  const [loading, setLoading] = useState(true);
  const [confirming, setConfirming] = useState(false);
  const [sending, setSending] = useState(false);
  const [msg, setMsg]         = useState(null); // { text, ok }

  useEffect(() => {
    const fundName = tx.group_name || institutionName || '';
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
  }, [tx, institutionName]);

  useEffect(() => {
    function handleKey(e) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  async function send() {
    setSending(true);
    setMsg(null);
    try {
      await sendDonorEmail({ transactionId: tx.id, to, subject, body });
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

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="שליחת מייל לתורם">
        <div className={styles.header}>
          <span className={styles.title}>שליחת מייל — {tx.client_name || 'תורם'}</span>
          <button className={styles.closeBtn} onClick={onClose} aria-label="סגור">✕</button>
        </div>

        <div className={styles.body}>
          {loading ? (
            <div className={styles.loading}>טוען תבנית…</div>
          ) : (
            <>
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
      </div>
    </div>
  );
}
