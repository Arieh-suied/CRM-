import { useState, useRef } from 'react';
import styles from './ReceiptForms.module.css';
import { compressImage, ALLOWED_IMAGE_TYPES } from './imageUtils.js';
import { authFetch } from '../../services/api.js';
import { Card, CardHeader, CardBody, FileDrop, Button, Alert } from '../ui';

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
  const replaceRef = useRef(null);

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
  };

  const nameUncertain = !!result && !result.donor_name && !!result.account_name;

  const missing = result ? REQUIRED_FIELDS.filter((f) => {
    if (f.key === 'donor_name') return !result.donor_name && !result.account_name;
    return result[f.key] == null;
  }) : [];

  return (
    <Card>
      <CardHeader title="מילוי אוטומטי מצילום מסך" subtitle="מעלים צילום של אישור העברה בנקאית, והפרטים ימולאו בטופס" />
      <CardBody>
        {!preview ? (
          <FileDrop icon="image" title="העלאת צילום מסך של אישור העברה" hint="לחיצה או גרירה · jpg, png, webp" accept={ACCEPT} onFiles={([f]) => handleFile(f)} compact />
        ) : (
          <div className={styles.preview}>
            <img src={preview} alt="תצוגה מקדימה של צילום המסך" className={styles.previewImg} />
            <div className={styles.previewActions}>
              <Button variant="primary" icon="search" onClick={analyze} loading={loading}>
                {loading ? 'מנתח…' : 'זיהוי הפרטים מהתמונה'}
              </Button>
              <input ref={replaceRef} type="file" accept={ACCEPT} hidden onChange={(e) => { handleFile(e.target.files?.[0]); e.target.value = ''; }} />
              <Button size="sm" variant="ghost" icon="image" onClick={() => replaceRef.current?.click()} disabled={loading}>החלפת תמונה</Button>
              <Button size="sm" variant="ghost" icon="x" onClick={reset} disabled={loading}>הסרה</Button>
            </div>
          </div>
        )}

        {error && <Alert tone="danger" className={styles.sectionGap}>{error}</Alert>}

        {result && (
          <Alert tone={nameUncertain || missing.length ? 'warning' : 'success'} className={styles.sectionGap}>
            הפרטים שזוהו מולאו בטופס למטה — כדאי לבדוק ולתקן לפני הפקת הקבלה.
            {(nameUncertain || missing.length > 0) && (
              <ul className={styles.alertList}>
                {nameUncertain && (
                  <li>השם שמולא ("{result.account_name}") הוא שם בעל החשבון מהצילום, ולא בהכרח שם התורם — יש לאמת את שם הלקוח.</li>
                )}
                {missing.length > 0 && <li>לא זוהו בבירור: {missing.map((f) => f.label).join(', ')} — יש למלא ידנית.</li>}
              </ul>
            )}
          </Alert>
        )}
      </CardBody>
    </Card>
  );
}
