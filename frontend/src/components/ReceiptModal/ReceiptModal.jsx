import { useEffect, useState } from 'react';
import styles from './ReceiptModal.module.css';
import { buildReceiptProxyUrl } from '../../lib/receiptProxy.js';
import { Modal, StateMessage, buttonClass, Icon } from '../ui';

export default function ReceiptModal({ url, title, onClose }) {
  const [proxied, setProxied] = useState(null);

  useEffect(() => {
    const filename = title?.replace(/[^\w֐-׿\s-]/g, '').trim() || 'קבלה';
    let cancelled = false;
    buildReceiptProxyUrl(url, filename).then((u) => { if (!cancelled) setProxied(u); });
    return () => { cancelled = true; };
  }, [url, title]);

  return (
    <Modal
      size="full"
      title={title ?? 'קבלה'}
      onClose={onClose}
      flushBody
      bodyClassName={styles.body}
      headerActions={(
        <a href={url} target="_blank" rel="noopener noreferrer" className={buttonClass({ variant: 'ghost', size: 'sm' })}>
          <Icon name="externalLink" size={14} />
          פתיחה בלשונית חדשה
        </a>
      )}
    >
      {proxied ? <iframe src={proxied} className={styles.frame} title={title ?? 'קבלה'} /> : <StateMessage kind="loading" title="טוען קבלה…" />}
    </Modal>
  );
}
