// Institutions selectable on the public bank-transfer upload page
// (frontend/src/public/PublicTransfer.jsx) and the CRM review screen
// (frontend/src/components/Receipts/ExternalTransfers.jsx). Keep the `id`
// values in sync with frontend/src/constants/transferInstitutions.js — the id
// is what actually travels over the wire; the label there is display-only.
//
// `branch` is the BRANCH_CONFIG key (see _receipts-core.js) used to issue the
// EZCount receipt. `mosadNumber` drives Telegram + fund-sheet routing (see
// _transaction-route.js / resolveInstitution in _transaction-notify.js).
//
// Most institutions use their own mosad number for both receipt and routing.
// תולדות נסים is a historical exception: it has no EZCount account of its
// own, so its receipt is issued under סומך נופלים while routing still targets
// its own מוסד number/channel/sheet (see project_toldot_public_transfer memory).
export const TRANSFER_INSTITUTIONS = [
  { id: 'toldot',        label: 'תולדות נסים',                 branch: 'סומך נופלים',              mosadNumber: '7016650' },
  { id: 'somech',        label: 'סומך נופלים',                  branch: 'סומך נופלים',              mosadNumber: '7001671' },
  { id: 'or_efraim',     label: 'אור אפרים — קבלה על תרומה',    branch: 'אור אפרים',                mosadNumber: '7001725' },
  { id: 'or_efraim_reg', label: 'אור אפרים — קבלה רגילה',       branch: 'אור אפרים קבלה רגיל',      mosadNumber: '7001725' },
  { id: 'chachmei',      label: 'חכמי ירושלים — קבלה על תרומה', branch: 'חכמי ירושלים',             mosadNumber: '7001916' },
  { id: 'chachmei_reg',  label: 'חכמי ירושלים — קבלה רגילה',    branch: 'חכמי ירושלים קבלה רגיל',   mosadNumber: '7001916' },
];

export function institutionById(id) {
  return TRANSFER_INSTITUTIONS.find((i) => i.id === id) || null;
}
