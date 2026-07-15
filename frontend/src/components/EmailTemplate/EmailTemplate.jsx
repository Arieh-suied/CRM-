import { useState, useEffect, useRef } from 'react';
import styles from './EmailTemplate.module.css';
import { useAuth } from '../../contexts/AuthContext.jsx';
import { fetchEmailTemplates, saveEmailTemplate, deleteEmailTemplate } from '../../services/api.js';
import { fillTemplate, fillTemplateHtml, ensureHtml, htmlIsEmpty, PLACEHOLDERS, DEFAULT_TEMPLATE } from '../../lib/emailTemplate.js';
import RichTextEditor from '../RichTextEditor/RichTextEditor.jsx';
import SendEmailModal from '../SendEmailModal/SendEmailModal.jsx';

// Sample transaction for the live preview
const SAMPLE_TX = {
  client_name: 'ישראל ישראלי',
  amount: 180,
  currency: 'ILS',
  group_name: 'קרן לדוגמה',
  transaction_time_raw: '15/07/2026 10:30',
};

const CAN_EDIT = new Set(['admin', 'editor']);
const MAX_FILE_BYTES = 3.5 * 1024 * 1024;

export function readFileAsAttachment(file) {
  return new Promise((resolve, reject) => {
    if (file.size > MAX_FILE_BYTES) return reject(new Error('הקובץ גדול מדי (מקסימום 3.5MB)'));
    const reader = new FileReader();
    reader.onload = () => resolve({
      name: file.name,
      mime: file.type || 'application/octet-stream',
      dataBase64: String(reader.result).split(',')[1] || '',
    });
    reader.onerror = () => reject(new Error('קריאת הקובץ נכשלה'));
    reader.readAsDataURL(file);
  });
}

export default function EmailTemplate({ institutions = [] }) {
  const { role } = useAuth();
  const canEdit = CAN_EDIT.has(role);

  const [templates, setTemplates] = useState({}); // mosad_number → template row
  const [mosad, setMosad]         = useState('');
  const [subject, setSubject]     = useState('');
  const [body, setBody]           = useState(''); // HTML
  const [autoSend, setAutoSend]   = useState(false);
  const [attachReceipt, setAttachReceipt] = useState(false);
  const [existingFile, setExistingFile]   = useState(null); // attachment_name from DB
  const [newFile, setNewFile]             = useState(null); // { name, mime, dataBase64 }
  const [removeFile, setRemoveFile]       = useState(false);
  const [meta, setMeta]           = useState(null);
  const [loading, setLoading]     = useState(true);
  const [saving, setSaving]       = useState(false);
  const [msg, setMsg]             = useState(null); // { text, ok }
  const [sendOpen, setSendOpen]   = useState(false);
  const editorRef = useRef(null);
  const fileInputRef = useRef(null);

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
    setBody(ensureHtml(tpl?.body ?? DEFAULT_TEMPLATE.body));
    setAutoSend(Boolean(tpl?.auto_send));
    setAttachReceipt(Boolean(tpl?.attach_receipt));
    setExistingFile(tpl?.attachment_name || null);
    setNewFile(null);
    setRemoveFile(false);
    setMeta(tpl ? { updated_by: tpl.updated_by, updated_at: tpl.updated_at } : null);
  }

  async function onPickFile(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      setNewFile(await readFileAsAttachment(file));
      setRemoveFile(false);
      setMsg(null);
    } catch (err) {
      setMsg({ text: err.message, ok: false });
    }
  }

  async function save() {
    if (htmlIsEmpty(body)) return setMsg({ text: 'חסר תוכן להודעה', ok: false });
    setSaving(true);
    setMsg(null);
    try {
      const saved = await saveEmailTemplate({
        mosad_number: mosad,
        subject,
        body,
        auto_send: autoSend,
        attach_receipt: attachReceipt,
        ...(newFile ? { attachment: newFile } : {}),
        ...(removeFile && !newFile ? { remove_attachment: true } : {}),
      });
      setTemplates((prev) => ({ ...prev, [mosad]: saved }));
      setExistingFile(saved.attachment_name || null);
      setNewFile(null);
      setRemoveFile(false);
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
      setAttachReceipt(false);
      setExistingFile(null);
      setNewFile(null);
      setRemoveFile(false);
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
  const previewBody = fillTemplateHtml(body, SAMPLE_TX);
  const attachedFileName = newFile ? newFile.name : (!removeFile && existingFile) || null;

  return (
    <div className={styles.wrapper}>
      <div className={styles.editor}>
        <div className={styles.headRow}>
          <h2 className={styles.heading}>תבניות מייל תודה לפי מוסד</h2>
          {canEdit && (
            <button type="button" className={styles.sendToDonorBtn} onClick={() => setSendOpen(true)}>
              ✉ שליחת מייל לתורם
            </button>
          )}
        </div>
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
                  onClick={() => editorRef.current?.insertText(ph)}
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

            <div className={styles.label}>
              תוכן ההודעה
              <RichTextEditor ref={editorRef} value={body} onChange={setBody} disabled={!canEdit} />
            </div>

            <div className={styles.fileRow}>
              <input ref={fileInputRef} type="file" hidden onChange={onPickFile} />
              {attachedFileName ? (
                <>
                  <span className={styles.fileName}>📎 {attachedFileName}</span>
                  {canEdit && (
                    <>
                      <button type="button" className={styles.fileBtn} onClick={() => fileInputRef.current?.click()}>
                        החלף קובץ
                      </button>
                      <button
                        type="button"
                        className={styles.fileRemoveBtn}
                        onClick={() => { setNewFile(null); setRemoveFile(true); }}
                      >
                        הסר
                      </button>
                    </>
                  )}
                </>
              ) : (
                canEdit && (
                  <button type="button" className={styles.fileBtn} onClick={() => fileInputRef.current?.click()}>
                    📎 צרף תמונה או קובץ לתבנית
                  </button>
                )
              )}
            </div>
            <p className={styles.fileHint}>
              הקובץ יצורף לכל מייל שנשלח מהתבנית הזו (עד 3.5MB).
            </p>

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

            <label className={styles.toggleRow}>
              <input
                type="checkbox"
                checked={attachReceipt}
                onChange={(e) => setAttachReceipt(e.target.checked)}
                disabled={!canEdit}
              />
              <span>
                צירוף הקבלה למייל — כשלעסקה יש קבלה (EZCount), קובץ ה-PDF יצורף אוטומטית
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
            <div
              className={styles.previewBody}
              dir="rtl"
              dangerouslySetInnerHTML={{ __html: previewBody }}
            />
            {attachedFileName && (
              <div className={styles.previewAttachment}>📎 {attachedFileName}</div>
            )}
          </div>
        </div>
      )}

      {sendOpen && (
        <SendEmailModal
          institutions={institutions}
          onClose={() => setSendOpen(false)}
        />
      )}
    </div>
  );
}
