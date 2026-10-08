import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { supabase } from '../../lib/supabase.js';
import { fetchDonorReport, downloadDonorReportPdf, searchDonors } from '../../services/api.js';
import { buildReceiptProxyUrl } from '../../lib/receiptProxy.js';
import { debounce } from '../../lib/debounce.js';
import { formatCurrency, formatDate, formatNumber } from '../../lib/format.js';
import { useAuth } from '../../contexts/AuthContext.jsx';
import {
  Card, CardBody, CardFooter, Stack, Field, Input, Select, Suggestions, Button, Alert, StateMessage,
  StatGrid, Stat, Table, buttonClass, formStyles, tableStyles as t,
} from '../ui';

const CURRENT_YEAR = new Date().getFullYear();
const YEARS = Array.from({ length: 6 }, (_, i) => CURRENT_YEAR - i);

function ReceiptLink({ receipt }) {
  const [href, setHref] = useState(null);
  useEffect(() => {
    let cancelled = false;
    if (receipt.pdf_url) {
      buildReceiptProxyUrl(receipt.pdf_url, `קבלה-${receipt.receipt_number || ''}`)
        .then((u) => { if (!cancelled) setHref(u); });
    }
    return () => { cancelled = true; };
  }, [receipt.pdf_url, receipt.receipt_number]);
  if (!href) return <span className={t.subtle}>—</span>;
  return (
    <a className={buttonClass({ variant: 'soft', size: 'sm' })} href={href} target="_blank" rel="noreferrer">
      {receipt.receipt_number ? `קבלה ${receipt.receipt_number}` : 'צפייה בקבלה'}
    </a>
  );
}

