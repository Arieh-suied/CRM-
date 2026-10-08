import { useState } from 'react';
import ReceiptModal from '../ReceiptModal/ReceiptModal.jsx';
import SendEmailModal from '../SendEmailModal/SendEmailModal.jsx';
import { formatCurrency, formatDateTime } from '../../lib/format.js';
import { Button, Table, SortTh, TableMessage, Pagination, tableStyles as t } from '../ui';

const EMAIL_ROLES = new Set(['admin', 'editor']);

const receiptUrl = (data) => `https://files.ezcount.co.il/front/documents/get/${data}`;

// Table + pagination for the עסקאות screen (sits under FiltersBar in one card).
// Sorting is server-side: `sort` is { sort_by, sort_dir }.
export default function TransactionsTable({ transactions, institutions, loading, error, onRetry, filtered, pagination, sort, onSort, onPageChange, role }) {
  const [receipt, setReceipt] = useState(null);
  const [emailTx, setEmailTx] = useState(null);
  const canEmail = EMAIL_ROLES.has(role);
  const institutionMap = Object.fromEntries(institutions.map((i) => [i.mosad_number, i.mosad_name]));

  const s = { col: sort.sort_by, dir: sort.sort_dir };
  const th = (label, col) => <SortTh label={label} col={col} sort={s} onSort={onSort} />;

  return (
    <>
      <Table stackOnMobile busy={loading && transactions.length > 0}>
        <thead>
          <tr>
            {th('תאריך', 'transaction_time_iso')}
            {th('שם תורם', 'client_name')}
            {th('סכום', 'amount')}
            {th('סוג עסקה', 'transaction_type')}
            {th('קבוצה', 'group_name')}
            {th('מוסד', 'mosad_number')}
            <th>קבלה</th>
            <th>מייל</th>
          </tr>
        </thead>
        <tbody>
          {loading && !transactions.length ? (
            <TableMessage colSpan={8} kind="loading" title="טוען עסקאות…" />
          ) : error ? (
            <TableMessage colSpan={8} kind="error" description={error} action={onRetry && <Button size="sm" icon="refresh" onClick={onRetry}>נסה שוב</Button>} />
          ) : !transactions.length ? (
            <TableMessage colSpan={8} title="לא נמצאו עסקאות" description={filtered ? 'נסה לשנות את החיפוש או את המסננים' : undefined} />
          ) : transactions.map((tx) => (
            <tr key={tx.id}>
              <td data-label="תאריך" className={t.date}>{formatDateTime(tx.transaction_time_raw || tx.transaction_time_iso)}</td>
              <td data-label="שם תורם" className={t.strong}>{tx.client_name || '—'}</td>
              <td data-label="סכום" className={t.amount}>{formatCurrency(tx.amount, tx.currency)}</td>
              <td data-label="סוג עסקה">{tx.transaction_type || '—'}</td>
              <td data-label="קבוצה" className={t.muted}>{tx.group_name || '—'}</td>
              <td data-label="מוסד">{institutionMap[tx.mosad_number] || tx.mosad_number || '—'}</td>
              <td data-label="קבלה">
                {tx.receipt_data ? (
                  <Button
                    size="sm"
                    variant="soft"
                    icon="receipt"
                    onClick={() => setReceipt({ url: receiptUrl(tx.receipt_data), title: `קבלה ${tx.receipt_doc_num ?? ''} — ${tx.client_name ?? ''}` })}
                  >
                    {tx.receipt_doc_num || 'קבלה'}
                  </Button>
                ) : <span className={t.subtle}>—</span>}
              </td>
              <td data-label="מייל">
                {canEmail && tx.email ? (
                  <Button size="sm" variant="ghost" icon="mail" onClick={() => setEmailTx(tx)} title={`שליחת מייל אל ${tx.email}`}>
                    שליחה
                  </Button>
                ) : <span className={t.subtle}>—</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </Table>

      <Pagination
        page={pagination.page}
        totalPages={pagination.totalPages}
        total={pagination.total}
        itemLabel="עסקאות"
        onPageChange={onPageChange}
        disabled={loading}
      />

      {receipt && <ReceiptModal url={receipt.url} title={receipt.title} onClose={() => setReceipt(null)} />}
      {emailTx && (
        <SendEmailModal tx={emailTx} institutionName={institutionMap[emailTx.mosad_number]} onClose={() => setEmailTx(null)} />
      )}
    </>
  );
}
