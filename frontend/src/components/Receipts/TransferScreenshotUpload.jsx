import { useState, useRef } from 'react';
import styles from './Receipts.module.css';
import { compressImage, ALLOWED_IMAGE_TYPES } from './imageUtils.js';
import { authFetch } from '../../services/api.js';

const ACCEPT = 'image/jpeg,image/jpg,image/png,image/webp';
const ALLOWED_TYPES = ALLOWED_IMAGE_TYPES;

const REQUIRED_FIELDS = [
  { key: 'donor_name',     label: 'שם תורם' },
  { key: 'amount',         label: 'סכום' },
  { key: 'transfer_date',  label: 'תאריך העברה' },
  { key: 'bank_number',    label: 'בנק' },
  { key: 'branch_number',  label: 'סניף' },
  { key: 'account_number', label: 'חשבון' },
];

export default function TransferScreenshotUpload({ onExtracted }) {
  const [preview, setPreview]   = useState(null);
  const [imageData, setImageData] = useState(null);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');
  const [result, setResult]     = useState(null);
  const fileRef = useRef(null);

  const handleFile = async (file) => {
    setError('');
    setResult(null);
    if (!file) return;
    if (!ALLOWED_TYPES.includes(file.type)) {
      setError('סוג קובץ לא נתמך (jpg/png/webp בלבד)');
      return;
    }
    try {
      const dataUrl = await compressImage(file);
      setImageData(dataUrl);
      setPreview(dataUrl);
    } catch (err) {
      setError(err.message);
    }
  };

  const analyze = async () => {
    if (!imageData) return;
    setLoading(true);
    setError('');
    setResult(null);
    try {
      const res = await authFetch('/api/parse-transfer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: imageData, mimeType: 'image/jpeg' }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || 'שגיאה בניתוח התמונה');
      setResult(data);
      onExtracted?.(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const reset = () => {
    setPreview(null);
    setImageData(null);
    setResult(null);
    setError('');
    if (fileRef.current) fileRef.current.value = '';
  };

  const nameUncertain = !!result && !result.donor_name && !!result.account_name;

  const missing = result ? REQUIRED_FIELDS.filter(f => {
    if (f.key === 'donor_name') return !result.donor_name && !result.account_name;
    return result[f.key] == null;
  }) : [];

  return (
    <div className={styles.card}>
      <h3 className={styles.sectionTitle} style={{ marginBottom: 12 }}>מילוי אוטומטי מצילום מסך של העברה</h3>

      <input
        ref={fileRef}
        type="file"
        accept={ACCEPT}
        style={{ display: 'none' }}
        onChange={e => handleFile(e.target.files?.[0])}
      />

      {!preview ? (
        <div className={styles.uploadZone} onClick={() => fileRef.current?.click()}>
          <div className={styles.uploadIcon}>📷</div>
          <div className={styles.uploadLabel}>העלה צילום מסך של אישור העברה בנקאית</div>
          <div className={styles.uploadSub}>jpg, png, webp</div>
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <img
            src={preview}
            alt="תצוגה מקדימה"
            style={{ maxWidth: 160, maxHeight: 160, borderRadius: 8, border: '1px solid var(--color-border)', objectFit: 'contain' }}
          />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <button type="button" className={`${styles.btn} ${styles.btnPrimary}`} onClick={analyze} disabled={loading}>
              {loading ? 'מנתח...' : '🔍 נתח צילום מסך'}
            </button>
            <button type="button" className={`${styles.btn} ${styles.btnGhost} ${styles.btnSm}`} onClick={() => fileRef.current?.click()} disabled={loading}>
              החלף תמונה
            </button>
            <button type="button" className={`${styles.btn} ${styles.btnGhost} ${styles.btnSm}`} onClick={reset} disabled={loading}>
              נקה
            </button>
          </div>
        </div>
      )}

      {error && <div className={styles.errorMsg} style={{ marginTop: 12, marginBottom: 0 }}>{error}</div>}

      {result && (
        <div className={styles.successMsg} style={{ marginTop: 12, marginBottom: 0 }}>
          <div>הנתונים שזוהו מולאו בטופס למטה — יש לבדוק ולתקן לפני הפקת הקבלה.</div>
          {nameUncertain && (
            <div style={{ marginTop: 6, color: '#744210' }}>
              ⚠️ השם שמולא ("{result.account_name}") הוא שם בעל החשבון מהצילום ולא בהכרח שם התורם בפועל — יש לאמת ולתקן את שם הלקוח.
            </div>
          )}
          {missing.length > 0 && (
            <div style={{ marginTop: 6, color: '#744210' }}>
              ⚠️ לא זוהו בבירור בתמונה: {missing.map(f => f.label).join(', ')} — יש למלא ידנית.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