export default function DonorReport() {
  const { role } = useAuth();
  const [name, setName] = useState('');
  const [idNumber, setIdNumber] = useState('');
  const [year, setYear] = useState(String(CURRENT_YEAR));
  const [suggestions, setSuggestions] = useState([]);
  const [showSugg, setShowSugg] = useState(false);
  const wrapRef = useRef(null);

  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const handler = (e) => {
      if (wrapRef.current?.contains(e.target)) return;
      setShowSugg(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Institution-scoped users search through /api/transactions?action=donor-search
  // (already filtered server-side by their allowed mosad/group) instead of the
  // `customers` table directly — that table's RLS lets any authenticated user
  // read every donor in the org, which a fund-scoped account must not see.
  const runCustomerSearch = useCallback(async (q) => {
    if (q.length < 2) { setSuggestions([]); setShowSugg(false); return; }
    if (role === 'institution') {
      const donors = await searchDonors(q).catch(() => []);
      const mapped = donors.map((d) => ({ id: d.id, name: d.client_name, id_number: null }));
      if (mapped.length) { setSuggestions(mapped); setShowSugg(true); }
      else { setSuggestions([]); setShowSugg(false); }
      return;
    }
    const { data } = await supabase.from('customers')
      .select('*')
      .or(`name.ilike.%${q}%,id_number.ilike.%${q}%`)
      .limit(6);
    if (data?.length) { setSuggestions(data); setShowSugg(true); }
    else { setSuggestions([]); setShowSugg(false); }
  }, [role]);
  const searchCustomers = useMemo(() => debounce(runCustomerSearch, 300), [runCustomerSearch]);

  const selectCustomer = (c) => {
    setName(c.name);
    if (c.id_number) setIdNumber(c.id_number);
    setShowSugg(false);
    setResult(null);
  };

  const handleNameChange = (v) => {
    setName(v);
    setResult(null);
    searchCustomers(v);
  };

  const canRun = name.trim() || idNumber.trim();

  const runReport = async (e) => {
    e?.preventDefault();
    if (!canRun) return;
    setShowSugg(false);
    setLoading(true);
    setError('');
    setResult(null);
    try {
      const data = await fetchDonorReport({
        customerName: name.trim(),
        customerIdNumber: idNumber.trim(),
        year,
      });
      setResult(data);
    } catch (err) {
      setError(err.message || 'שגיאה בטעינת הדוח');
    } finally {
      setLoading(false);
    }
  };

  const downloadMerged = async () => {
    setDownloading(true);
    setError('');
    try {
      await downloadDonorReportPdf({
        customerName: name.trim(),
        customerIdNumber: idNumber.trim(),
        year,
      });
    } catch (err) {
      setError(err.message || 'שגיאה בהורדת הקובץ המאוחד');
    } finally {
      setDownloading(false);
    }
  };

  const who = name.trim() || `ת"ז ${idNumber}`;

  return (
    <Stack>
      <Card as="form" onSubmit={runReport}>
        <CardBody>
          <div className={formStyles.grid}>
            <Field label="שם תורם" htmlFor="dr-name">
              <div ref={wrapRef} className={formStyles.suggestWrap}>
                <Input
                  id="dr-name"
                  value={name}
                  onChange={(e) => handleNameChange(e.target.value)}
                  onFocus={() => suggestions.length > 0 && setShowSugg(true)}
                  placeholder="הקלדת שם לחיפוש…"
                  autoComplete="off"
                />
                {showSugg && (
                  <Suggestions
                    items={suggestions}
                    onSelect={selectCustomer}
                    getTitle={(c) => c.name}
                    getSub={(c) => c.id_number || ''}
                  />
                )}
              </div>
            </Field>
            <Field label="מספר זהות" hint="חיפוש מדויק — עדיף כשהמספר ידוע">
              <Input
                value={idNumber}
                onChange={(e) => { setIdNumber(e.target.value); setResult(null); }}
                placeholder="לדוגמה: 203043757"
                dir="ltr"
                inputMode="numeric"
              />
            </Field>
            <Field label="שנה">
              <Select value={year} onChange={(e) => { setYear(e.target.value); setResult(null); }}>
                {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
              </Select>
            </Field>
          </div>
        </CardBody>
        <CardFooter>
          <Button type="submit" variant="primary" icon="search" disabled={!canRun} loading={loading}>הצגת הדוח</Button>
          {result?.receipts?.length > 0 && (
            <Button icon="download" onClick={downloadMerged} loading={downloading}>
              {downloading ? 'מכין PDF…' : 'הורדת PDF מאוחד'}
            </Button>
          )}
        </CardFooter>
      </Card>

      {error && <Alert tone="danger" onClose={() => setError('')}>{error}</Alert>}

      {!result && !loading && !error && (
        <Card><StateMessage kind="info" icon="fileText" title="חיפוש תורם" description="בוחרים תורם (בשם או במספר זהות) ושנה, ומקבלים את כל הקבלות שלו באותה שנה" /></Card>
      )}

      {result && (result.receipts.length === 0 ? (
        <Card><StateMessage title="לא נמצאו קבלות" description={`עבור ${who} בשנת ${year}`} /></Card>
      ) : (
        <>
          <StatGrid>
            <Stat label="תורם" value={who} />
            <Stat label={`קבלות בשנת ${year}`} value={formatNumber(result.count)} />
            <Stat label='סה"כ תרומות' value={formatCurrency(result.total)} tone="success" />
          </StatGrid>
          <Card clip>
            <Table stackOnMobile>
              <thead>
                <tr>
                  <th>תאריך</th>
                  <th>שם תורם</th>
                  <th>מוסד</th>
                  <th>קרן</th>
                  <th>סוג קבלה</th>
                  <th>סכום</th>
                  <th>קבלה</th>
                </tr>
              </thead>
              <tbody>
                {result.receipts.map((r, i) => (
                  <tr key={r.receipt_number || i}>
                    <td data-label="תאריך" className={t.date}>{formatDate(r.issue_date)}</td>
                    <td data-label="שם תורם" className={t.strong}>{r.customer_name || '—'}</td>
                    <td data-label="מוסד">{r.institution_name}</td>
                    <td data-label="קרן" className={t.muted}>{r.category || '—'}</td>
                    <td data-label="סוג קבלה" className={t.muted}>{r.receipt_type}</td>
                    <td data-label="סכום" className={t.amount}>{formatCurrency(Number(r.amount))}</td>
                    <td data-label="קבלה"><ReceiptLink receipt={r} /></td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </Card>
        </>
      ))}
    </Stack>
  );
}
