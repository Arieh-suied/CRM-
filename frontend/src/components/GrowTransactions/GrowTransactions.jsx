import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabase.js';
import ReceiptModal from '../ReceiptModal/ReceiptModal.jsx';
import { exportXlsx, dateStamp } from '../../lib/exportXlsx.js';
import { formatCurrency, formatDate, formatNumber } from '../../lib/format.js';
import {
  Card, Toolbar, ToolbarSpacer, ToolbarMeta, SearchInput, Select, Button, Badge,
  Table, SortTh, toggleSort, TableMessage, Pagination, tableStyles as t, toolbarSearchClass, useToast,
} from '../ui';

const PAGE_SIZE = 50;

const STATUS = {
  received: { label: 'התקבל', tone: 'neutral' },
  success:  { label: 'הופקה קבלה', tone: 'success' },
  failed:   { label: 'נכשל', tone: 'danger' },
};

function StatusBadge({ status }) {
  const s = STATUS[status];
  return <Badge tone={s?.tone ?? 'neutral'} dot>{s?.label ?? status}</Badge>;
}

const paymentDate = (row) => row.payment_date ?? formatDate(row.created_at);

export default function GrowTransactions() {
  const toast = useToast();
  const [data, setData]       = useState([]);
  const [total, setTotal]     = useState(0);
  const [page, setPage]       = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [query, setQuery]     = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [exporting, setExporting] = useState(false);
  const [sort, setSort]       = useState({ col: 'created_at', dir: 'desc' });
  const [receipt, setReceipt] = useState(null);

  const load = useCallback(async (p = 1) => {
    setLoading(true);
    setErrorMsg('');
    const from = (p - 1) * PAGE_SIZE;
    let q = supabase
      .from('grow_transactions')
      .select('*', { count: 'exact' })
      .order(sort.col, { ascending: sort.dir === 'asc', nullsLast: true })
      .range(from, from + PAGE_SIZE - 1);

    if (statusFilter) q = q.eq('status', statusFilter);
    if (query) q = q.or(`full_name.ilike.%${query}%,payer_email.ilike.%${query}%,transaction_code.ilike.%${query}%,asmachta.ilike.%${query}%`);

    const { data: rows, count, error } = await q;
    if (error) {
      setErrorMsg(error.message);
      setData([]);
    } else {
      setData(rows ?? []);
      setTotal(count ?? 0);
      setTotalPages(Math.max(1, Math.ceil((count ?? 0) / PAGE_SIZE)));
    }
    setPage(p);
    setLoading(false);
  }, [query, statusFilter, sort]);

  useEffect(() => { load(1); }, [load]);

  // Export pulls every matching row in 1000-row chunks (Supabase caps each
  // request), with the same filters and sort as the table.
  const exportAll = async () => {
    setExporting(true);
    try {
      const CHUNK = 1000;
      const all = [];
      for (let from = 0; from < 20000; from += CHUNK) {
        let q = supabase
          .from('grow_transactions')
          .select('*')
          .order(sort.col, { ascending: sort.dir === 'asc', nullsLast: true })
          .range(from, from + CHUNK - 1);
        if (statusFilter) q = q.eq('status', statusFilter);
        if (query) q = q.or(`full_name.ilike.%${query}%,payer_email.ilike.%${query}%,transaction_code.ilike.%${query}%,asmachta.ilike.%${query}%`);
        const { data: rows, error } = await q;
        if (error) throw new Error(error.message);
        all.push(...(rows ?? []));
        if (!rows || rows.length < CHUNK) break;
      }
      const out = all.map((r) => ({
        'תאריך':     paymentDate(r),
        'תורם':      r.full_name ?? '',
        'מייל':      r.payer_email ?? '',
        'סכום':      r.payment_sum ?? '',
        'אסמכתא':    r.asmachta ?? '',
        'סטטוס':     STATUS[r.status]?.label ?? r.status ?? '',
        'מס\' קבלה': r.ezcount_doc_number ?? '',
      }));
      if (out.length) await exportXlsx(out, `grow-transactions-${dateStamp()}.xlsx`, 'עסקאות Grow');
    } catch (e) { toast.error(`הייצוא נכשל: ${e.message}`); }
    finally { setExporting(false); }
  };

  const th = (label, col) => <SortTh label={label} col={col} sort={sort} onSort={(c) => setSort((p) => toggleSort(p, c))} />;

  return (
    <>
      <Card clip>
        <Toolbar>
          <SearchInput className={toolbarSearchClass} value={query} onSearch={setQuery} placeholder="חיפוש לפי שם, מייל, אסמכתא…" />
          <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} aria-label="סטטוס">
            <option value="">כל הסטטוסים</option>
            <option value="success">הופקה קבלה</option>
            <option value="failed">נכשל</option>
            <option value="received">התקבל</option>
          </Select>
          <ToolbarSpacer />
          <ToolbarMeta>{formatNumber(total)} עסקאות</ToolbarMeta>
          <Button icon="download" onClick={exportAll} loading={exporting} disabled={!total}>ייצוא לאקסל</Button>
        </Toolbar>

        <Table stackOnMobile busy={loading && data.length > 0}>
          <thead>
            <tr>
              {th('תאריך', 'created_at')}
              {th('תורם', 'full_name')}
              {th('מייל', 'payer_email')}
              {th('סכום', 'payment_sum')}
              {th('אסמכתא', 'asmachta')}
              {th('סטטוס', 'status')}
              <th>קבלה</th>
              <th>שגיאה</th>
            </tr>
          </thead>
          <tbody>
            {loading && !data.length ? (
              <TableMessage colSpan={8} kind="loading" />
            ) : errorMsg ? (
              <TableMessage colSpan={8} kind="error" description={errorMsg} action={<Button size="sm" icon="refresh" onClick={() => load(page)}>נסה שוב</Button>} />
            ) : !data.length ? (
              <TableMessage colSpan={8} title="לא נמצאו עסקאות" description={query || statusFilter ? 'נסה לשנות את החיפוש או את הסטטוס' : undefined} />
            ) : data.map((row) => {
              const failure = row.status === 'failed'
                ? (row.ezcount_response?.error || row.ezcount_response?.errMsg || 'שגיאה לא ידועה')
                : null;
              return (
                <tr key={row.id}>
                  <td data-label="תאריך" className={t.date}>{paymentDate(row)}</td>
                  <td data-label="תורם" className={t.strong}>{row.full_name ?? '—'}</td>
                  <td data-label="מייל" className={t.muted}>{row.payer_email ?? '—'}</td>
                  <td data-label="סכום" className={t.amount}>{formatCurrency(row.payment_sum)}</td>
                  <td data-label="אסמכתא" className={t.mono}>{row.asmachta ?? '—'}</td>
                  <td data-label="סטטוס"><StatusBadge status={row.status} /></td>
                  <td data-label="קבלה">
                    {row.ezcount_response?.pdf_link ? (
                      <Button
                        size="sm"
                        variant="soft"
                        icon="receipt"
                        onClick={() => setReceipt({
                          url: row.ezcount_response.pdf_link,
                          title: `קבלה ${row.ezcount_doc_number ?? ''} — ${row.full_name ?? ''}`,
                        })}
                      >
                        {row.ezcount_doc_number ?? 'קבלה'}
                      </Button>
                    ) : <span className={t.subtle}>—</span>}
                  </td>
                  <td data-label="שגיאה" className={failure ? `${t.danger} ${t.truncate}` : t.subtle} title={failure || undefined}>
                    {failure ?? '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </Table>

        <Pagination page={page} totalPages={totalPages} total={total} itemLabel="עסקאות" onPageChange={load} disabled={loading} />
      </Card>

      {receipt && <ReceiptModal url={receipt.url} title={receipt.title} onClose={() => setReceipt(null)} />}
    </>
  );
}
