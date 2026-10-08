import { useState, useEffect, useCallback, useMemo } from 'react';
import styles from './BankRefusals.module.css';
import { fetchBankRefusals, syncBankRefusals, resolveBankRefusal } from '../../services/api.js';
import { formatCurrency, formatDate } from '../../lib/format.js';
import { useAuth } from '../../contexts/AuthContext.jsx';
import {
  Card, Stack, Toolbar, ToolbarSpacer, SearchInput, Select, Input, Button, Badge, StateMessage, StatGrid, Stat,
  Table, SortTh, sortRows, toggleSort, TableMessage, tableStyles as t, toolbarSearchClass,
  Popover, MenuItem, IconButton, useToast, usePrompt,
} from '../ui';

// אור אפרים + חכמי ירושלים — תרומות והשכ"ל, ללא הודעת סירוב אוטומטית (בשונה מאשראי)
// סומך נופלים (כולל יפה ותמה, קרן משנה תחתיו — אותו מוסד/מספר) — כל המיילים
// על הסירובים מגיעים לאותה תיבת מייל כמו חכמי ירושלים ואור אפרים
const BANK_REFUSAL_MOSAD_NUMBERS = ['7001725', '7003860', '7001916', '7003862', '7001671'];

const RESOLUTION_LABEL = {
  receipt_issued: 'הוצאה קבלה',
  cancelled_in_nedarim: 'בוטל בנדרים+',
  marked_manually: 'סומן ידנית',
};

