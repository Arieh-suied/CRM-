import { useState, useEffect, useCallback } from 'react';
import styles from './PaymentFailures.module.css';
import { fetchPaymentFailures, syncGmailFailures, setPaymentFailureResolved } from '../../services/api.js';
import { exportXlsx, dateStamp } from '../../lib/exportXlsx.js';
import { formatCurrency, formatDate, formatNumber } from '../../lib/format.js';
import { useAuth } from '../../contexts/AuthContext.jsx';
import {
  Card, Toolbar, ToolbarSpacer, ToolbarMeta, SearchInput, Select, DateRange, Button,
  Table, SortTh, toggleSort, TableMessage, Pagination, tableStyles as t, toolbarSearchClass, useToast,
} from '../ui';

const toExportRow = (row, showCategory) => ({
  'טופל':        row.resolved ? 'כן' : 'לא',
  'תאריך':       formatDate(row.created_at),
  'מוסד':        (showCategory ? row.category : row.institution_name) ?? '',
  'שם לקוח':     row.customer_name ?? '',
  'ת"ז':         row.customer_id_number ?? '',
  'סכום':        row.amount ?? '',
  'סיבת סירוב':  row.error_reason ?? '',
  'מספר הוראה':  row.order_number ?? '',
  '4 ספרות':     row.last4 ?? '',
  'טלפון':       row.donor_phone ?? '',
  'מייל':        row.donor_email ?? '',
});

