// Institutions selectable on the public bank-transfer upload page
// (src/public/PublicTransfer.jsx) and the CRM review screen
// (src/components/Receipts/ExternalTransfers.jsx). Keep the `id` values in
// sync with frontend/api/_transfer-institutions.js — the `id` is what's
// actually sent to the server; the label here is display-only.
export const TRANSFER_INSTITUTIONS = [
  { id: 'toldot',        label: 'תולדות נסים' },
  { id: 'somech',        label: 'סומך נופלים' },
  { id: 'or_efraim',     label: 'אור אפרים — קבלה על תרומה' },
  { id: 'or_efraim_reg', label: 'אור אפרים — קבלה רגילה' },
  { id: 'chachmei',      label: 'חכמי ירושלים — קבלה על תרומה' },
  { id: 'chachmei_reg',  label: 'חכמי ירושלים — קבלה רגילה' },
];
