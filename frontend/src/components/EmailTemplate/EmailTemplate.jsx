import { useState, useEffect, useRef } from 'react';
import styles from './EmailTemplate.module.css';
import { useAuth } from '../../contexts/AuthContext.jsx';
import { fetchEmailTemplates, saveEmailTemplate, deleteEmailTemplate } from '../../services/api.js';
import { fillTemplate, fillTemplateHtml, ensureHtml, htmlIsEmpty, PLACEHOLDERS, DEFAULT_TEMPLATE } from '../../lib/emailTemplate.js';
import { formatDateTime } from '../../lib/format.js';
import RichTextEditor from '../RichTextEditor/RichTextEditor.jsx';
import SendEmailModal from '../SendEmailModal/SendEmailModal.jsx';
import {
  Card, CardHeader, CardBody, CardFooter, Stack, Field, Input, Select, Checkbox, Button, Alert, StateMessage, Icon,
  useToast, useConfirm,
} from '../ui';

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

// Only these institutions get thank-you email templates.
const PICKER_INSTITUTIONS = new Set([
  'ישיבת אור אפרים',
  'ישיבת חכמי ירושלים',
  'כולל חכמי ירושלים',
  'סומך נופלים',
]);

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
  const toast = useToast();
  const confirm = useConfirm();
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
  const [error, setError]         = useState('');
  const [sendOpen, setSendOpen]   = useState(false);
  const editorRef = useRef(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    fetchEmailTemplates()
      .then((rows) => {
        setTemplates(Object.fromEntries((rows ?? []).map((t) => [t.mosad_number, t])));
      })
      .catch((e) => setError(`שגיאה בטעינת התבניות: ${e.message}`))
      .finally(() => setLoading(false));
  }, []);

  const hasTemplate = Boolean(templates[mosad]);

  function selectMosad(m) {
    setMosad(m);
    setError('');
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
      setError('');
    } catch (err) {
      setError(err.message);
    }
  }

  async function save() {
    if (htmlIsEmpty(body)) return setError('חסר תוכן להודעה');
    setSaving(true);
    setError('');
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
      toast.success('התבנית נשמרה');
    } catch (e) {
      setError(`השמירה נכשלה: ${e.message}`);
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!hasTemplate) return;
    const ok = await confirm({
      title: 'מחיקת תבנית',
      message: 'למחוק את התבנית של המוסד הזה? לא יישלחו יותר מיילי תודה אוטומטיים לתורמים שלו.',
      confirmText: 'מחיקה',
      tone: 'danger',
    });
    if (!ok) return;
    setSaving(true);
    setError('');
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
      toast.success('התבנית נמחקה — לא יישלחו יותר מיילים אוטומטיים למוסד הזה');
    } catch (e) {
      setError(`המחיקה נכשלה: ${e.message}`);
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <Card><StateMessage kind="loading" title="טוען תבניות…" /></Card>;

  // Thank-you templates are only relevant for these institutions — the rest
  // (bookkeeping שכ"ל variants, funds, campaign entities) are hidden here.
  const pickerInstitutions = institutions.filter((i) =>
    PICKER_INSTITUTIONS.has((i.mosad_name || '').trim())
  );

  const previewSubject = fillTemplate(subject, SAMPLE_TX);
  const previewBody = fillTemplateHtml(body, SAMPLE_TX);
  const attachedFileName = newFile ? newFile.name : (!removeFile && existingFile) || null;

  return (
    <Stack>
      <div className={styles.topRow}>
        <p className={styles.intro}>
          לכל מוסד תבנית משלו. מייל אוטומטי נשלח רק לתורמים של מוסדות שבהם "שליחה אוטומטית" מופעלת.
          המיילים נשלחים מהכתובת som.noflim@gmail.com.
        </p>
        {canEdit && <Button variant="soft" icon="send" onClick={() => setSendOpen(true)}>שליחת מייל לתורם</Button>}
      </div>

      {error && <Alert tone="danger" onClose={() => setError('')}>{error}</Alert>}

      <div className={styles.columns}>
        <Card>
          <CardBody>
            <Field label="מוסד">
              <Select value={mosad} onChange={(e) => selectMosad(e.target.value)}>
                <option value="">בחר מוסד…</option>
                {pickerInstitutions.map((i) => {
                  const tpl = templates[i.mosad_number];
                  const marker = tpl ? (tpl.auto_send ? ' — שליחה אוטומטית פעילה' : ' — יש תבנית') : '';
                  return (
                    <option key={i.mosad_number} value={i.mosad_number}>{i.mosad_name}{marker}</option>
                  );
                })}
              </Select>
            </Field>

            {!mosad ? (
              <StateMessage compact kind="info" icon="mail" title="בחר מוסד" description="כדי לערוך את תבנית מייל התודה שלו" />
            ) : (
              <div className={styles.form}>
                <div>
                  <div className={styles.chipsLabel}>הוספת שדה מהעסקה:</div>
                  <div className={styles.chips}>
                    {PLACEHOLDERS.map((ph) => (
                      <button key={ph} type="button" className={styles.chip} onClick={() => editorRef.current?.insertText(ph)} disabled={!canEdit}>
                        {ph}
                      </button>
                    ))}
                  </div>
                </div>

                <Field label="נושא">
                  <Input value={subject} onChange={(e) => setSubject(e.target.value)} disabled={!canEdit} dir="rtl" />
                </Field>

                <div>
                  <div className={styles.fieldLabel}>תוכן ההודעה</div>
                  <RichTextEditor ref={editorRef} value={body} onChange={setBody} disabled={!canEdit} />
                </div>

                <div>
                  <input ref={fileInputRef} type="file" hidden onChange={onPickFile} />
                  <div className={styles.fileRow}>
                    {attachedFileName ? (
                      <>
                        <span className={styles.fileName}><Icon name="fileText" size={15} />{attachedFileName}</span>
                        {canEdit && (
                          <>
                            <Button size="sm" variant="ghost" onClick={() => fileInputRef.current?.click()}>החלפה</Button>
                            <Button size="sm" variant="ghost" icon="x" onClick={() => { setNewFile(null); setRemoveFile(true); }}>הסרה</Button>
                          </>
                        )}
                      </>
                    ) : canEdit && (
                      <Button size="sm" variant="soft" icon="upload" onClick={() => fileInputRef.current?.click()}>צירוף תמונה או קובץ לתבנית</Button>
                    )}
                  </div>
                  <p className={styles.hint}>הקובץ יצורף לכל מייל שיישלח מהתבנית הזו (עד 3.5MB).</p>
                </div>

                <div className={styles.toggles}>
                  <Checkbox
                    checked={autoSend}
                    onChange={(e) => setAutoSend(e.target.checked)}
                    disabled={!canEdit}
                    label="שליחה אוטומטית לכל תורם חדש של המוסד"
                  />
                  {autoSend && <p className={styles.warn}>כל עסקה חדשה של המוסד שיש בה כתובת מייל תקבל את המייל מיד.</p>}
                  <Checkbox
                    checked={attachReceipt}
                    onChange={(e) => setAttachReceipt(e.target.checked)}
                    disabled={!canEdit}
                    label="צירוף הקבלה (PDF מ-EZCount) כשיש לעסקה קבלה"
                  />
                </div>
              </div>
            )}
          </CardBody>

          {mosad && (canEdit || meta?.updated_at) && (
            <CardFooter>
              {canEdit && <Button variant="primary" icon="check" onClick={save} loading={saving}>שמירת התבנית</Button>}
              {canEdit && hasTemplate && <Button variant="dangerSoft" icon="trash" onClick={remove} disabled={saving}>מחיקה</Button>}
              {meta?.updated_at && (
                <span className={styles.meta}>
                  עודכן {formatDateTime(meta.updated_at)}{meta.updated_by ? ` · ${meta.updated_by}` : ''}
                </span>
              )}
            </CardFooter>
          )}
        </Card>

        {mosad && (
          <Card className={styles.preview}>
            <CardHeader title="תצוגה מקדימה" subtitle="עם נתוני עסקה לדוגמה" />
            <CardBody>
              <div className={styles.mail}>
                <div className={styles.mailSubject}>{previewSubject || '(ללא נושא)'}</div>
                <div className={styles.mailFrom}>מאת: סומך נופלים &lt;som.noflim@gmail.com&gt;</div>
                <div className={styles.mailBody} dir="rtl" dangerouslySetInnerHTML={{ __html: previewBody }} />
                {attachedFileName && <div className={styles.mailAttachment}><Icon name="fileText" size={15} />{attachedFileName}</div>}
              </div>
            </CardBody>
          </Card>
        )}
      </div>

      {sendOpen && <SendEmailModal institutions={institutions} onClose={() => setSendOpen(false)} />}
    </Stack>
  );
}
