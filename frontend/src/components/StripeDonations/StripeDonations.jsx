import { useState, useEffect, useCallback } from 'react';
import { authFetch } from '../../services/api.js';
import { exportXlsx, dateStamp } from '../../lib/exportXlsx.js';
import { formatCurrency, formatDate, formatDateTime, formatNumber } from '../../lib/format.js';
import {
  Card, Stack, Toolbar, ToolbarSpacer, ToolbarMeta, SearchInput, SegmentedControl, Button, Badge,
  Table, SortTh, toggleSort, sortRows, TableMessage, Pagination, tableStyles as t, toolbarSearchClass, useToast,
} from '../ui';

const INTERVAL_MAP = { day: 'יומי', week: 'שבועי', month: 'חודשי', year: 'שנתי' };

/* ── Donations view ──────────────────────────────────────────────── */
function DonationsView() {
  const toast = useToast();
  const [data, setData]         = useState([]);
  const [total, setTotal]       = useState(0);
  const [page, setPage]         = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [query, setQuery]       = useState('');
  const [loading, setLoading]   = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [syncing, setSyncing]   = useState(false);
  const [exporting, setExporting] = useState(false);
  const [sort, setSort]         = useState({ col: 'paid_at', dir: 'desc' });

  const load = useCallback(async (p = 1) => {
    setLoading(true);
    setErrorMsg('');
    try {
      const params = { page: p, sort_by: sort.col, sort_dir: sort.dir };
      if (query) params.search = query;
      const res = await authFetch(`/api/stripe-donations?${new URLSearchParams(params)}`);
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
  }, [query, sort]);

  useEffect(() => { load(1); }, [load]);

  const syncCustomers = async () => {
    setSyncing(true);
    try {
      const res  = await authFetch('/api/stripe-donations', { method: 'POST' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      toast.success(`עודכנו ${formatNumber(json.updated)} רשומות`);
      load(1);
    } catch (e) { toast.error(`הסנכרון נכשל: ${e.message || 'שגיאת רשת'}`); }
    finally { setSyncing(false); }
  };

  const exportAll = async () => {
    setExporting(true);
    try {
      const params = { all: 1, sort_by: sort.col, sort_dir: sort.dir };
      if (query) params.search = query;
      const res  = await authFetch(`/api/stripe-donations?${new URLSearchParams(params)}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Export failed');
      const rows = (json.data ?? []).map((r) => ({
        'שם תורם': r.resolved_name ?? r.donor_name ?? '',
        'מייל':    r.resolved_email ?? r.donor_email ?? '',
        'סכום':    r.amount ?? '',
        'מטבע':    r.currency ?? '',
        'תאריך':   formatDateTime(r.paid_at),
        'ID תורם': r.stripe_customer_id ?? '',
      }));
      if (rows.length) await exportXlsx(rows, `stripe-donations-${dateStamp()}.xlsx`, 'תרומות');
    } catch (e) { toast.error(`הייצוא נכשל: ${e.message}`); }
    finally { setExporting(false); }
  };

  const th = (label, col) => <SortTh label={label} col={col} sort={sort} onSort={(c) => setSort((p) => toggleSort(p, c))} />;

  return (
    <Card clip>
      <Toolbar>
        <SearchInput className={toolbarSearchClass} value={query} onSearch={setQuery} placeholder="חיפוש לפי שם, מייל, ID…" />
        <ToolbarSpacer />
        <ToolbarMeta>{formatNumber(total)} תרומות</ToolbarMeta>
        <Button icon="download" onClick={exportAll} loading={exporting} disabled={!total}>ייצוא לאקסל</Button>
        <Button icon="refresh" onClick={syncCustomers} loading={syncing}>סנכרון שמות</Button>
      </Toolbar>

      <Table stackOnMobile busy={loading && data.length > 0}>
        <thead>
          <tr>
            {th('שם תורם', 'resolved_name')}
            {th('מייל', 'donor_email')}
            {th('סכום', 'amount')}
            {th('תאריך', 'paid_at')}
            {th('ID תורם', 'stripe_customer_id')}
          </tr>
        </thead>
        <tbody>
          {loading && !data.length ? (
            <TableMessage colSpan={5} kind="loading" />
          ) : errorMsg ? (
            <TableMessage colSpan={5} kind="error" description={errorMsg} action={<Button size="sm" icon="refresh" onClick={() => load(page)}>נסה שוב</Button>} />
          ) : !data.length ? (
            <TableMessage colSpan={5} title="לא נמצאו תרומות" description={query ? 'נסה לשנות את החיפוש' : undefined} />
          ) : data.map((row) => (
            <tr key={row.id}>
              <td data-label="שם" className={t.strong}>{row.resolved_name ?? row.donor_name ?? '—'}</td>
              <td data-label="מייל" className={t.muted}>{row.resolved_email ?? row.donor_email ?? '—'}</td>
              <td data-label="סכום" className={t.amount}>{formatCurrency(row.amount, row.currency)}</td>
              <td data-label="תאריך" className={t.date}>{formatDateTime(row.paid_at)}</td>
              <td data-label="ID תורם" className={t.mono}>{row.stripe_customer_id ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </Table>

      <Pagination page={page} totalPages={totalPages} total={total} itemLabel="תרומות" onPageChange={load} disabled={loading} />
    </Card>
  );
}

/* ── Subscriptions view ──────────────────────────────────────────── */
function NextBilling({ iso }) {
  if (!iso) return '—';
  const days = Math.ceil((new Date(iso).getTime() - Date.now()) / 86400000);
  return (
    <span className={t.actions}>
      <span className={t.date}>{formatDate(iso)}</span>
      {days >= 0 && days <= 7
        ? <Badge tone="warning">{days === 0 ? 'היום' : days === 1 ? 'מחר' : `בעוד ${days} ימים`}</Badge>
        : days > 7 && <span className={t.subtle}>בעוד {days} ימים</span>}
    </span>
  );
}

function SubscriptionsView() {
  const toast = useToast();
  const [data, setData]       = useState([]);
  const [total, setTotal]     = useState(0);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [syncing, setSyncing] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [search, setSearch]   = useState('');
  const [sort, setSort]       = useState({ col: 'next_billing', dir: 'asc' });

  const load = useCallback(async () => {
    setLoading(true);
    setErrorMsg('');
    try {
      const params = { view: 'subscriptions' };
      if (search) params.search = search;
      const res  = await authFetch(`/api/stripe-donations?${new URLSearchParams(params)}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'שגיאה בטעינת הנתונים');
      setData(json.data ?? []);
      setTotal(json.total ?? 0);
    } catch (e) {
      setErrorMsg(e.message);
      setData([]);
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => { load(); }, [load]);

  const syncSubs = async () => {
    setSyncing(true);
    try {
      const res  = await authFetch('/api/stripe-donations?action=subscriptions', { method: 'POST' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      toast.success(json.message ?? `סונכרנו ${formatNumber(json.synced)} מנויים`);
      load();
    } catch (e) { toast.error(`הסנכרון נכשל: ${e.message || 'שגיאת רשת'}`); }
    finally { setSyncing(false); }
  };

  // Client-side sort (data is already fully loaded — no pagination here)
  const sorted = sortRows(data, sort.col, sort.dir);

  const exportAll = async () => {
    setExporting(true);
    try {
      const rows = sorted.map((r) => ({
        'שם':           r.name ?? '',
        'מייל':         r.email ?? '',
        'טלפון':        r.phone ?? '',
        'סכום':         r.amount ?? '',
        'מטבע':         r.currency ?? '',
        'תדירות':       INTERVAL_MAP[r.interval] ?? r.interval ?? '',
        'חיוב הבא':     formatDate(r.next_billing),
        'יתרת חיובים': r.total_cycles ?? (r.cancel_at_period_end ? '' : 'מתמשך'),
        'סטטוס':        r.cancel_at_period_end ? 'מסתיים בסוף תקופה' : 'פעיל',
      }));
      await exportXlsx(rows, `stripe-subscriptions-${dateStamp()}.xlsx`, 'מנויים');
    } catch (e) { toast.error(`הייצוא נכשל: ${e.message}`); }
    finally { setExporting(false); }
  };

  const th = (label, col) => <SortTh label={label} col={col} sort={sort} onSort={(c) => setSort((p) => toggleSort(p, c))} />;

  return (
    <Card clip>
      <Toolbar>
        <SearchInput className={toolbarSearchClass} value={search} onSearch={setSearch} placeholder="חיפוש לפי שם או מייל…" />
        <ToolbarSpacer />
        <ToolbarMeta>{formatNumber(total)} מנויים פעילים</ToolbarMeta>
        <Button icon="download" onClick={exportAll} loading={exporting} disabled={!sorted.length}>ייצוא לאקסל</Button>
        <Button icon="refresh" onClick={syncSubs} loading={syncing}>סנכרון מנויים</Button>
      </Toolbar>

      <Table stackOnMobile busy={loading && data.length > 0}>
        <thead>
          <tr>
            {th('שם', 'name')}
            {th('מייל', 'email')}
            {th('סכום', 'amount')}
            {th('תדירות', 'interval')}
            {th('חיוב הבא', 'next_billing')}
            {th('יתרת חיובים', 'total_cycles')}
            <th>סטטוס</th>
          </tr>
        </thead>
        <tbody>
          {loading && !data.length ? (
            <TableMessage colSpan={7} kind="loading" />
          ) : errorMsg ? (
            <TableMessage colSpan={7} kind="error" description={errorMsg} action={<Button size="sm" icon="refresh" onClick={load}>נסה שוב</Button>} />
          ) : !sorted.length ? (
            <TableMessage colSpan={7} title="אין מנויים פעילים" description={search ? 'נסה לשנות את החיפוש' : undefined} />
          ) : sorted.map((row) => (
            <tr key={row.id}>
              <td data-label="שם" className={t.strong}>{row.name ?? '—'}</td>
              <td data-label="מייל" className={t.muted}>{row.email ?? '—'}</td>
              <td data-label="סכום" className={t.amount}>{row.amount != null ? formatCurrency(row.amount, row.currency) : '—'}</td>
              <td data-label="תדירות" className={t.muted}>{INTERVAL_MAP[row.interval] ?? row.interval ?? '—'}</td>
              <td data-label="חיוב הבא"><NextBilling iso={row.next_billing} /></td>
              <td data-label="יתרת חיובים" className={t.muted}>
                {row.total_cycles != null ? row.total_cycles : (row.cancel_at_period_end ? '—' : 'מתמשך')}
              </td>
              <td data-label="סטטוס">
                {row.cancel_at_period_end
                  ? <Badge tone="warning">מסתיים בסוף התקופה</Badge>
                  : <Badge tone="success" dot>פעיל</Badge>}
              </td>
            </tr>
          ))}
        </tbody>
      </Table>
    </Card>
  );
}

/* ── Main component ──────────────────────────────────────────────── */
const VIEWS = [
  { value: 'donations', label: 'תרומות' },
  { value: 'subscriptions', label: 'מנויים פעילים' },
];

export default function StripeDonations() {
  const [view, setView] = useState('donations');
  return (
    <Stack>
      <div>
        <SegmentedControl options={VIEWS} value={view} onChange={setView} aria-label="תצוגת Stripe" />
      </div>
      {view === 'donations' ? <DonationsView /> : <SubscriptionsView />}
    </Stack>
  );
}
