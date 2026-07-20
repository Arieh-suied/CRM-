import { useState, useRef } from 'react';
import { TRANSFER_INSTITUTIONS } from '../constants/transferInstitutions.js';

const ALLOWED_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
const TOKEN = import.meta.env.VITE_TOLDOT_PUBLIC_TOKEN || '';

// Render a PDF's first page to a JPEG data URL, so a PDF flows through the exact
// same image pipeline (OCR / storage / Telegram) as a screenshot. pdf.js is
// loaded lazily — only when the user actually picks a PDF.
async function pdfToJpegDataUrl(file, maxDim = 1600) {
  const pdfjs = await import('pdfjs-dist');
  const workerUrl = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

  const buf = await file.arrayBuffer();
  const pdf = await pdfjs.getDocument({ data: buf }).promise;
  const page = await pdf.getPage(1);
  const base = page.getViewport({ scale: 1 });
  const scale = Math.min(2, maxDim / Math.max(base.width, base.height));
  const viewport = page.getViewport({ scale: scale > 0 ? scale : 1 });

  const canvas = document.createElement('canvas');
  canvas.width = Math.round(viewport.width);
  canvas.height = Math.round(viewport.height);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvasContext: ctx, viewport }).promise;
  return canvas.toDataURL('image/jpeg', 0.85);
}

// Compress + re-encode to JPEG data URL entirely in the browser (mirrors the
// internal imageUtils.compressImage, inlined here to keep this bundle free of
// the Supabase client that imageUtils transitively imports).
function compressImage(file, maxDim = 1600, quality = 0.85) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > maxDim || height > maxDim) {
          const scale = maxDim / Math.max(width, height);
          width = Math.round(width * scale);
          height = Math.round(height * scale);
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        canvas.getContext('2d').drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = () => reject(new Error('שגיאה בטעינת התמונה'));
      img.src = reader.result;
    };
    reader.onerror = () => reject(new Error('שגיאה בקריאת הקובץ'));
    reader.readAsDataURL(file);
  });
}

async function callApi(action, payload) {
  const res = await fetch('/api/public-transfer', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, token: TOKEN, ...payload }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.error) throw new Error(data.error || 'שגיאה בשרת');
  return data;
}

const EMPTY = {
  institution_id: '',
  customer_name: '', id_number: '', email: '', phone: '', address: '',
  amount: '', transfer_date: '', asmachta: '',
  bank_name: '', bank_branch: '', bank_account: '', notes: '',
};

const FIELDS = [
  { key: 'institution_id', label: 'מוסד', type: 'select', required: true },
  { key: 'customer_name', label: 'שם השולח', type: 'text', required: true },
  { key: 'id_number', label: 'תעודת זהות', type: 'text', required: true },
  { key: 'email', label: 'כתובת מייל', type: 'email' },
  { key: 'phone', label: 'מספר טלפון', type: 'tel' },
  { key: 'address', label: 'כתובת מגורים', type: 'text' },
  { key: 'amount', label: 'סכום (₪)', type: 'number', required: true },
  { key: 'transfer_date', label: 'תאריך העברה', type: 'date' },
  { key: 'asmachta', label: 'אסמכתא', type: 'text' },
  { key: 'bank_name', label: 'בנק', type: 'text' },
  { key: 'bank_branch', label: 'סניף', type: 'text' },
  { key: 'bank_account', label: 'חשבון', type: 'text' },
  { key: 'notes', label: 'הערות', type: 'text' },
];

