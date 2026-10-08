import { useState, useEffect, useRef } from 'react';
import styles from './SendEmailModal.module.css';
import { fetchEmailTemplate, sendDonorEmail, searchDonors } from '../../services/api.js';
import { fillTemplate, fillTemplateHtml, ensureHtml, htmlIsEmpty, DEFAULT_TEMPLATE } from '../../lib/emailTemplate.js';
import RichTextEditor from '../RichTextEditor/RichTextEditor.jsx';
import { readFileAsAttachment } from '../EmailTemplate/EmailTemplate.jsx';
import { Modal, Field, Input, Checkbox, Button, Alert, StateMessage, Spinner, Icon, useToast } from '../ui';

// Manual "send email to donor" modal. Entry points:
//   - with `tx`   (transactions table row) — straight to compose
//   - without `tx` (template tab)          — donor search step first; picking a
//     donor uses their latest transaction so placeholders and the mosad
//     template match their most recent donation. A free-typed address is also
//     possible for recipients that don't exist in the system.
// Compose is prefilled from the transaction's institution template (generic
// default when the mosad has none), body is rich-text HTML, everything
// editable, confirm before send. Attachments: EZCount receipt, the template's
// stored file, and/or one ad-hoc uploaded file.
export default function SendEmailModal({ tx: initialTx = null, institutionName, institutions = [], onClose }) {
  const toast = useToast();
  const [tx, setTx]           = useState(initialTx);
  const [to, setTo]           = useState(initialTx?.email || '');
  const [subject, setSubject] = useState('');
  const [body, setBody]       = useState(''); // HTML
  const [loading, setLoading] = useState(Boolean(initialTx));
  const [attachReceipt, setAttachReceipt] = useState(false);
  const [templateFileName, setTemplateFileName] = useState(null);
  const [attachTemplateFile, setAttachTemplateFile] = useState(false);
  const [customFile, setCustomFile]   = useState(null); // { name, mime, dataBase64 }
  const [confirming, setConfirming] = useState(false);
  const [sending, setSending] = useState(false);
  const [msg, setMsg]         = useState(null); // { text, ok }
  const fileInputRef = useRef(null);

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
      setBody(fillTemplateHtml(ensureHtml(tpl.body), tx, fundName));
      setAttachReceipt(Boolean(tpl.attach_receipt) && Boolean(tx.receipt_data));
      setTemplateFileName(tpl.attachment_name || null);
      setAttachTemplateFile(Boolean(tpl.attachment_name));
    };
    if (tx.freeform) {
      // No transaction to fill placeholders from — start from a clean generic text.
      setSubject(DEFAULT_TEMPLATE.subject);
      setBody(ensureHtml('שלום,\n\nתודה רבה על תרומתך.\nתרומתך מסייעת לנו להמשיך בפעילותנו.\n\nבברכה,\nסומך נופלים'));
      setLoading(false);
      return;
    }
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

  function pickDonor(donor) {
    setTx(donor);
    setTo(donor.email || '');
    setMsg(null);
  }

  // Recipient that doesn't exist in the system — compose with the generic
  // default template and a free-typed address.
  function pickFreeform() {
    setTx({ freeform: true });
    setTo(query.trim().includes('@') ? query.trim() : '');
    setMsg(null);
  }

  async function onPickFile(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      setCustomFile(await readFileAsAttachment(file));
      setMsg(null);
    } catch (err) {
      setMsg({ text: err.message, ok: false });
    }
  }

  async function send() {
    setSending(true);
    setMsg(null);
    try {
      await sendDonorEmail({
        transactionId: tx?.id,
        to,
        subject,
        body,
        attachReceipt,
        attachTemplateFile: attachTemplateFile && Boolean(templateFileName),
        mosadNumber: tx?.mosad_number,
        customFile: customFile || undefined,
      });
      setMsg({ text: `המייל נשלח אל ${to}`, ok: true });
      toast.success(`המייל נשלח אל ${to}`);
      setConfirming(false);
    } catch (e) {
      setMsg({ text: e.message, ok: false });
      setConfirming(false);
    } finally {
      setSending(false);
    }
  }

  const canSend = to.trim().includes('@') && subject.trim() && !htmlIsEmpty(body);
  const searchStep = !tx;
  const isFreeform = Boolean(tx?.freeform);
  const sent = msg?.ok;

  const title = searchStep ? 'שליחת מייל לתורם' : isFreeform ? 'שליחת מייל לכתובת חופשית' : `שליחת מייל — ${tx.client_name || 'תורם'}`;

  const footer = searchStep ? null : confirming ? (
    <>
      <span className={styles.confirmText}>לשלוח את המייל אל <strong dir="ltr">{to}</strong>?</span>
      <Button onClick={() => setConfirming(false)} disabled={sending}>ביטול</Button>
      <Button variant="primary" icon="send" onClick={send} loading={sending}>כן, לשלוח</Button>
    </>
  ) : sent ? (
    <Button variant="primary" onClick={onClose}>סגירה</Button>
  ) : (
    <>
      <Button onClick={onClose}>ביטול</Button>
      <Button variant="primary" icon="send" onClick={() => setConfirming(true)} disabled={loading || !canSend}>שליחה</Button>
    </>
  );

  return (
    <Modal size="lg" title={title} onClose={onClose} footer={footer}>
      {searchStep ? (
        <div className={styles.stack}>
          <Field label="חיפוש תורם" hint="שם, מייל או טלפון — לפחות 2 תווים">
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="חיפוש…" data-autofocus />
          </Field>
          {searching && <div className={styles.searchHint}><Spinner size={14} /> מחפש…</div>}
          {!searching && query.trim().length >= 2 && results.length === 0 && (
            <div className={styles.searchHint}>לא נמצאו תורמים עם כתובת מייל</div>
          )}
          {results.length > 0 && (
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
          )}
          <div>
            <Button variant="ghost" icon="edit" onClick={pickFreeform}>שליחה לכתובת שלא קיימת במערכת</Button>
          </div>
        </div>
      ) : loading ? (
        <StateMessage kind="loading" title="טוען תבנית…" />
      ) : (
        <div className={styles.stack}>
          {!initialTx && (
            <div>
              <Button size="sm" variant="ghost" icon="chevronRight" onClick={() => { setTx(null); setMsg(null); setCustomFile(null); setConfirming(false); }}>
                חזרה לחיפוש
              </Button>
            </div>
          )}
          <Field label="אל">
            <Input value={to} onChange={(e) => setTo(e.target.value)} placeholder="name@example.com" dir="ltr" type="email" data-autofocus={(isFreeform && !to) || undefined} />
          </Field>
          <Field label="נושא">
            <Input value={subject} onChange={(e) => setSubject(e.target.value)} dir="rtl" />
          </Field>
          <div>
            <div className={styles.fieldLabel}>תוכן ההודעה</div>
            <RichTextEditor value={body} onChange={setBody} />
          </div>

          <div className={styles.attachments}>
            <div className={styles.fieldLabel}>קבצים מצורפים</div>
            {!isFreeform && (tx.receipt_data ? (
              <Checkbox
                checked={attachReceipt}
                onChange={(e) => setAttachReceipt(e.target.checked)}
                label={`צירוף הקבלה ${tx.receipt_doc_num ? `(מס' ${tx.receipt_doc_num}) ` : ''}כקובץ PDF`}
              />
            ) : (
              <span className={styles.muted}>לעסקה הזו אין קבלה במערכת לצירוף</span>
            ))}
            {templateFileName && (
              <Checkbox
                checked={attachTemplateFile}
                onChange={(e) => setAttachTemplateFile(e.target.checked)}
                label={`צירוף הקובץ מהתבנית (${templateFileName})`}
              />
            )}
            <input ref={fileInputRef} type="file" hidden onChange={onPickFile} />
            {customFile ? (
              <div className={styles.fileRow}>
                <Icon name="fileText" size={15} />
                <span>{customFile.name}</span>
                <Button size="sm" variant="ghost" icon="x" onClick={() => setCustomFile(null)}>הסרה</Button>
              </div>
            ) : (
              <div>
                <Button size="sm" variant="soft" icon="upload" onClick={() => fileInputRef.current?.click()}>צירוף תמונה או קובץ</Button>
              </div>
            )}
          </div>
        </div>
      )}

      {msg && (
        <Alert tone={msg.ok ? 'success' : 'danger'} className={styles.msg} onClose={msg.ok ? undefined : () => setMsg(null)}>
          {msg.text}
        </Alert>
      )}
    </Modal>
  );
}
