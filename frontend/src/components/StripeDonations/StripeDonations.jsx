import { useState, useEffect, useCallback } from 'react';
import styles from './StripeDonations.module.css';
import { authFetch } from '../../services/api.js';
import SortTh from '../shared/SortTh.jsx';
import { exportXlsx, dateStamp } from '../../lib/exportXlsx.js';

const fmt = (n, currency = 'USD') =>
  new Intl.NumberFormat('he-IL', { style: 'currency', currency, maximumFractionDigits: 2 }).format(n ?? 0);

function formatDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('he-IL', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function formatDateShort(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

const INTERVAL_MAP = { day: 'יומי', week: 'שבועי', month: 'חודשי', year: 'שנתי' };

/* ── Donations view ──────────────────────────────────────────────── */
function DonationsView() {
  const [data, setData]         = useState([]);
  const [total, setTotal]       = useState(0);
  const [page, setPage]         = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch]     = useState('');
  const [query, setQuery]       = useState('');
  const [loading, setLoading]   = useState(false);
  const [syncing, setSyncing]   = useState(false);
  const [syncMsg, setSyncMsg]   = useState('');
  const [exporting, setExporting] = useState(false);
  const [sort, setSort]         = useState({ col: 'paid_at', dir: 'desc' });

  const handleSort = useCallback((col) => {
    setSort(prev => prev.col === col ? { col, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { col, dir: 'asc' });
  }, []);

  const load = useCallback(async (p = 1) => {
    setLoading(true);
    const params = { page: p, sort_by: sort.col, sort_dir: sort.dir };
    if (query) params.search = query;
    const res = await authFetch(`/api/stripe-donations?${new URLSearchParams(params)}`);
    const json = await res.json();
    setData(json.data ?? []);
    setTotal(json.total ?? 0);
    setTotalPages(json.totalPages ?? 1);
    setPage(p);
    setLoading(false);
  }, [query, sort]);

  useEffect(() => { load(1); }, [load]);

  const syncCustomers = async () => {
    setSyncing(true); setSyncMsg('');
    try {
      const res  = await authFetch('/api/stripe-donations', { method: 'POST' });
      const json = await res.json();
      if (!res.ok) { setSyncMsg(`שגיאה: ${json.error}`); return; }
      setSyncMsg(`עודכנו ${json.updated} רשומות`);
      load(1);
    } catch { setSyncMsg('שגיאת רשת'); }
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
      const rows = (json.data ?? []).map(r => ({
        'שם תורם': r.resolved_name ?? r.donor_name ?? '',
        'מייל':    r.resolved_email ?? r.donor_email ?? '',
        'סכום':    r.amount ?? '',
        'מטבע':    r.currency ?? '',
        'תאריך':   formatDate(r.paid_at),
        'ID תורם': r.stripe_customer_id ?? '',
      }));
      if (rows.length) await exportXlsx(rows, `stripe-donations-${dateStamp()}.xlsx`, 'תרומות');
    } catch (e) { setSyncMsg(`שגיאה: ${e.message}`); }
    finally { setExporting(false); }
  };

  const s = sort;
  return (
    <div className={styles.wrapper}>
      <div className={styles.toolbar}>
        <div className={styles.searchWrap}>
          <svg className={styles.searchIcon} viewBox="0 0 20 20" fill="none">
            <circle cx="9" cy="9" r="6" stroke="currentColor" strokeWidth="1.8"/>
            <path d="M14 14l3 3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
          </svg>
          <input className={styles.search} placeholder="חיפוש לפי שם, מייל, ID..."
            value={search} onChange={e => setSearch(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && setQuery(search)} />
          {search && <button className={styles.clearBtn} onClick={() => { setSearch(''); setQuery(''); }}>✕</button>}
        </div>
        <span className={styles.count}>סה"כ {total.toLocaleString('he-IL')} תרומות</span>
        <div className={styles.syncArea}>
          <button className={styles.syncBtn} onClick={exportAll} disabled={exporting || !total}>
            {exporting ? 'מייצא...' : '⬇ ייצוא אקסל'}
          </button>
          <button className={styles.syncBtn} onClick={syncCustomers} disabled={syncing}>
            {syncing ? 'מסנכרן...' : '⟳ סנכרן שמות'}
          </button>
          {syncMsg && <span className={syncMsg.startsWith('שגיאה') ? styles.syncError : styles.syncSuccess}>{syncMsg}</span>}
        </div>
      </div>

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <SortTh label="שם תורם"  col="resolved_name"      sort={s} onSort={handleSort} />
              <SortTh label="מייל"     col="donor_email"        sort={s} onSort={handleSort} />
              <SortTh label="סכום"     col="amount"             sort={s} onSort={handleSort} />
              <SortTh label="תאריך"    col="paid_at"            sort={s} onSort={handleSort} />
              <SortTh label="ID תורם"  col="stripe_customer_id" sort={s} onSort={handleSort} />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} className={styles.center}>טוען...</td></tr>
            ) : !data.length ? (
              <tr><td colSpan={5} className={styles.center}>אין נתונים</td></tr>
            ) : data.map(row => (
              <tr key={row.id}>
                <td className={styles.name}>{row.resolved_name ?? row.donor_name ?? '—'}</td>
                <td className={styles.email}>{row.resolved_email ?? row.donor_email ?? '—'}</td>
                <td className={styles.amount}>{fmt(row.amount, row.currency)}</td>
                <td className={styles.date}>{formatDate(row.paid_at)}</td>
                <td className={styles.id}>{row.stripe_customer_id ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className={styles.pagination}>
        <span className={styles.paginationInfo}>עמוד {page} מתוך {totalPages}</span>
        <div className={styles.paginationBtns}>
          <button className={styles.pageBtn} disabled={page <= 1} onClick={() => load(page - 1)}>הקודם</button>
          <button className={styles.pageBtn} disabled={page >= totalPages} onClick={() => load(page + 1)}>הבא</button>
        </div>
      </div>
    </div>
  );
}

/* ── Subscriptions view ──────────────────────────────────────────── */
function SubscriptionsView() {
  const [data, setData]       = useState([]);
  const [total, setTotal]     = useState(0);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState('');
  const [exporting, setExporting] = useState(false);
  const [search, setSearch]   = useState('');
  const [sort, setSort]       = useState({ col: 'next_billing', dir: 'asc' });

  const handleSort = useCallback((col) => {
    setSort(prev => prev.col === col ? { col, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { col, dir: 'asc' });
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    const params = { view: 'subscriptions' };
    if (search) params.search = search;
    const res  = await authFetch(`/api/stripe-donations?${new URLSearchParams(params)}`);
    const json = await res.json();
    setData(json.data ?? []);
    setTotal(json.total ?? 0);
    setLoading(false);
  }, [search]);

  useEffect(() => { load(); }, [load]);

  const syncSubs = async () => {
    setSyncing(true); setSyncMsg('');
    try {
      const res  = await authFetch('/api/stripe-donations?action=subscriptions', { method: 'POST' });
      const json = await res.json();
      if (!res.ok) { setSyncMsg(`שגיאה: ${json.error}`); return; }
      setSyncMsg(json.message ?? `סונכרנו ${json.synced} מנויים`);
      load();
    } catch { setSyncMsg('שגיאת רשת'); }
    finally { setSyncing(false); }
  };

  // Client-side sort (data is already fully loaded — no pagination here)
  const sorted = [...data].sort((a, b) => {
    const av = a[sort.col] ?? '', bv = b[sort.col] ?? '';
    const an = parseFloat(av), bn = parseFloat(bv);
    const cmp = (!isNaN(an) && !isNaN(bn)) ? an - bn
      : String(av).localeCompare(String(bv), 'he');
    return sort.dir === 'asc' ? cmp : -cmp;
  });

  const s = sort;
  const now = Date.now();

  return (
    <div className={styles.wrapper}>
      <div className={styles.toolbar}>
        <div className={styles.searchWrap}>
          <svg className={styles.searchIcon} viewBox="0 0 20 20" fill="none">
            <circle cx="9" cy="9" r="6" stroke="currentColor" strokeWidth="1.8"/>
            <path d="M14 14l3 3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
          </svg>
          <input className={styles.search} placeholder="חיפוש לפי שם או מייל..."
            value={search} onChange={e => setSearch(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && load()} />
          {search && <button className={styles.clearBtn} onClick={() => setSearch('')}>✕</button>}
        </div>
        <span className={styles.count}>{total} מנויים פעילים</span>
        <div className={styles.syncArea}>
          <button
            className={styles.syncBtn}
            disabled={exporting || !sorted.length}
            onClick={async () => {
              setExporting(true);
              try {
                const rows = sorted.map(r => ({
                  'שם':           r.name ?? '',
                  'מייל':         r.email ?? '',
                  'טלפון':        r.phone ?? '',
                  'סכום':         r.amount ?? '',
                  'מטבע':         r.currency ?? '',
                  'תדירות':       INTERVAL_MAP[r.interval] ?? r.interval ?? '',
                  'חיוב הבא':     formatDateShort(r.next_billing),
                  'יתרת חיובים': r.total_cycles ?? (r.cancel_at_period_end ? '' : 'מתמשך'),
                  'סטטוס':        r.cancel_at_period_end ? 'מסתיים בסוף תקופה' : 'פעיל',
                }));
                await exportXlsx(rows, `stripe-subscriptions-${dateStamp()}.xlsx`, 'מנויים');
              } finally { setExporting(false); }
            }}
          >
            {exporting ? 'מייצא...' : '⬇ ייצוא אקסל'}
          </button>
          <button className={styles.syncBtn} onClick={syncSubs} disabled={syncing}>
            {syncing ? 'מסנכרן...' : '⟳ סנכרן מנויים'}
          </button>
          {syncMsg && <span className={syncMsg.startsWith('שגיאה') ? styles.syncError : styles.syncSuccess}>{syncMsg}</span>}
        </div>
      </div>

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <SortTh label="שם"            col="name"         sort={s} onSort={handleSort} />
              <SortTh label="מייל"          col="email"        sort={s} onSort={handleSort} />
              <SortTh label="סכום"          col="amount"       sort={s} onSort={handleSort} />
              <SortTh label="תדירות"        col="interval"     sort={s} onSort={handleSort} />
              <SortTh label="חיוב הבא"      col="next_billing" sort={s} onSort={handleSort} />
              <SortTh label="יתרת חיובים"   col="total_cycles" sort={s} onSort={handleSort} />
              <th>סטטוס</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} className={styles.center}>טוען...</td></tr>
            ) : !sorted.length ? (
              <tr><td colSpan={7} className={styles.center}>אין מנויים פעילים</td></tr>
            ) : sorted.map(row => {
              const nextMs   = row.next_billing ? new Date(row.next_billing).getTime() : null;
              const daysLeft = nextMs ? Math.ceil((nextMs - now) / 86400000) : null;
              const soon     = daysLeft !== null && daysLeft <= 7;
              return (
                <tr key={row.id}>
                  <td className={styles.name}>{row.name ?? '—'}</td>
                  <td className={styles.email}>{row.email ?? '—'}</td>
                  <td className={styles.amount}>{row.amount != null ? fmt(row.amount, row.currency) : '—'}</td>
                  <td className={styles.muted}>{INTERVAL_MAP[row.interval] ?? row.interval ?? '—'}</td>
                  <td className={styles.date} style={soon ? { color: '#d97706', fontWeight: 600 } : {}}>
                    {formatDateShort(row.next_billing)}
                    {daysLeft !== null && <span style={{ fontSize: 11, marginRight: 6, opacity: 0.7 }}>({daysLeft} ימים)</span>}
                  </td>
                  <td className={styles.muted}>
                    {row.total_cycles != null ? row.total_cycles : (row.cancel_at_period_end ? '—' : 'מתמשך')}
                  </td>
                  <td>
                    {row.cancel_at_period_end
                      ? <span style={{ color: '#d97706', fontWeight: 600, fontSize: 12 }}>מסתיים בסוף תקופה</span>
                      : <span style={{ color: '#10b981', fontWeight: 600, fontSize: 12 }}>פעיל</span>
                    }
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ── Main component ──────────────────────────────────────────────── */
export default function StripeDonations() {
  const [view, setView] = useState('donations');

  return (
    <div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
        {[
          { id: 'donations',      label: 'תרומות' },
          { id: 'subscriptions',  label: 'מנויים פעילים' },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setView(tab.id)}
            style={{
              padding: '7px 20px',
              border: view === tab.id ? '1px solid rgba(79,126,248,0.4)' : '1px solid rgba(200,210,230,0.6)',
              borderRadius: 20,
              background: view === tab.id ? 'rgba(79,126,248,0.1)' : 'rgba(255,255,255,0.5)',
              color: view === tab.id ? 'var(--color-primary)' : 'var(--color-text-muted)',
              fontWeight: view === tab.id ? 600 : 400,
              fontSize: 13,
              cursor: 'pointer',
              transition: 'all 0.15s',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>
      {view === 'donations'     && <DonationsView />}
      {view === 'subscriptions' && <SubscriptionsView />}
    </div>
  );
}