function defaultPeriod() {
  const d = new Date();
  d.setMonth(d.getMonth() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function StatusBadge({ row }) {
  if (row.status === 'cleared') return <Badge tone="success" dot>נפרע</Badge>;
  if (row.status === 'bounced') return <Badge tone="danger" dot>חזר</Badge>;
  if (row.auto_status === 'cleared') return <Badge tone="primary" title="זיהוי אוטומטי — טרם אושר">נראה שנפרע</Badge>;
  if (row.auto_status === 'bounced') return <Badge tone="warning" title="זיהוי אוטומטי — טרם אושר">נראה שחזר</Badge>;
  return <Badge tone="neutral">לא זוהה</Badge>;
}

function Summary({ rows }) {
  const sum = (list) => list.reduce((s, r) => s + Number(r.amount || 0), 0);
  const cleared = rows.filter((r) => r.status === 'cleared');
  const bounced = rows.filter((r) => r.status === 'bounced');
  const pending = rows.filter((r) => r.status === 'pending');
  return (
    <StatGrid>
      <Stat label='סה"כ הוראות' value={rows.length} hint={formatCurrency(sum(rows))} />
      <Stat label="נפרעו" value={cleared.length} hint={formatCurrency(sum(cleared))} tone="success" />
      <Stat label="חזרו" value={bounced.length} hint={formatCurrency(sum(bounced))} tone="danger" />
      <Stat label="ממתינות להכרעה" value={pending.length} hint={formatCurrency(sum(pending))} tone={pending.length ? 'warning' : undefined} />
    </StatGrid>
  );
}

function exportCsv(rows, mosadNumber, period) {
  const header = ['תאריך', 'שם', 'ת"ז', 'סכום', 'מספר הוראה', 'סטטוס'];
  const lines = [header.join(',')];
  rows.forEach((r) => {
    lines.push([formatDate(r.charge_date), r.client_name ?? '', r.client_id_number ?? '', r.amount ?? '', r.masav_id ?? '', r.status].join(','));
  });
  const blob = new Blob(['﻿' + lines.join('\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `bank-refusals-${mosadNumber}-${period}.csv`; a.click();
  URL.revokeObjectURL(url);
}

export default function BankRefusals({ institutions }) {
  const { role } = useAuth();
  const toast = useToast();
  const prompt = usePrompt();
  const canAct = role !== 'institution'; // view-only for the institution portal — server also 403s writes/sync for it
  const [mosadFilter, setMosadFilter] = useState('');
  const [period, setPeriod]           = useState(defaultPeriod());
  const [rows, setRows]               = useState([]);
  const [loading, setLoading]         = useState(false);
  const [syncing, setSyncing]         = useState(false);
  const [resolvingId, setResolvingId] = useState(null);
  const [errorMsg, setErrorMsg]       = useState('');
  const [search, setSearch]           = useState('');
  const [sort, setSort]               = useState({ col: null, dir: 'asc' });

  const eligibleInstitutions = useMemo(
    () => (institutions ?? []).filter((i) => BANK_REFUSAL_MOSAD_NUMBERS.includes(i.mosad_number)),
    [institutions]
  );

  // Institution role always has exactly one eligible institution (their own,
  // scoped server-side) — pick it automatically instead of making them choose.
  useEffect(() => {
    if (role === 'institution' && !mosadFilter && eligibleInstitutions.length === 1) {
      setMosadFilter(eligibleInstitutions[0].mosad_number);
    }
  }, [role, mosadFilter, eligibleInstitutions]);

  const load = useCallback(() => {
    if (!mosadFilter || !period) { setRows([]); return; }
    setLoading(true); setErrorMsg('');
    fetchBankRefusals(mosadFilter, period)
      .then((res) => setRows(res.data ?? []))
      .catch((e) => setErrorMsg(e.message))
      .finally(() => setLoading(false));
  }, [mosadFilter, period]);

  useEffect(load, [load]);

  const handleSync = async () => {
    if (!mosadFilter || !period) return;
    setSyncing(true);
    try {
      await syncBankRefusals(mosadFilter, period);
      toast.success('הסנכרון מנדרים+ הושלם');
      load();
    } catch (e) { toast.error(`הסנכרון נכשל: ${e.message}`); }
    setSyncing(false);
  };

  const resolve = async (row, resolution, comment) => {
    setResolvingId(row.id);
    try {
      await resolveBankRefusal(row.id, resolution, comment);
      load();
    } catch (e) { toast.error(`הפעולה נכשלה: ${e.message}`); }
    setResolvingId(null);
  };

  const handleCleared = (row) => resolve(row, 'cleared');

  // Bounced → cancels the order in Nedarim+. Cancelling the dialog aborts.
  const handleBounced = async (row) => {
    const comment = await prompt({
      title: 'הוראה חזרה — ביטול בנדרים+',
      message: `ההוראה של ${row.client_name ?? ''} (${formatCurrency(row.amount)}) תסומן כחוזרת ותבוטל בנדרים+.`,
      label: 'סיבת החזרה (לא חובה)',
      defaultValue: 'הוראת קבע חזרה',
      confirmText: 'ביטול בנדרים+',
    });
    if (comment === null) return;
    resolve(row, 'bounced', comment);
  };

  // Free-text filter + column sort, both client-side (the month's rows are fully loaded)
  const q = search.toLowerCase();
  const visibleRows = sortRows(
    q
      ? rows.filter((r) =>
          [r.client_name, r.client_id_number, r.masav_id, r.amount]
            .some((v) => String(v ?? '').toLowerCase().includes(q)))
      : rows,
    sort.col, sort.dir
  );

  const th = (label, col) => <SortTh label={label} col={col} sort={sort} onSort={(c) => setSort((p) => toggleSort(p, c))} />;
  const ready = mosadFilter && !loading && !errorMsg;

  return (
    <Stack>
      {ready && rows.length > 0 && <Summary rows={rows} />}

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
          <Input type="month" className={styles.month} value={period} onChange={(e) => setPeriod(e.target.value)} aria-label="חודש" />
          {mosadFilter && (
            <>
              <SearchInput className={toolbarSearchClass} value={search} onSearch={setSearch} delay={150} placeholder='חיפוש לפי שם, ת"ז, מספר הוראה…' />
              <ToolbarSpacer />
              <Button icon="download" onClick={() => exportCsv(visibleRows, mosadFilter, period)} disabled={!visibleRows.length}>ייצוא CSV</Button>
              {canAct && <Button icon="refresh" onClick={handleSync} loading={syncing}>סנכרון מנדרים+</Button>}
            </>
          )}
        </Toolbar>

        {!mosadFilter ? (
          <StateMessage kind="info" icon="undo" title="בחר מוסד וחודש" description="כדי לטעון את דוח ההוראות הבנקאיות של החודש" />
        ) : loading ? (
          <StateMessage kind="loading" />
        ) : errorMsg ? (
          <StateMessage kind="error" description={errorMsg} action={<Button size="sm" icon="refresh" onClick={load}>נסה שוב</Button>} />
        ) : !rows.length ? (
          <StateMessage
            title="אין נתונים לחודש הזה"
            description={canAct ? 'אפשר למשוך את הנתונים מנדרים+' : undefined}
            action={canAct && <Button size="sm" variant="primary" icon="refresh" onClick={handleSync} loading={syncing}>סנכרון מנדרים+</Button>}
          />
        ) : (
          <Table stackOnMobile>
            <thead>
              <tr>
                {th('תאריך גבייה', 'charge_date')}
                {th('שם לקוח', 'client_name')}
                {th('סכום', 'amount')}
                {th('מספר הוראה', 'masav_id')}
                {th('סטטוס', 'status')}
                <th>פעולה</th>
              </tr>
            </thead>
            <tbody>
              {!visibleRows.length ? (
                <TableMessage colSpan={6} title="אין תוצאות לחיפוש" />
              ) : visibleRows.map((row) => (
                <tr key={row.id}>
                  <td data-label="תאריך" className={t.date}>{formatDate(row.charge_date)}</td>
                  <td data-label="שם" className={t.strong}>{row.client_name ?? '—'}</td>
                  <td data-label="סכום" className={t.amount}>{formatCurrency(row.amount)}</td>
                  <td data-label="מספר הוראה" className={t.mono}>{row.masav_id}</td>
                  <td data-label="סטטוס"><StatusBadge row={row} /></td>
                  <td data-label="פעולה">
                    {row.status !== 'pending' ? (
                      <span className={t.muted}>{RESOLUTION_LABEL[row.resolution] ?? '—'}</span>
                    ) : !canAct ? (
                      <span className={t.muted}>ממתין להכרעה</span>
                    ) : (
                      <div className={t.actions}>
                        {row.existing_receipt_number ? (
                          <span className={t.muted}>קבלה כבר קיימת בנדרים+ (#{row.existing_receipt_number})</span>
                        ) : (
                          <Button size="sm" variant="successSoft" icon="receipt" disabled={resolvingId === row.id} onClick={() => handleCleared(row)}>
                            נפרע — הוצא קבלה
                          </Button>
                        )}
                        <Button size="sm" variant="dangerSoft" icon="undo" disabled={resolvingId === row.id} onClick={() => handleBounced(row)}>
                          חזר — בטל בנדרים+
                        </Button>
                        <Popover
                          trigger={({ ref, toggle, open }) => (
                            <IconButton ref={ref} size="sm" icon="more" label="סימון ידני" onClick={toggle} aria-expanded={open} disabled={resolvingId === row.id} />
                          )}
                        >
                          {({ close }) => (
                            <>
                              <MenuItem icon="checkCircle" onClick={() => { close(); resolve(row, 'cleared_manual'); }}>סמן כנפרע (ללא פעולה)</MenuItem>
                              <MenuItem icon="xCircle" onClick={() => { close(); resolve(row, 'bounced_manual'); }}>סמן כחזר (ללא פעולה)</MenuItem>
                            </>
                          )}
                        </Popover>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </Stack>
  );
}
