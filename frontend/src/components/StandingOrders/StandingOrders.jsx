import { useState, useEffect, useCallback } from 'react';
import styles from './StandingOrders.module.css';
import { fetchStandingOrders, exportCreditOrders, exportBankOrders, authFetch } from '../../services/api.js';
import { filterRowsByDateRange, exportAoaXlsx } from '../../lib/exportXlsx.js';
import { formatCurrency, toInputDate } from '../../lib/format.js';
import CreditModal from './CreditModal.jsx';
import BankModal from './BankModal.jsx';
import { useAuth } from '../../contexts/AuthContext.jsx';
import {
  Card, Stack, Toolbar, ToolbarSpacer, SearchInput, Select, SegmentedControl, Button, Badge,
  StateMessage, StatGrid, Stat, Table, SortTh, sortRows, toggleSort, TableMessage, rowActivation,
  tableStyles as t, toolbarSearchClass, Popover, MenuItem, MenuCheckbox, MenuLabel, MenuDivider, MenuSection,
  DateRange, useToast,
} from '../ui';

function parseExpiry(raw) {
  if (!raw || raw.length < 4) return raw ?? '—';
  return `${raw.slice(0, 2)}/${raw.slice(2, 4)}`;
}

const amountOf = (v) => (v ? formatCurrency(parseFloat(v)) : '—');

function CreditTable({ rows, sort, onSort, onOpen }) {
  const sorted = sortRows(rows, sort.col, sort.dir);
  const th = (label, col) => <SortTh label={label} col={col} sort={sort} onSort={onSort} />;
  return (
    <Table stackOnMobile>
      <thead>
        <tr>
          {th('#', 'DT_RowId')}{th('שם מלא', '2')}{th('סכום', '4')}{th('קטגוריה', '5')}{th('חיוב הבא', '9')}
          {th('יתרת חיובים', '7')}{th('חיובים בוצעו', '8')}{th('4 ספרות', '11')}{th('תוקף', '12')}{th('סטטוס', '10')}
        </tr>
      </thead>
      <tbody>
        {!sorted.length ? (
          <TableMessage colSpan={10} title="אין הוראות קבע באשראי" description="נסה לשנות את החיפוש" />
        ) : sorted.map((row) => (
          <tr key={row.DT_RowId} {...(onOpen ? rowActivation(() => onOpen(row.DT_RowId)) : {})}>
            <td data-label="#" className={t.mono}>{row.DT_RowId}</td>
            <td data-label="שם" className={t.strong}>{row['2'] ?? '—'}</td>
            <td data-label="סכום" className={t.amount}>{amountOf(row['4'])}</td>
            <td data-label="קטגוריה" className={t.muted}>{row['5'] ?? '—'}</td>
            <td data-label="חיוב הבא" className={t.date}>{row['9'] ?? '—'}</td>
            <td data-label="יתרת חיובים" className={t.muted}>{row['7'] ?? '—'}</td>
            <td data-label="חיובים בוצעו" className={t.num}>{row['8'] ?? '—'}</td>
            <td data-label="4 ספרות" className={t.mono}>{row['11'] ? `****${row['11']}` : '—'}</td>
            <td data-label="תוקף" className={t.num}>{parseExpiry(row['12'])}</td>
            <td data-label="סטטוס">
              {row['10'] ? <Badge tone="danger" title={row['10']}>{row['10']}</Badge> : <Badge tone="success" dot>פעיל</Badge>}
            </td>
          </tr>
        ))}
      </tbody>
    </Table>
  );
}

// Bank rows (GetMasavKevaNew) have no dedicated status column — Nedarim
// overloads the "חיוב הבא" (next-charge, column 4) field with the status text
// whenever the order isn't actively charging, e.g. "מוקפא" or "נדחה ע"י הבנק
// (א) נדחה | פנה ללקוח 28/08/26". A real next-charge value is just a date.
const isDateLike = (v) => /^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(String(v ?? '').trim());

