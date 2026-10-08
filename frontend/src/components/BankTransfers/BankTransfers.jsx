import { useState, useEffect, useCallback } from 'react';
import ReceiptModal from '../ReceiptModal/ReceiptModal.jsx';
import { authFetch } from '../../services/api.js';
import { exportXlsx, dateStamp } from '../../lib/exportXlsx.js';
import { formatCurrency, formatDate, formatNumber } from '../../lib/format.js';
import {
  Card, Toolbar, ToolbarSpacer, ToolbarMeta, SearchInput, Select, Button,
  Table, SortTh, toggleSort, TableMessage, Pagination, tableStyles as t, toolbarSearchClass, useToast,
} from '../ui';

// Only the 5 receipt-issuing institutions appear in the mosad filter:
// סומך נופלים, אור אפרים (+שכ"ל), חכמי ירושלים (+שכ"ל)
const FILTER_MOSAD_NUMBERS = new Set(['7001671', '7001725', '7003860', '7001916', '7003862']);

const receiptUrl = (id) => `https://files.ezcount.co.il/front/documents/get/${id}`;

export default function BankTransfers({ institutions }) {
  const toast = useToast();
  const [data, setData]           = useState([]);
  const [total, setTotal]         = useState(0);
  const [page, setPage]           = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [query, setQuery]         = useState('');
  const [mosadFilter, setMosadFilter] = useState('');
  const [loading, setLoading]     = useState(false);
  const [errorMsg, setErrorMsg]   = useState('');
  const [receipt, setReceipt]     = useState(null);
  const [exporting, setExporting] = useState(false);
  const [sort, setSort]           = useState({ col: 'created_at', dir: 'desc' });

  const institutionMap = Object.fromEntries(
    (institutions ?? []).map((i) => [i.mosad_number, i.mosad_name])
  );

  const load = useCallback(async (p = 1) => {
    setLoading(true);
    setErrorMsg('');
    try {
      const params = { page: p, sort_by: sort.col, sort_dir: sort.dir };
      if (query)       params.search       = query;
      if (mosadFilter) params.mosad_number = mosadFilter;
      const res = await authFetch(`/api/bank-transfers?${new URLSearchParams(params)}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'שגיאה בטעינת הנתונים');
      setData(json.data ?? []);
      setTotal(json.total ?? 0);
      setTotalPages(json.totalPages ?? 1);
      setPage(p);
    } catch (e) {
      setErrorMsg(e.message);
      setData([]);
    } finally {
      setLoading(false);
    }
  }, [query, mosadFilter, sort]);

  useEffect(() => { load(1); }, [load]);

  const exportAll = async () => {
    setExporting(true);
    try {
      const params = { all: 1, sort_by: sort.col, sort_dir: sort.dir };
      if (query)       params.search       = query;
      if (mosadFilter) params.mosad_number = mosadFilter;
      const res  = await authFetch(`/api/bank-transfers?${new URLSearchParams(params)}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Export failed');
      const rows = (json.data ?? []).map((r) => ({
        'תאריך':   formatDate(r.document_date_raw ?? r.document_date),
        'שם לקוח': r.customer_name ?? '',
        'ת"ז':     r.customer_id_number ?? '',
        'מייל':    r.customer_email ?? '',
        'סכום':    r.transfer_amount ?? '',
        'מטבע':    r.currency ?? '',
        'בנק':     r.bank_name ?? '',
        'סניף':    r.bank_branch ?? '',
        'חשבון':   r.bank_account ?? '',
        'מוסד':    institutionMap[r.mosad_number] ?? r.mosad_number ?? '',
        'מסמך':    r.document_number ?? '',
        'הערה':    r.document_note ?? '',
      }));
      if (rows.length) await exportXlsx(rows, `bank-transfers-${dateStamp()}.xlsx`, 'העברות');
    } catch (e) { toast.error(`הייצוא נכשל: ${e.message}`); }
    finally { setExporting(false); }
  };

  const th = (label, col) => <SortTh label={label} col={col} sort={sort} onSort={(c) => setSort((p) => toggleSort(p, c))} />;
  const filtered = !!(query || mosadFilter);

  return (
    <>
      <Card clip>
        <Toolbar>
          <SearchInput className={toolbarSearchClass} value={query} onSearch={setQuery} placeholder='חיפוש לפי שם, מייל, ת"ז, מסמך…' />
          <Select value={mosadFilter} onChange={(e) => setMosadFilter(e.target.value)} aria-label="מוסד">
            <option value="">כל המוסדות</option>
            {(institutions ?? [])
              .filter((i) => FILTER_MOSAD_NUMBERS.has(String(i.mosad_number)))
              .map((i) => <option key={i.mosad_number} value={i.mosad_number}>{i.mosad_name}</option>)}
          </Select>
          <ToolbarSpacer />
          <ToolbarMeta>{formatNumber(total)} העברות</ToolbarMeta>
          <Button icon="download" onClick={exportAll} loading={exporting} disabled={!total}>ייצוא לאקסל</Button>
        </Toolbar>

        <Table stackOnMobile busy={loading && data.length > 0}>
          <thead>
            <tr>
              {th('תאריך', 'created_at')}
              {th('שם לקוח', 'customer_name')}
              {th('ת"ז', 'customer_id_number')}
              {th('מייל', 'customer_email')}
              {th('סכום', 'transfer_amount')}
              {th('בנק', 'bank_name')}
              {th('סניף', 'bank_branch')}
              {th('חשבון', 'bank_account')}
              {th('מוסד', 'mosad_number')}
              {th('מסמך', 'document_number')}
              <th>הערה</th>
              <th>קבלה</th>
            </tr>
          </thead>
          <tbody>
            {loading && !data.length ? (
              <TableMessage colSpan={12} kind="loading" />
            ) : errorMsg ? (
              <TableMessage colSpan={12} kind="error" description={errorMsg} action={<Button size="sm" icon="refresh" onClick={() => load(page)}>נסה שוב</Button>} />
            ) : !data.length ? (
              <TableMessage colSpan={12} title="לא נמצאו העברות" description={filtered ? 'נסה לשנות את החיפוש או את המוסד' : undefined} />
            ) : data.map((row) => (
              <tr key={row.id}>
                <td data-label="תאריך" className={t.date}>{formatDate(row.document_date_raw ?? row.document_date)}</td>
                <td data-label="שם" className={t.strong}>{row.customer_name ?? '—'}</td>
                <td data-label='ת"ז' className={t.num}>{row.customer_id_number ?? '—'}</td>
                <td data-label="מייל" className={t.muted}>{row.customer_email ?? '—'}</td>
                <td data-label="סכום" className={t.amount}>{formatCurrency(row.transfer_amount, row.currency)}</td>
                <td data-label="בנק" className={t.muted}>{row.bank_name ?? '—'}</td>
                <td data-label="סניף" className={t.num}>{row.bank_branch ?? '—'}</td>
                <td data-label="חשבון" className={t.num}>{row.bank_account ?? '—'}</td>
                <td data-label="מוסד">{institutionMap[row.mosad_number] ?? row.mosad_number ?? '—'}</td>
                <td data-label="מסמך" className={t.mono}>{row.document_number ?? '—'}</td>
                <td data-label="הערה" className={`${t.muted} ${t.truncate}`} title={row.document_note || undefined}>{row.document_note ?? '—'}</td>
                <td data-label="קבלה">
                  {row.receipt_id ? (
                    <Button
                      size="sm"
                      variant="soft"
                      icon="receipt"
                      onClick={() => setReceipt({
                        url: receiptUrl(row.receipt_id),
                        title: `קבלה ${row.document_number ?? ''} — ${row.customer_name ?? ''}`,
                      })}
                    >
                      {row.document_number ?? 'קבלה'}
                    </Button>
                  ) : <span className={t.subtle}>—</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </Table>

        <Pagination page={page} totalPages={totalPages} total={total} itemLabel="העברות" onPageChange={load} disabled={loading} />
      </Card>

      {receipt && <ReceiptModal url={receipt.url} title={receipt.title} onClose={() => setReceipt(null)} />}
    </>
  );
}