export default function PublicTransfer() {
  const [preview, setPreview] = useState(null);   // compressed data URL
  const [fields, setFields] = useState(EMPTY);
  const [stage, setStage] = useState('upload');    // upload | analyzing | form | submitting | done
  const [error, setError] = useState('');
  const fileRef = useRef(null);

  function reset() {
    setPreview(null);
    setFields(EMPTY);
    setStage('upload');
    setError('');
    if (fileRef.current) fileRef.current.value = '';
  }

  async function handleFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError('');
    const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
    if (!isPdf && !ALLOWED_TYPES.includes(file.type)) {
      setError('סוג קובץ לא נתמך — יש להעלות תמונה (jpg / png / webp) או PDF');
      return;
    }
    try {
      setStage('analyzing');
      let dataUrl;
      try {
        dataUrl = isPdf ? await pdfToJpegDataUrl(file) : await compressImage(file);
      } catch (convErr) {
        setError(isPdf ? 'לא הצלחנו לקרוא את קובץ ה-PDF' : convErr.message);
        setStage('upload');
        return;
      }
      setPreview(dataUrl);
      try {
        const ocr = await callApi('ocr', { image: dataUrl, mimeType: 'image/jpeg' });
        setFields({
          ...EMPTY, // contact fields (email/phone/address) aren't in a screenshot — filled in by hand
          customer_name: ocr.donor_name || ocr.account_name || '',
          amount: ocr.amount != null ? String(ocr.amount) : '',
          transfer_date: ocr.transfer_date || '',
          asmachta: ocr.asmachta || '',
          bank_name: ocr.bank_number || '',
          bank_branch: ocr.branch_number || '',
          bank_account: ocr.account_number || '',
          notes: ocr.remarks || '',
        });
      } catch (ocrErr) {
        // OCR failure isn't fatal — let the user fill the details manually.
        setError('לא הצלחנו לקרוא את הצילום אוטומטית — אפשר למלא את הפרטים ידנית.');
      }
      setStage('form');
    } catch (err) {
      setError(err.message);
      setStage('upload');
    }
  }

  function setField(key, value) {
    setFields((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (!fields.institution_id) {
      setError('יש לבחור מוסד');
      return;
    }
    if (!fields.customer_name.trim() || fields.customer_name.trim().length < 2) {
      setError('יש למלא את שם השולח');
      return;
    }
    if (!fields.id_number.trim()) {
      setError('יש למלא תעודת זהות');
      return;
    }
    if (!(Number(fields.amount) > 0)) {
      setError('יש למלא סכום תקין');
      return;
    }
    setStage('submitting');
    try {
      await callApi('submit', { image: preview, mimeType: 'image/jpeg', fields });
      setStage('done');
    } catch (err) {
      setError(err.message);
      setStage('form');
    }
  }

  return (
    <div className="pt-wrap">
      <div className="pt-card">
        <header className="pt-header">
          <div className="pt-logo">🏦</div>
          <h1>העלאת העברה בנקאית</h1>
          <p>העלאת צילום מסך של העברה בנקאית לעדכון המערכת</p>
        </header>

        {error && <div className="pt-error">{error}</div>}

        {stage === 'done' ? (
          <div className="pt-done">
            <div className="pt-check">✓</div>
            <h2>נשלח בהצלחה!</h2>
            <p>ההעברה התקבלה וממתינה לאישור. תודה רבה.</p>
            <button className="pt-btn" onClick={reset}>העלאת העברה נוספת</button>
          </div>
        ) : (
          <>
            {!preview && (
              <label className="pt-drop">
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*,application/pdf"
                  onChange={handleFile}
                  hidden
                />
                <div className="pt-drop-icon">📎</div>
                <div className="pt-drop-text">לחצו לצילום, בחירה מהגלריה או קובץ</div>
                <div className="pt-drop-sub">jpg · png · webp · pdf</div>
              </label>
            )}

            {preview && (
              <div className="pt-preview">
                <img src={preview} alt="צילום ההעברה" />
                {stage !== 'submitting' && (
                  <button type="button" className="pt-link" onClick={reset}>החלפת תמונה</button>
                )}
              </div>
            )}

            {stage === 'analyzing' && (
              <div className="pt-analyzing">
                <div className="pt-spinner" />
                <span>קורא את פרטי ההעברה…</span>
              </div>
            )}

            {(stage === 'form' || stage === 'submitting') && (
              <form className="pt-form" onSubmit={handleSubmit}>
                {FIELDS.map(({ key, label, type, required }) => (
                  <div key={key} className="pt-field">
                    <label>{label}{required && <span className="pt-req"> *</span>}</label>
                    {type === 'select' ? (
                      <select
                        value={fields[key]}
                        onChange={(e) => setField(key, e.target.value)}
                        disabled={stage === 'submitting'}
                      >
                        <option value="">בחר מוסד</option>
                        {TRANSFER_INSTITUTIONS.map((inst) => (
                          <option key={inst.id} value={inst.id}>{inst.label}</option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type={type}
                        inputMode={type === 'number' ? 'decimal' : key === 'id_number' ? 'numeric' : undefined}
                        value={fields[key]}
                        onChange={(e) => setField(key, e.target.value)}
                        disabled={stage === 'submitting'}
                      />
                    )}
                  </div>
                ))}
                <button className="pt-btn" type="submit" disabled={stage === 'submitting'}>
                  {stage === 'submitting' ? 'שולח…' : 'שליחה'}
                </button>
              </form>
            )}
          </>
        )}
      </div>
      <footer className="pt-footer">מערכת ניהול תרומות</footer>
    </div>
  );
}