const BANK_STATUS_RULES = [
  { key: 'active',             label: 'פעילה',                                            tone: 'success', test: (v) => isDateLike(v) },
  { key: 'rejected_cancelled', label: 'נדחה ע"י הבנק (א) בוטל ע"י הלקוח | פנה ללקוח',       tone: 'danger',  test: (v) => v.includes('בוטל ע"י הלקוח') },
  { key: 'rejected',           label: 'נדחה ע"י הבנק (א) נדחה | פנה ללקוח',                 tone: 'danger',  test: (v) => v.startsWith('נדחה ע"י הבנק') },
  { key: 'sent',               label: 'הטופס נשלח לבנק',                                    tone: 'primary', test: (v) => v.startsWith('הטופס נשלח לבנק') },
  { key: 'inactive',           label: 'לא פעיל - אין יתרת חיובים',                          tone: 'neutral', test: (v) => v.startsWith('לא פעיל') },
  { key: 'frozen',             label: 'מוקפא',                                             tone: 'warning', test: (v) => v.startsWith('מוקפא') },
];

function classifyBankStatus(rawNextCharge) {
  const v = String(rawNextCharge ?? '').trim();
  if (!v) return { key: 'unknown', label: 'לא ידוע', tone: 'neutral' };
  const rule = BANK_STATUS_RULES.find((r) => r.test(v));
  return rule ? { key: rule.key, label: rule.label, tone: rule.tone } : { key: 'other', label: v, tone: 'neutral' };
}

function NextChargeCell({ raw }) {
  if (!raw) return '—';
  if (isDateLike(raw)) return raw;
  const s = classifyBankStatus(raw);
  return <Badge tone={s.tone} title={raw}>{raw}</Badge>;
}

function BankTable({ rows, sort, onSort, onOpen }) {
  const sorted = sortRows(rows, sort.col, sort.dir);
  const th = (label, col) => <SortTh label={label} col={col} sort={sort} onSort={onSort} />;
  return (
    <Table stackOnMobile>
      <thead>
        <tr>
          {th('#', 'DT_RowId')}{th('שם לקוח', '2')}{th('פרטי חשבון', '3')}{th('סכום חודשי', '6')}
          {th('חיוב הבא / סטטוס', '4')}{th('יתרת חיובים', '5')}{th('קטגוריה', '7')}{th('הערה', '8')}
        </tr>
      </thead>
      <tbody>
        {!sorted.length ? (
          <TableMessage colSpan={8} title="אין הוראות קבע בנקאיות" description="נסה לשנות את החיפוש או המסננים" />
        ) : sorted.map((row) => (
          <tr key={row.DT_RowId} {...(onOpen ? rowActivation(() => onOpen(row.DT_RowId)) : {})}>
            <td data-label="#" className={t.mono}>{row.DT_RowId}</td>
            <td data-label="שם" className={t.strong}>{row['2'] ?? '—'}</td>
            <td data-label="חשבון" className={t.num}>{row['3'] ?? '—'}</td>
            <td data-label="סכום" className={t.amount}>{amountOf(row['6'])}</td>
            <td data-label="חיוב הבא" className={t.date}><NextChargeCell raw={row['4']} /></td>
            <td data-label="יתרת חיובים" className={t.muted}>{row['5'] ?? '—'}</td>
            <td data-label="קטגוריה" className={t.muted}>{row['7'] ?? '—'}</td>
            <td data-label="הערה" className={`${t.muted} ${t.truncate}`} title={row['8'] || undefined}>{row['8'] || '—'}</td>
          </tr>
        ))}
      </tbody>
    </Table>
  );
}

function monthRange(offset = 0) {
  const now = new Date();
  const first = new Date(now.getFullYear(), now.getMonth() + offset, 1);
  const last  = offset === 0 ? now : new Date(now.getFullYear(), now.getMonth() + offset + 1, 0);
  return { from: toInputDate(first), to: toInputDate(last) };
}

