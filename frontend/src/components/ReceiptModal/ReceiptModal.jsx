import { useEffect, useState } from 'react';
import styles from './ReceiptModal.module.css';
import { buildReceiptProxyUrl } from '../../lib/receiptProxy.js';

export default function ReceiptModal({ url, title, onClose }) {
  const [proxied, setProxied] = useState(null);

  useEffect(() => {
    const filename = title?.replace(/[^\w֐-׿\s-]/g, '').trim() || 'קבלה';
    let cancelled = false;
    buildReceiptProxyUrl(url, filename).then((u) => { if (!cancelled) setProxied(u); });
    return () => { cancelled = true; };
  }, [url, title]);

  useEffect(() => {
    function handleKey(e) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={title ?? 'קבלה'}>
        <div className={styles.header}>
          <span className={styles.title}>{title ?? 'קבלה'}</span>
          <div className={styles.actions}>
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className={styles.openBtn}
            >
              פתח בטאב חדש ↗
            </a>
            <button className={styles.closeBtn} onClick={onClose} aria-label="סגור">✕</button>
          </div>
        </div>
        <div className={styles.body}>
          <iframe
            src={proxied}
            className={styles.frame}
            title="קבלה"
          />
        </div>
      </div>
    </div>
  );
}