export default function PaymentFailures() {
  const { role } = useAuth();
  const toast = useToast();
  const canSync = role !== 'institution'; // syncing pulls Gmail globally — staff-only, the server also 403s this for institution
  // institution_name is free text parsed from the refusal email and can name
  // an unrelated institution for a sub-fund's rows (see payment-failures.js
  // / _scope.js) — category is the reliable label there, so the institution
  // portal shows that instead in the "מוסד" column. Staff keep seeing
  // institution_name as-is (category there is often just a campaign name).
  const showCategory = role === 'institution';
  const canResolve = role !== 'viewer'; // admin/editor/institution can mark handled — viewer stays read-only
  const [data, setData]           = useState([]);
  const [resolvingId, setResolvingId] = useState(null);
  const [total, setTotal]         = useState(0);
  const [page, setPage]           = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [query, setQuery]         = useState('');
  const [instFilter, setInstFilter] = useState('');
  const [instOptions, setInstOptions] = useState([]);
  const [resolvedFilter, setResolvedFilter] = useState(''); // '', 'false', 'true'
  const [dates, setDates]         = useState({ from: '', to: '' });
  const [sort, setSort]           = useState({ col: 'created_at', dir: 'desc' });
  const [loading, setLoading]     = useState(false);
  const [errorMsg, setErrorMsg]   = useState('');
  const [syncing, setSyncing]     = useState(false);
  const [exporting, setExporting] = useState(false);

  const filterParams = useCallback(() => ({
    ...(query ? { search: query } : {}),
    ...(instFilter ? { institution: instFilter } : {}),
    ...(resolvedFilter ? { resolved: resolvedFilter } : {}),
    ...(dates.from ? { date_from: dates.from } : {}),
    ...(dates.to ? { date_to: dates.to } : {}),
    sort_by: sort.col, sort_dir: sort.dir,
  }), [query, instFilter, resolvedFilter, dates, sort]);

  const load = useCallback(async (p = 1) => {
    setLoading(true);
    setErrorMsg('');
    try {
      const res = await fetchPaymentFailures({ page: p, ...filterParams() });
      setData(res.data ?? []);
      setTotal(res.total ?? 0);
      setTotalPages(res.totalPages ?? 1);
      setPage(p);
    } catch (e) {
      setErrorMsg(e.message);
      setData([]);
    } finally {
      setLoading(false);
    }
  }, [filterParams]);

  useEffect(() => { load(1); }, [load]);

  useEffect(() => {
    if (showCategory) return; // institution role has no institution picker to fill
    fetchPaymentFailures({ action: 'institutions' })
      .then((res) => setInstOptions(res.data ?? []))
      .catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSync = async () => {
    setSyncing(true);
    try {
      const res = await syncGmailFailures();
      toast.success(`סונכרנו ${formatNumber(res.synced)} מיילים`);
      load(1);
    } catch (err) {
      toast.error(`הסנכרון נכשל: ${err.message}`);
    } finally {
      setSyncing(false);
    }
  };

  const handleToggleResolved = async (row) => {
    setResolvingId(row.id);
    try {
      const updated = await setPaymentFailureResolved(row.id, !row.resolved);
      setData((prev) => prev.map((r) => (r.id === row.id ? updated : r)));
    } catch (err) {
      toast.error(`העדכון נכשל: ${err.message}`);
    } finally {
      setResolvingId(null);
    }
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const res = await fetchPaymentFailures({ all: 1, ...filterParams() });
      const rows = (res.data ?? []).map((row) => toExportRow(row, showCategory));
      if (rows.length) await exportXlsx(rows, `payment-failures-${dateStamp()}.xlsx`, 'סירובים');
    } catch (err) {
      toast.error(`הייצוא נכשל: ${err.message}`);
    } finally {
      setExporting(false);
    }
  };

  const filtered = !!(query || instFilter || resolvedFilter || dates.from || dates.to);
  const th = (label, col) => <SortTh label={label} col={col} sort={sort} onSort={(c) => setSort((p) => toggleSort(p, c, 'desc'))} />;

  return (
    <Card clip>
      <Toolbar>
        <SearchInput className={toolbarSearchClass} value={query} onSearch={setQuery} placeholder="חיפוש לפי שם, מוסד, מספר הוראה, מייל…" />
        {!showCategory && (
          <Select value={instFilter} onChange={(e) => setInstFilter(e.target.value)} aria-label="מוסד">
            <option value="">כל המוסדות</option>
            {instOptions.map((name) => <option key={name} value={name}>{name}</option>)}
          </Select>
        )}
        <Select value={resolvedFilter} onChange={(e) => setResolvedFilter(e.target.value)} aria-label="סטטוס טיפול">
          <option value="">כל הסטטוסים</option>
          <option value="false">טרם טופל</option>
          <option value="true">טופל</option>
        </Select>
        <DateRange from={dates.from} to={dates.to} onChange={setDates} />
        <ToolbarSpacer />
        <ToolbarMeta>{formatNumber(total)} סירובים</ToolbarMeta>
        <Button icon="download" onClick={handleExport} loading={exporting} disabled={!total}>ייצוא לאקסל</Button>
        {canSync && <Button icon="refresh" onClick={handleSync} loading={syncing}>סנכרון מהמייל</Button>}
      </Toolbar>

      <Table stackOnMobile busy={loading && data.length > 0}>
        <thead>
          <tr>
            <th>טופל</th>
            {th('תאריך', 'created_at')}
            {th('מוסד', 'institution_name')}
            {th('שם לקוח', 'customer_name')}
            {th('ת"ז', 'customer_id_number')}
            {th('סכום', 'amount')}
            {th('סיבת סירוב', 'error_reason')}
            {th('מספר הוראה', 'order_number')}
            <th>4 ספרות</th>
            <th>טלפון</th>
            <th>מייל</th>
          </tr>
        </thead>
        <tbody>
          {loading && !data.length ? (
            <TableMessage colSpan={11} kind="loading" />
          ) : errorMsg ? (
            <TableMessage colSpan={11} kind="error" description={errorMsg} action={<Button size="sm" icon="refresh" onClick={() => load(page)}>נסה שוב</Button>} />
          ) : !data.length ? (
            <TableMessage colSpan={11} title="לא נמצאו סירובים" description={filtered ? 'נסה לשנות את החיפוש או המסננים' : undefined} />
          ) : data.map((row) => (
            <tr key={row.id ?? row.gmail_message_id} className={row.resolved ? t.rowMuted : undefined}>
              <td data-label="טופל">
                {canResolve ? (
                  <label className={styles.resolve}>
                    <input
                      type="checkbox"
                      checked={!!row.resolved}
                      disabled={resolvingId === row.id}
                      onChange={() => handleToggleResolved(row)}
                    />
                    <span>{row.resolved ? 'טופל' : 'טרם טופל'}</span>
                  </label>
                ) : (
                  <span className={row.resolved ? t.subtle : undefined}>{row.resolved ? 'טופל' : 'טרם טופל'}</span>
                )}
              </td>
              <td data-label="תאריך" className={t.date}>{formatDate(row.created_at)}</td>
              <td data-label="מוסד">{(showCategory ? row.category : row.institution_name) ?? '—'}</td>
              <td data-label="שם לקוח" className={t.strong}>{row.customer_name ?? '—'}</td>
              <td data-label='ת"ז' className={t.num}>{row.customer_id_number ?? '—'}</td>
              <td data-label="סכום" className={t.num}>{formatCurrency(row.amount)}</td>
              <td data-label="סיבת סירוב" className={row.resolved ? undefined : t.danger}>{row.error_reason ?? '—'}</td>
              <td data-label="מספר הוראה" className={t.mono}>{row.order_number ?? '—'}</td>
              <td data-label="4 ספרות" className={t.mono}>{row.last4 ?? '—'}</td>
              <td data-label="טלפון" className={t.num}>{row.donor_phone ?? '—'}</td>
              <td data-label="מייל" className={t.muted}>{row.donor_email ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </Table>

      <Pagination page={page} totalPages={totalPages} total={total} itemLabel="סירובים" onPageChange={load} disabled={loading} />
    </Card>
  );
}