function ExportMenu({ mosadNumber, type }) {
  const toast = useToast();
  const [exporting, setExporting] = useState(false);
  const [range, setRange] = useState({ from: '', to: '' });
  const hasRange = !!(range.from || range.to);

  // Nedarim+ can't filter its credit CSVs by date, so when a range is chosen
  // we download the full CSV, filter the rows locally, and save as Excel.
  const exportCreditFiltered = async (exportType) => {
    const res = await authFetch(`/api/standing-orders?mosad_number=${encodeURIComponent(mosadNumber)}&export=${exportType}`);
    if (!res.ok) throw new Error('Export failed');
    // Nedarim serves this CSV as UTF-16LE (BOM ÿþ) — res.text() would decode
    // it as UTF-8 and garble every character, so no date column would parse.
    const buf = new Uint8Array(await res.arrayBuffer());
    const text = (buf[0] === 0xFF && buf[1] === 0xFE)
      ? new TextDecoder('utf-16le').decode(buf)
      : new TextDecoder().decode(buf);
    const XLSX = await import('xlsx');
    const wb = XLSX.read(text, { type: 'string', raw: true });
    let aoa = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1 });
    // Nedarim wraps zero-padded values as ="0230" so Excel keeps the leading
    // zero — unwrap them so the exported file shows the plain value.
    aoa = aoa.map((row) => row.map((c) => {
      const m = /^="(.*)"$/.exec(String(c ?? '').trim());
      return m ? m[1] : (typeof c === 'string' ? c.trim() : c);
    }));
    const rows = filterRowsByDateRange(aoa, range.from, range.to);
    if (!rows) throw new Error('לא זוהתה עמודת תאריך בקובץ — ייצא ללא סינון');
    if (rows.length <= 1) throw new Error('אין שורות בטווח התאריכים שנבחר');
    await exportAoaXlsx(rows, `credit-${exportType}-${mosadNumber}-${range.from || 'start'}-${range.to || 'today'}.xlsx`);
  };

  const doExport = async (exportType, close) => {
    setExporting(true);
    close();
    try {
      if (type === 'credit') {
        if (hasRange) await exportCreditFiltered(exportType);
        else await exportCreditOrders(mosadNumber, exportType);
      } else {
        await exportBankOrders(mosadNumber, exportType, range.from, range.to);
      }
    } catch (e) {
      toast.error(`הייצוא נכשל: ${e.message}`);
    }
    setExporting(false);
  };

  const suffix = hasRange ? 'Excel מסונן' : 'CSV';

  return (
    <Popover
      trigger={({ ref, toggle, open }) => (
        <Button ref={ref} icon="download" iconEnd="chevronDown" onClick={toggle} loading={exporting} aria-expanded={open}>
          ייצוא
        </Button>
      )}
    >
      {({ close }) => (type === 'credit' ? (
        <>
          <MenuLabel>סינון לפי תאריכים (לא חובה)</MenuLabel>
          <MenuSection>
            <DateRange from={range.from} to={range.to} onChange={setRange} />
            <div className={styles.presets}>
              <Button size="sm" variant="ghost" onClick={() => setRange(monthRange(0))}>החודש</Button>
              <Button size="sm" variant="ghost" onClick={() => setRange(monthRange(-1))}>חודש שעבר</Button>
            </div>
          </MenuSection>
          <MenuDivider />
          <MenuItem icon="sheet" onClick={() => doExport('orders', close)}>הוראות קבע ({suffix})</MenuItem>
          <MenuItem icon="sheet" onClick={() => doExport('business', close)}>עסקים ({suffix})</MenuItem>
          <MenuItem icon="sheet" onClick={() => doExport('refusals', close)}>סירובים ({suffix})</MenuItem>
        </>
      ) : (
        <>
          <MenuItem icon="sheet" onClick={() => doExport('orders', close)}>הוראות קבע (CSV)</MenuItem>
          <MenuDivider />
          <MenuLabel>היסטוריית חיובים לפי תאריכים</MenuLabel>
          <MenuSection>
            <DateRange from={range.from} to={range.to} onChange={setRange} />
            <Button size="sm" variant="primary" icon="download" disabled={!range.from || !range.to} onClick={() => doExport('history', close)}>
              ייצוא היסטוריה
            </Button>
          </MenuSection>
        </>
      ))}
    </Popover>
  );
}

// Rows arrive DataTables-style (numeric string keys), so the free-text search
// just scans every cell value of the row.
function filterRows(rows, q) {
  if (!q) return rows;
  const needle = q.toLowerCase();
  return rows.filter((row) =>
    Object.values(row).some((v) => String(v ?? '').toLowerCase().includes(needle))
  );
}

