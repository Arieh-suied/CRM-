import { useState } from 'react';
import styles from './Receipts.module.css';
import QuickReceipt from './QuickReceipt.jsx';
import BatchReceipts from './BatchReceipts.jsx';
import Reconciliation from './Reconciliation.jsx';

const VIEWS = [
  { id: 'quick',   label: 'קבלה מהירה' },
  { id: 'batch',   label: 'העלאת העברות' },
  { id: 'masav',   label: 'הצלבת מסב' },
];

export default function Receipts() {
  const [view, setView] = useState('quick');

  return (
    <div className={styles.wrapper}>
      <div className={styles.subNav}>
        {VIEWS.map(v => (
          <button
            key={v.id}
            className={`${styles.subNavBtn} ${view === v.id ? styles.subNavActive : ''}`}
            onClick={() => setView(v.id)}
          >
            {v.label}
          </button>
        ))}
      </div>

      <div style={{ padding: '20px 18px' }}>
        {view === 'quick' && <QuickReceipt />}
        {view === 'batch' && <BatchReceipts />}
        {view === 'masav' && <Reconciliation />}
      </div>
    </div>
  );
}
