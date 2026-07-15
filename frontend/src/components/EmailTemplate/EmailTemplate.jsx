import { useState, useEffect, useRef } from 'react';
import styles from './EmailTemplate.module.css';
import { useAuth } from '../../contexts/AuthContext.jsx';
import { fetchEmailTemplate, saveEmailTemplate } from '../../services/api.js';
import { fillTemplate, PLACEHOLDERS } from '../../lib/emailTemplate.js';

// Sample transaction for the live preview
const SAMPLE_TX = {
  client_name: 'ישראל ישראלי',
  amount: 180,
  currency: 'ILS',
  group_name: 'קרן לדוגמה',
  transaction_time_raw: '15/07/2026 10:30',
};

const CAN_EDIT = new Set(['admin', 'editor']);

export default function EmailTemplate() {
  const { role } = useAuth();
  const canEdit = CAN_EDIT.has(role);

  const [subject, setSubject]   = useState('');
  const [body, setBody]         = useState('');
  const [autoSend, setAutoSend] = useState(false);
  const [meta, setMeta]         = useState(null);
  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState(false);
  const [msg, setMsg]           = useState(null); // { text, ok }
  const bodyRef = useRef(null);

  useEffect(() => {
    fetchEmailTemplate()
      .then((tpl) => {
        setSubject(tpl.subject || '');
        setBody(tpl.body || '');
        setAutoSend(Boolean(tpl.auto_send));
        setMeta({ updated_by: tpl.updated_by, updated_at: tpl.updated_at });
      })
      .catch((e) => setMsg({ text: `שגיאה בטעינת התבנית: ${e.message}`, ok: false }))
      .finally(() => setLoading(false));
  }, []);

  function insertPlaceholder(ph) {
    const el = bodyRef.current;
    if (!el) return setBody((prev) => prev + ph);
    const start = el.selectionStart ?? body.length;
    const end = el.selectionEnd ?? body.length;
    const next = body.slice(0, start) + ph + body.slice(end);
    setBody(next);
    requestAnimationFrame(() => {
      el.focus();
      el.selectionStart = el.selectionEnd = start + ph.length;
    });
  }

  async function save() {
    setSaving(true);
    setMsg(null);
    try {
      const saved = await saveEmailTemplate({ subject, body, auto_send: autoSend });
      setMeta({ updated_by: saved.updated_by, updated_at: saved.updated_at });
      setMsg({ text: 'התבנית נשמרה בהצלחה', ok: true });
    } catch (e) {
      setMsg({ text: `השמירה נכשלה: ${e.message}`, ok: false });
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className={styles.loading}>טוען תבנית…</div>;

  const previewSubject = fillTemplate(subject, SAMPLE_TX);
  const previewBody = fillTemplate(body, SAMPLE_TX);

  return (
    <div className={styles.wrapper}>
      <div className={styles.editor}>
        <h2 className={styles.heading}>תבנית מייל תודה לתורם</h2>
        <p className={styles.hint}>
          המייל נשלח מהכתובת som.noflim@gmail.com. אפשר לשלב משתנים שיוחלפו
          אוטומטית בפרטי התורם:
        </p>
        <div className={styles.chips}>
          {PLACEHOLDERS.map((ph) => (
            <button
              key={ph}
              type="button"
              className={styles.chip}
              onClick={() => insertPlaceholder(ph)}
              disabled={!canEdit}
            >
              {ph}
            </button>
          ))}
        </div>

        <label className={styles.label}>
          נושא
          <input
            className={styles.input}
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            disabled={!canEdit}
            dir="rtl"
          />
        </label>

        <label className={styles.label}>
          תוכן ההודעה
          <textarea
            ref={bodyRef}
            className={styles.textarea}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={10}
            disabled={!canEdit}
            dir="rtl"
          />
        </label>

        <label className={styles.toggleRow}>
          <input
            type="checkbox"
            checked={autoSend}
            onChange={(e) => setAutoSend(e.target.checked)}
            disabled={!canEdit}
          />
          <span>
            שליחה אוטומטית לכל תורם חדש
            <span className={styles.toggleWarn}>
              {' '}— כשמופעל, כל עסקה חדשה עם כתובת מייל תקבל את המייל הזה מיד
            </span>
          </span>
        </label>

        {canEdit && (
          <button className={styles.saveBtn} onClick={save} disabled={saving}>
            {saving ? 'שומר…' : 'שמור תבנית'}
          </button>
        )}

        {msg && (
          <div className={msg.ok ? styles.msgOk : styles.msgErr}>{msg.text}</div>
        )}

        {meta?.updated_at && (
          <div className={styles.meta}>
            עודכן לאחרונה: {new Date(meta.updated_at).toLocaleString('he-IL')}
            {meta.updated_by ? ` על ידי ${meta.updated_by}` : ''}
          </div>
        )}
      </div>

      <div className={styles.preview}>
        <h3 className={styles.previewTitle}>תצוגה מקדימה</h3>
        <div className={styles.previewCard}>
          <div className={styles.previewSubject}>{previewSubject || '(ללא נושא)'}</div>
          <div className={styles.previewFrom}>מאת: סומך נופלים &lt;som.noflim@gmail.com&gt;</div>
          <div className={styles.previewBody} dir="rtl">
            {previewBody.split('\n').map((line, i) => (
              <span key={i}>
                {line}
                <br />
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