// Multi-select checkbox dropdown for the status / category filters on the bank
// table — checking an option narrows the list, none checked = show all.
function FilterMenu({ label, options, selected, onToggle, onShowAll }) {
  const activeCount = selected.size;
  return (
    <Popover
      trigger={({ ref, toggle, open }) => (
        <Button ref={ref} variant={activeCount ? 'soft' : 'secondary'} icon="filter" iconEnd="chevronDown" onClick={toggle} aria-expanded={open}>
          {label}{activeCount ? ` (${activeCount})` : ''}
        </Button>
      )}
    >
      <MenuCheckbox checked={activeCount === 0} onChange={onShowAll}>הצג הכל</MenuCheckbox>
      <MenuDivider />
      {options.map((opt) => (
        <MenuCheckbox key={opt.key} checked={selected.has(opt.key)} onChange={() => onToggle(opt.key)} count={opt.count}>
          {opt.label}
        </MenuCheckbox>
      ))}
      {!options.length && <MenuSection>אין נתונים</MenuSection>}
    </Popover>
  );
}

// Builds {key,label,count} filter options from the current rows, sorted by label.
function buildFilterOptions(rows, getEntry) {
  const counts = new Map();
  for (const row of rows) {
    const { key, label } = getEntry(row);
    const cur = counts.get(key) || { key, label, count: 0 };
    cur.count++;
    counts.set(key, cur);
  }
  return [...counts.values()].sort((a, b) => a.label.localeCompare(b.label, 'he'));
}

const toggleInSet = (key) => (prev) => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n; };

