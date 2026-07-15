import { useState, useEffect, useRef } from 'react';
import styles from './EmailTemplate.module.css';
import { useAuth } from '../../contexts/AuthContext.jsx';
import { fetchEmailTemplates, saveEmailTemplate, deleteEmailTemplate } from '../../services/api.js';
import { fillTemplate, PLACEHOLDERS, DEFAULT_TEMPLATE } from '../../lib/emailTemplate.js';

// Sample transaction for the live preview
const SAMPLE_TX = {
  client_name: 'ישראל ישראלי',
  amount: 180,
  currency: 'ILS',
  group_name: 'קרן לדוגמה',
  transaction_time_raw: '15/07/2026 10:30',
};

const CAN_EDIT = new Set(['admin', 'editor']);

export default function EmailTemplate({ institutions = [] }) {
  const { role } = useAuth();
  const canEdit = CAN_EDIT.has(role);

  const [templates, setTemplates] = useState({}); // mosad_number → template row
  const [mosad, setMosad]         = useState('');
  const [subject, setSubject]     = useState('');
  const [body, setBody]           = useState('');
  const [autoSend, setAutoSend]   = useState(false);
  const [meta, setMeta]           = useState(null);
  const [loading, setLoading]     = useState(true);
  const [saving, setSaving]       = useState(false);
  const [msg, setMsg]             = useState(null); // { text, ok }
  const bodyRef = useRef(null);

  useEffect(() => {
    fetchEmailTemplates()
      .then((rows) => {
        setTemplates(Object.fromEntries((rows ?? []).map((t) => [t.mosad_number, t])));
      })
      .catch((e) => setMsg({ text: `שגיאה בטעינת התבניות: ${e.message}`, ok: false }))
      .finally(() => setLoading(false));
  }, []);

  const hasTemplate = Boolean(templates[mosad]);

  function selectMosad(m) {
    setMosad(m);
    setMsg(null);
    const tpl = templates[m];
    setSubject(tpl?.subject ?? DEFAULT_TEMPLATE.subject);
    setBody(tpl?.body ?? DEFAULT_TEMPLATE.body);
    setAutoSend(Boolean(tpl?.auto_send));
    setMeta(tpl ? { updated_by: tpl.updated_by, updated_at: tpl.updated_at } : null);
  }

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
      const saved = await saveEmailTemplate({ mosad_number: mosad, subject, body, auto_send: autoSend });
      setTemplates((prev) => ({ ...prev, [mosad]: saved }));
      setMeta({ updated_by: saved.updated_by, updated_at: saved.updated_at });
      setMsg({ text: 'התבנית נשמרה בהצלחה', ok: true });
    } catch (e) {
      setMsg({ text: `השמירה נכשלה: ${e.message}`, ok: false });
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!hasTemplate) return;
    setSaving(true);
    setMsg(null);
    try {
      await deleteEmailTemplate(mosad);
      setTemplates((prev) => {
        const next = { ...prev };
        delete next[mosad];
        return next;
      });
      setAutoSend(false);
      setMeta(null);
      setMsg({ text: 'התבנית נמחקה — לא יישלחו יותר מיילים אוטומטיים למוסד הזה', ok: true });
    } catch (e) {
      setMsg({ text: `המחיקה נכשלה: ${e.message}`, ok: false });
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className={styles.loading}>טוען תבניות…</div>;

  const previewSubject = fillTemplate(subject, SAMPLE_TX);
  const previewBody = fillTemplate(body, SAMPLE_TX);

  return (
    <div className={styles.wrapper}>
      <div className={styles.editor}>
        <h2 className={styles.heading}>תבניות מייל תודה לפי מוסד</h2>
        <p className={styles.hint}>
          לכל מוסד תבנית משלו. מייל אוטומטי נשלח רק לתורמים של מוסדות שבהם
          "שליחה אוטומטית" מופעלת. המיילים נשלחים מהכתובת som.noflim@gmail.com.
        </p>

        <label className={styles.label}>
          מוסד
          <select
            className={styles.input}
            value={mosad}
            onChange={(e) => selectMosad(e.target.value)}
          >
            <option value="">— בחר מוסד —</option>
            {institutions.map((i) => {
              const tpl = templates[i.mosad_number];
              const marker = tpl ? (tpl.auto_send ? ' ✓ אוטומטי' : ' • יש תבנית') : '';
              return (
                <option key={i.mosad_number} value={i.mosad_number}>
                  {i.mosad_name}{marker}
                </option>
              );
            })}
          </select>
        </label>

        {mosad && (
          <>
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
                שליחה אוטומטית לכל תורם חדש של המוסד הזה
                <span className={styles.toggleWarn}>
                  {' '}— כשמופעל, כל עסקה חדשה של המוסד עם כתובת מייל תקבל את המייל מיד
                </span>
              </span>
            </label>

            {canEdit && (
              <div className={styles.btnRow}>
                <button className={styles.saveBtn} onClick={save} disabled={saving}>
                  {saving ? 'שומר…' : 'שמור תבנית'}
                </button>
                {hasTemplate && (
                  <button className={styles.deleteBtn} onClick={remove} disabled={saving}>
                    מחק תבנית
                  </button>
                )}
              </div>
            )}

            {meta?.updated_at && (
              <div className={styles.meta}>
                עודכן לאחרונה: {new Date(meta.updated_at).toLocaleString('he-IL')}
                {meta.updated_by ? ` על ידי ${meta.updated_by}` : ''}
              </div>
            )}
          </>
        )}

        {msg && (
          <div className={msg.ok ? styles.msgOk : styles.msgErr}>{msg.text}</div>
        )}
      </div>

      {mosad && (
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
      )}
    </div>
  );
}
