import { useState } from 'react';
import styles from './TransactionsTable.module.css';
import ReceiptModal from '../ReceiptModal/ReceiptModal.jsx';
import SendEmailModal from '../SendEmailModal/SendEmailModal.jsx';

const COLUMNS = [
  { key: 'transaction_time_iso', label: 'תאריך' },
  { key: 'client_name',          label: 'שם תורם' },
  { key: 'amount',               label: 'סכום' },
  { key: 'transaction_type',     label: 'סוג עסקה' },
  { key: 'group_name',           label: 'קבוצה' },
  { key: 'mosad_number',         label: 'מוסד' },
  { key: null,                   label: 'קבלה' },
  { key: null,                   label: 'מייל' },
];

const EMAIL_ROLES = new Set(['admin', 'editor']);

function SortIcon({ active, dir }) {
  if (!active) return <span className={styles.sortIcon}>⇅</span>;
  return <span className={`${styles.sortIcon} ${styles.sortActive}`}>{dir === 'asc' ? '↑' : '↓'}</span>;
}

function formatDate(raw, iso) {
  if (raw) return raw;
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('he-IL', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

const VALID_CURRENCIES = new Set(['ILS', 'USD', 'EUR', 'GBP']);

function formatAmount(amount, currency) {
  if (amount == null) return '—';
  const code = VALID_CURRENCIES.has(currency) ? currency : 'ILS';
  return new Intl.NumberFormat('he-IL', {
    style: 'currency',
    currency: code,
    maximumFractionDigits: 2,
  }).format(amount);
}

function ReceiptBtn({ receiptData, receiptDocNum, clientName, onPreview }) {
  if (!receiptData) return <span className={styles.muted}>—</span>;
  const url = `https://files.ezcount.co.il/front/documents/get/${receiptData}`;
  return (
    <button
      className={styles.receiptLink}
      onClick={() => onPreview({ url, title: `קבלה ${receiptDocNum ?? ''} — ${clientName ?? ''}` })}
    >
      {receiptDocNum || 'קבלה'}
    </button>
  );
}

export default function TransactionsTable({ transactions, institutions, loading, pagination, sort, onSort, onPageChange, role }) {
  const [receipt, setReceipt] = useState(null);
  const [emailTx, setEmailTx] = useState(null);
  const canEmail = EMAIL_ROLES.has(role);
  const institutionMap = Object.fromEntries(
    institutions.map((i) => [i.mosad_number, i.mosad_name])
  );

  if (loading) {
    return <div className={styles.wrapper}><div className={styles.loading}>טוען נתונים...</div></div>;
  }

  if (!transactions.length) {
    return <div className={styles.wrapper}><div className={styles.empty}>לא נמצאו עסקאות</div></div>;
  }

  return (
    <div className={styles.wrapper}>
      <div className={styles.tableContainer}>
        <table className={styles.table}>
          <thead>
            <tr>
              {COLUMNS.map(({ key, label }) => (
                <th
                  key={label}
                  className={key ? styles.sortable : ''}
                  onClick={key ? () => onSort(key) : undefined}
                >
                  <span className={styles.thInner}>
                    {label}
                    {key && <SortIcon active={sort.sort_by === key} dir={sort.sort_dir} />}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {transactions.map((tx) => (
              <tr key={tx.id}>
                <td className={styles.date}>{formatDate(tx.transaction_time_raw, tx.transaction_time_iso)}</td>
                <td className={styles.name}>{tx.client_name || '—'}</td>
                <td className={styles.amount}>{formatAmount(tx.amount, tx.currency)}</td>
                <td>{tx.transaction_type || '—'}</td>
                <td>{tx.group_name || '—'}</td>
                <td>{institutionMap[tx.mosad_number] || tx.mosad_number || '—'}</td>
                <td>
                  <ReceiptBtn
                    receiptData={tx.receipt_data}
                    receiptDocNum={tx.receipt_doc_num}
                    clientName={tx.client_name}
                    onPreview={setReceipt}
                  />
                </td>
                <td>
                  {canEmail && tx.email ? (
                    <button
                      className={styles.receiptLink}
                      onClick={() => setEmailTx(tx)}
                      title={`שלח מייל אל ${tx.email}`}
                    >
                      ✉ שלח
                    </button>
                  ) : (
                    <span className={styles.muted}>—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className={styles.pagination}>
        <span className={styles.paginationInfo}>
          עמוד {pagination.page} מתוך {pagination.totalPages} | סה"כ {pagination.total.toLocaleString('he-IL')} עסקאות
        </span>
        <div className={styles.paginationButtons}>
          <button className={styles.pageBtn} disabled={pagination.page <= 1} onClick={() => onPageChange(pagination.page - 1)}>
            הקודם
          </button>
          <button className={styles.pageBtn} disabled={pagination.page >= pagination.totalPages} onClick={() => onPageChange(pagination.page + 1)}>
            הבא
          </button>
        </div>
      </div>

      {receipt && (
        <ReceiptModal
          url={receipt.url}
          title={receipt.title}
          onClose={() => setReceipt(null)}
        />
      )}

      {emailTx && (
        <SendEmailModal
          tx={emailTx}
          institutionName={institutionMap[emailTx.mosad_number]}
          onClose={() => setEmailTx(null)}
        />
      )}
    </div>
  );
}