export default function StandingOrders({ institutions }) {
  const { role } = useAuth();
  const canOpen = role !== 'institution'; // detail/edit modals write via server actions that are staff-only anyway
  const [mosadFilter, setMosadFilter] = useState('');
  const [activeType, setActiveType]   = useState('credit');
  const [creditData, setCreditData]   = useState(null);
  const [bankData, setBankData]       = useState(null);
  const [loading, setLoading]         = useState(false);
  const [errorMsg, setErrorMsg]       = useState('');
  const [search, setSearch]           = useState('');
  const [statusFilter, setStatusFilter]     = useState(() => new Set());
  const [categoryFilter, setCategoryFilter] = useState(() => new Set());
  const [creditSort, setCreditSort]   = useState({ col: null, dir: 'asc' });
  const [bankSort, setBankSort]       = useState({ col: null, dir: 'asc' });
  const [openCredit, setOpenCredit]   = useState(null);
  const [openBank, setOpenBank]       = useState(null);

  const eligibleInstitutions = (institutions ?? []).filter((i) => i.has_api_password);

  // Institution role always has exactly one eligible institution (their own,
  // scoped server-side) — pick it automatically instead of making them choose.
  useEffect(() => {
    if (role === 'institution' && !mosadFilter && eligibleInstitutions.length === 1) {
      setMosadFilter(eligibleInstitutions[0].mosad_number);
    }
  }, [role, mosadFilter, eligibleInstitutions]);

  const load = useCallback(() => {
    if (!mosadFilter) { setCreditData(null); setBankData(null); return; }
    setLoading(true); setErrorMsg('');
    fetchStandingOrders(mosadFilter)
      .then((res) => { setCreditData(res.credit ?? null); setBankData(res.bank ?? null); })
      .catch((e) => setErrorMsg(e.message))
      .finally(() => setLoading(false));
  }, [mosadFilter]);

  useEffect(load, [load]);

  // New institution / dataset — stale filter selections would just hide everything.
  useEffect(() => { setStatusFilter(new Set()); setCategoryFilter(new Set()); }, [mosadFilter]);

  const creditRows   = filterRows(creditData?.data ?? [], search);
  const bankSearched = filterRows(bankData?.data ?? [], search);

  const bankStatusOptions   = buildFilterOptions(bankSearched, (row) => classifyBankStatus(row['4']));
  const bankCategoryOptions = buildFilterOptions(bankSearched, (row) => {
    const cat = (row['7'] ?? '').toString().trim() || '—';
    return { key: cat, label: cat };
  });

  const bankRows = bankSearched.filter((row) => {
    if (statusFilter.size && !statusFilter.has(classifyBankStatus(row['4']).key)) return false;
    if (categoryFilter.size) {
      const cat = (row['7'] ?? '').toString().trim() || '—';
      if (!categoryFilter.has(cat)) return false;
    }
    return true;
  });

  const ready = mosadFilter && !loading && !errorMsg;
  const typeError = activeType === 'credit' ? creditData?.error : bankData?.error;

  return (
    <Stack>
      {ready && activeType === 'credit' && creditData && !creditData.error && (
        <StatGrid>
          <Stat label='סה"כ חודשי (הוראות פעילות)' value={formatCurrency(creditData.TotalMonth ?? 0)} tone="success" />
          <Stat label="צפי ל-12 חודשים" value={formatCurrency(creditData.TotalYear ?? 0)} />
        </StatGrid>
      )}

      <Card clip>
        <Toolbar>
          {role !== 'institution' && (
            <Select value={mosadFilter} onChange={(e) => setMosadFilter(e.target.value)} aria-label="מוסד">
              <option value="">בחר מוסד…</option>
              {eligibleInstitutions.map((i) => (
                <option key={i.mosad_number} value={i.mosad_number}>{i.mosad_name}</option>
              ))}
            </Select>
          )}

          {ready && (
            <>
              <SegmentedControl
                aria-label="סוג הוראת קבע"
                value={activeType}
                onChange={setActiveType}
                options={[
                  { value: 'credit', label: 'אשראי', count: creditRows.length },
                  { value: 'bank', label: 'בנקאי', count: bankRows.length },
                ]}
              />
              <SearchInput className={toolbarSearchClass} value={search} onSearch={setSearch} delay={150} placeholder="חיפוש בהוראות (שם, סכום, קטגוריה…)" />
              {activeType === 'bank' && (
                <>
                  <FilterMenu label="סטטוס" options={bankStatusOptions} selected={statusFilter}
                    onToggle={(k) => setStatusFilter(toggleInSet(k))} onShowAll={() => setStatusFilter(new Set())} />
                  <FilterMenu label="קטגוריה" options={bankCategoryOptions} selected={categoryFilter}
                    onToggle={(k) => setCategoryFilter(toggleInSet(k))} onShowAll={() => setCategoryFilter(new Set())} />
                </>
              )}
              <ToolbarSpacer />
              {role !== 'institution' && <ExportMenu key={activeType} mosadNumber={mosadFilter} type={activeType} />}
            </>
          )}
        </Toolbar>

        {!mosadFilter && (
          <StateMessage kind="info" icon="repeat" title="בחר מוסד" description="בחר מוסד כדי לטעון את הוראות הקבע שלו באשראי ובבנק" />
        )}
        {mosadFilter && loading && <StateMessage kind="loading" title="טוען הוראות קבע…" />}
        {mosadFilter && !loading && errorMsg && (
          <StateMessage kind="error" description={errorMsg} action={<Button size="sm" icon="refresh" onClick={load}>נסה שוב</Button>} />
        )}

        {ready && (typeError ? (
          <StateMessage kind="error" description={typeError} action={<Button size="sm" icon="refresh" onClick={load}>נסה שוב</Button>} />
        ) : activeType === 'credit' ? (
          <CreditTable rows={creditRows} sort={creditSort} onSort={(c) => setCreditSort((p) => toggleSort(p, c))} onOpen={canOpen ? setOpenCredit : null} />
        ) : (
          <BankTable rows={bankRows} sort={bankSort} onSort={(c) => setBankSort((p) => toggleSort(p, c))} onOpen={canOpen ? setOpenBank : null} />
        ))}
      </Card>

      {canOpen && openCredit && (
        <CreditModal kevaId={openCredit} mosadNumber={mosadFilter} onClose={() => setOpenCredit(null)} onRefresh={load} />
      )}
      {canOpen && openBank && (
        <BankModal masavId={openBank} mosadNumber={mosadFilter} onClose={() => setOpenBank(null)} onRefresh={load} />
      )}
    </Stack>
  );
}
