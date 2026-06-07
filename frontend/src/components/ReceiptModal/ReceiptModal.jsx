import { useEffect } from 'react';
import styles from './ReceiptModal.module.css';

function proxyUrl(url, title) {
  const filename = title?.replace(/[^\w֐-׿\s-]/g, '').trim() || 'קבלה';
  return `/api/receipt-proxy?url=${encodeURIComponent(url)}&filename=${encodeURIComponent(filename)}`;
}

export default function ReceiptModal({ url, title, onClose }) {
  const proxied = proxyUrl(url, title);
  useEffect(() => {
    function handleKey(e) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
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
            <button className={styles.closeBtn} onClick={onClose}>✕</button>
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
