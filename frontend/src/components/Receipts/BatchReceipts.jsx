import { useState, useEffect, useCallback, useMemo } from 'react';
import s from './BatchReceipts.module.css';
import { supabase } from '../../lib/supabase.js';
import { useAuth } from '../../contexts/AuthContext.jsx';
import { analyzeTransferScreenshot, ALLOWED_IMAGE_TYPES } from './imageUtils.js';
import { authFetch } from '../../services/api.js';
import { debounceByKey } from '../../lib/debounce.js';
import { formatCurrency, formatDateTime, formatNumber } from '../../lib/format.js';
import {
  Card, CardHeader, CardBody, CardFooter, Stack, Toolbar, ToolbarSpacer, ToolbarMeta, SearchInput,
  SegmentedControl, Select, Field, Input, Checkbox, Suggestions, FileDrop, Button, IconButton, Badge, Alert,
  StateMessage, Table, Icon, formStyles, toolbarSearchClass, useToast, useConfirm,
} from '../ui';

const BRANCHES = [
  'סומך נופלים',
  'אור אפרים',
  'אור אפרים שכ"ל',
  'חכמי ירושלים',
  'חכמי ירושלים שכ"ל',
];

const isIdOptional = (branch) => branch === 'אור אפרים שכ"ל' || branch === 'חכמי ירושלים שכ"ל';
const hasId = (e) => (e.customer_id?.trim()) || isIdOptional(e.branch);

const KNOWN_HEADERS = {
  customer_name:    ['שם', 'שם לקוח', 'שם מעביר', 'שם תורם', 'sender', 'description', 'customer_name'],
  amount:           ['payment_sum', 'סכום', 'סך', 'price', 'מחיר'],
  transfer_date:    ['תאריך ערך', 'תאריך', 'ת. ערך', 'date'],
  bank_name:        ['בנק', 'שם בנק', 'מס בנק', 'bank'],
  bank_branch:      ['סניף', 'מס סניף', 'branch'],
  bank_account:     ['חשבון', 'מס חשבון', 'account'],
  reference_number: ['אסמכתא', 'מספר אסמכתא', 'reference', 'payment_num'],
  notes:            ['הערות', 'notes', 'סוג תנועה', 'doc_comment'],
  customer_id:      ['מס זהות', 'מספר זהות', 'ת.ז', 'ת.ז.', 'customer_crn'],
};

const ID_FILTERS = [
  { value: 'all', label: 'הכל' },
  { value: 'has_id', label: 'יש ת"ז' },
  { value: 'no_id', label: 'חסר ת"ז' },
];

const SORTS = [
  { value: 'name', label: 'לפי שם (א-ב)' },
  { value: 'branch', label: 'לפי מוסד' },
  { value: 'newest', label: 'החדשות קודם' },
  { value: 'oldest', label: 'הישנות קודם' },
];

const EMPTY_CHECKPOINT = { customer_name: '', amount: '', reference_number: '', bank_account: '', transfer_date: '' };

const CHECKPOINT_FIELDS = [
  ['customer_name', 'שם לקוח'],
  ['amount', 'סכום'],
  ['reference_number', 'אסמכתא'],
  ['bank_account', 'חשבון בנק'],
  ['transfer_date', 'תאריך העברה'],
];

function sheetToBranch(sheetName) {
  const sn = sheetName.trim();
  for (const b of BRANCHES) if (b.includes(sn) || sn.includes(b)) return b;
  if (sn.includes('חכמי')) return 'חכמי ירושלים';
  if (sn.includes('אור אפרים') || sn.includes('אור')) return 'אור אפרים';
  if (sn.includes('סומך')) return 'סומך נופלים';
  return '';
}

function parseAmount(val) {
  if (val == null) return null;
  const cleaned = String(val).replace(/[₪,\s]/g, '');
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

function parseDate(val) {
  if (val == null) return null;
  if (typeof val === 'number') {
    const d = new Date((val - 25569) * 86400 * 1000);
    return `${String(d.getUTCDate()).padStart(2,'0')}/${String(d.getUTCMonth()+1).padStart(2,'0')}/${d.getUTCFullYear()}`;
  }
  return String(val);
}

function isoToDmy(iso) {
  if (!iso) return null;
  const m = String(iso).trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return iso;
  const [, y, mo, d] = m;
  return `${d}/${mo}/${y}`;
}

function normalizeName(name = '') {
  return name.trim().toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/['"״׳.,-]/g, '')
    .replace(/\bbעמ\b|\bבעמ\b|\bבע"מ\b|\bltd\b|\blimited\b/gi, '')
    .trim();
}

function findBestMatch(entryName, customers) {
  const norm = normalizeName(entryName);
  for (const c of customers) if (normalizeName(c.name) === norm) return c;
  for (const c of customers) { const cn = normalizeName(c.name); if (cn.includes(norm) || norm.includes(cn)) return c; }
  const words = norm.split(' ').filter(w => w.length > 1);
  for (const c of customers) {
    const cn = normalizeName(c.name);
    const cw = cn.split(' ').filter(w => w.length > 1);
    if ((words.length >= 2 && words.every(w => cn.includes(w))) || (cw.length >= 2 && cw.every(w => norm.includes(w)))) return c;
  }
  return null;
}

const blurOnEnter = (e) => { if (e.key === 'Enter') e.target.blur(); };

export default function BatchReceipts() {
  const { user } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();
  const [entries, setEntries]         = useState([]);
  const [loading, setLoading]         = useState(true);
  const [sendingId, setSendingId]     = useState(null);
  const [batchSending, setBatchSending] = useState(false);
  const [errorIds, setErrorIds]       = useState(new Set());
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [idFilter, setIdFilter]       = useState('all');
  const [sortBy, setSortBy]           = useState('name');
  const [search, setSearch]           = useState('');

  // Name autocomplete (per entry row)
  const [nameSuggestions, setNameSuggestions]     = useState({});
  const [activeSuggestId, setActiveSuggestId]     = useState(null);

  // Checkpoint
  const [checkpoint, setCheckpoint]   = useState(null);
  const [showCpForm, setShowCpForm]   = useState(false);
  const [cpDraft, setCpDraft]         = useState(EMPTY_CHECKPOINT);

  // Excel import preview — rows wait here for user confirmation before hitting the DB
  const [importPreview, setImportPreview] = useState(null);
  const [importing, setImporting]         = useState(false);

  const [imgAnalyzing, setImgAnalyzing] = useState(false);
  const [imgProgress, setImgProgress] = useState({ current: 0, total: 0 });
  const [imgErrors, setImgErrors] = useState([]);
  const [uncertainNameIds, setUncertainNameIds] = useState(new Set());
  const [funds, setFunds] = useState([]);

  useEffect(() => {
    authFetch('/api/funds')
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => setFunds(Array.isArray(data) ? data : []))
      .catch(() => setFunds([]));
  }, []);

  const fetchEntries = useCallback(async () => {
    setLoading(true);
    const [{ data }, { data: customers }] = await Promise.all([
      supabase.from('pending_receipts').select('*').in('status', ['pending', 'error']).order('customer_name'),
      supabase.from('customers').select('name, id_number, email'),
    ]);
    if (data) {
      const list = data;
      if (customers?.length) {
        const withId = customers.filter(c => c.id_number);
        const toUpdate = [];
        for (const entry of list) {
          const needId    = !entry.customer_id?.trim() && entry.customer_name;
          const needEmail = !entry.customer_email?.trim() && entry.customer_name;
          if (needId || needEmail) {
            const match = findBestMatch(entry.customer_name, needId ? withId : customers);
            if (match) {
              const upd = { id: entry.id };
              if (needId && match.id_number)  { entry.customer_id = match.id_number; upd.customer_id = match.id_number; }
              if (needEmail && match.email)   { entry.customer_email = match.email;  upd.customer_email = match.email; }
              if (upd.customer_id || upd.customer_email) toUpdate.push(upd);
            }
          }
        }
        for (const u of toUpdate) {
          const { id, ...patch } = u;
          supabase.from('pending_receipts').update(patch).eq('id', id).then();
        }
      }
      setEntries(list);
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchEntries(); }, [fetchEntries]);

  // Load checkpoint from DB
  useEffect(() => {
    if (!user) return;
    supabase.from('manual_checkpoints').select('*').eq('user_id', user.id).single()
      .then(({ data }) => {
        if (data) setCheckpoint({ customer_name: data.customer_name ?? '', amount: data.amount != null ? String(data.amount) : '', reference_number: data.reference_number ?? '', bank_account: data.bank_account ?? '', transfer_date: data.transfer_date ?? '' });
      });
  }, [user]);

  const saveCheckpoint = async () => {
    if (!cpDraft.amount.trim()) return;
    setCheckpoint({ ...cpDraft });
    setShowCpForm(false);
    if (user) {
      await supabase.from('manual_checkpoints').delete().eq('user_id', user.id);
      await supabase.from('manual_checkpoints').insert({ user_id: user.id, customer_name: cpDraft.customer_name || null, amount: cpDraft.amount ? parseFloat(cpDraft.amount) : null, reference_number: cpDraft.reference_number || null, bank_account: cpDraft.bank_account || null, transfer_date: cpDraft.transfer_date || null });
    }
    toast.success('נקודת העצירה נשמרה');
  };

  const clearCheckpoint = async () => {
    setCheckpoint(null);
    if (user) await supabase.from('manual_checkpoints').delete().eq('user_id', user.id);
  };

  // Excel upload
  const handleExcel = async (file) => {
    const XLSX = await import('xlsx');
    const data = await file.arrayBuffer();
    const wb = XLSX.read(data, { type: 'array' });

    const checkpointData = checkpoint;
    const skipNames = ['ישיבת חכמי ירושל', 'מרכז מוסדות חינו'];
    let allInserts = [];

    for (const sn of wb.SheetNames) {
      const sheet = wb.Sheets[sn];
      const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });
      if (rows.length <= 1) continue;

      let headerIdx = 0;
      let colMap = {};
      for (let ri = 0; ri < Math.min(rows.length, 10); ri++) {
        const cells = (rows[ri] || []).map(c => String(c || '').trim().toLowerCase());
        let matches = 0;
        const tempMap = {};
        const used = new Set();
        for (const [field, aliases] of Object.entries(KNOWN_HEADERS)) {
          for (const alias of aliases) {
            for (let ci = 0; ci < cells.length; ci++) {
              if (!used.has(ci) && cells[ci] && cells[ci].includes(alias.toLowerCase())) {
                tempMap[field] = ci; used.add(ci); matches++; break;
              }
            }
            if (tempMap[field] !== undefined) break;
          }
        }
        if (matches >= 2) { headerIdx = ri; colMap = tempMap; break; }
      }

      const dataRows = rows.slice(headerIdx + 1).filter(r => r?.some(c => c != null && c !== ''));
      if (!dataRows.length) continue;

      const branch = file.name.toLowerCase().startsWith('fibisave') ? 'סומך נופלים' : sheetToBranch(sn);
      const getVal = (row, field) => colMap[field] !== undefined ? row[colMap[field]] : undefined;

      const preparedRows = dataRows.map(row => ({
        user_id: user.id,
        transfer_date: getVal(row, 'transfer_date') ? parseDate(getVal(row, 'transfer_date')) : null,
        customer_name: getVal(row, 'customer_name') ? String(getVal(row, 'customer_name')).trim() : null,
        customer_id:   getVal(row, 'customer_id')   ? String(getVal(row, 'customer_id')).trim()   : null,
        bank_name:     getVal(row, 'bank_name')      ? String(getVal(row, 'bank_name'))             : null,
        bank_branch:   getVal(row, 'bank_branch')    ? String(getVal(row, 'bank_branch'))           : null,
        bank_account:  getVal(row, 'bank_account')   ? String(getVal(row, 'bank_account'))          : null,
        amount:        parseAmount(getVal(row, 'amount')),
        reference_number: getVal(row, 'reference_number') ? String(getVal(row, 'reference_number')) : null,
        notes:         getVal(row, 'notes') ? String(getVal(row, 'notes')).trim() : null,
        branch,
        status: 'pending',
        _key: crypto.randomUUID(),
      })).filter(r => r.amount && r.amount > 0);

      // Checkpoint deduplication (file is sorted newest-first)
      let cpIdx = -1;
      if (checkpointData) {
        const norm = v => (v ?? '').replace(/[^0-9]/g, '');
        const normN = v => (v ?? '').replace(/,/g, '').replace(/בע["׳'״]?מ/g, '').replace(/\s+/g, ' ').trim();
        for (let i = 0; i < preparedRows.length; i++) {
          const r = preparedRows[i];
          const cpAmount = parseFloat(checkpointData.amount);
          const sameAmount = r.amount != null && !isNaN(cpAmount) && Math.abs(r.amount - cpAmount) < 0.01;
          if (!sameAmount) continue;
          const sameName    = normN(r.customer_name).includes(normN(checkpointData.customer_name).substring(0, 8));
          const sameRef     = norm(r.reference_number) && norm(r.reference_number) === norm(checkpointData.reference_number);
          const sameAccount = norm(r.bank_account) && norm(r.bank_account) === norm(checkpointData.bank_account);
          const sameDate    = norm(r.transfer_date) && norm(r.transfer_date) === norm(checkpointData.transfer_date);
          if (sameName || sameRef || sameAccount || sameDate) { cpIdx = i; break; }
        }
      }

      let inserts = cpIdx >= 0 ? preparedRows.slice(0, cpIdx) : preparedRows;
      inserts = inserts.filter(r => !skipNames.some(s => r.customer_name?.includes(s)));
      allInserts.push(...inserts);
    }

    if (!allInserts.length) { toast.info('לא נמצאו שורות חדשות לייבוא בקובץ'); return; }
    setImportPreview(allInserts);
  };

  const confirmImport = async () => {
    if (!importPreview?.length || importing) return;
    setImporting(true);
    const rows = importPreview.map(({ _uncertain, _key, ...r }) => r);
    const { data: inserted, error } = await supabase.from('pending_receipts').insert(rows).select('id');
    setImporting(false);
    if (error) { toast.error(`השמירה נכשלה: ${error.message}`); return; }
    if (inserted) {
      const newUncertainIds = inserted.filter((row, i) => importPreview[i]?._uncertain).map(row => row.id);
      if (newUncertainIds.length) setUncertainNameIds(prev => new Set([...prev, ...newUncertainIds]));
    }
    toast.success(`יובאו ${formatNumber(rows.length)} העברות`);
    setImportPreview(null);
    fetchEntries();
  };

  const removePreviewRow = (idx) => {
    setImportPreview(prev => {
      const next = prev.filter((_, i) => i !== idx);
      return next.length ? next : null;
    });
  };

  const updatePreviewField = (idx, field, value) => {
    setImportPreview(prev => prev.map((r, i) => i === idx ? { ...r, [field]: value } : r));
  };

  // Screenshot upload — analyze multiple bank-transfer screenshots and queue them as pending receipts
  const handleImages = async (fileList) => {
    const files = Array.from(fileList || []).filter(f => ALLOWED_IMAGE_TYPES.includes(f.type));
    if (!files.length) { toast.error('לא נבחרו תמונות תקינות (jpg/png/webp)'); return; }

    setImgAnalyzing(true);
    setImgProgress({ current: 0, total: files.length });
    setImgErrors([]);

    const inserts = [];
    const errors = [];

    for (let i = 0; i < files.length; i++) {
      setImgProgress({ current: i + 1, total: files.length });
      try {
        const data = await analyzeTransferScreenshot(files[i]);
        const nameToUse = data.donor_name || data.account_name || null;
        const nameUncertain = !data.donor_name && !!data.account_name;

        const notesParts = [];
        if (data.account_name && data.account_name !== nameToUse) notesParts.push(`שם בעל חשבון: ${data.account_name}`);

        inserts.push({
          user_id: user.id,
          customer_name: nameToUse,
          customer_id: null,
          bank_name: data.bank_number || null,
          bank_branch: data.branch_number || null,
          bank_account: data.account_number || null,
          amount: data.amount ?? null,
          transfer_date: isoToDmy(data.transfer_date),
          reference_number: data.asmachta || null,
          notes: notesParts.length ? notesParts.join(' | ') : null,
          // Discount Bank's "מחויב" confirmation screen always belongs to חכמי ירושלים
          branch: data.is_discount_chachmei_screen ? 'חכמי ירושלים' : '',
          status: 'pending',
          _uncertain: nameUncertain,
          _key: crypto.randomUUID(),
        });
      } catch (err) {
        errors.push({ fileName: files[i].name, error: err.message });
      }
    }

    setImgAnalyzing(false);
    setImgErrors(errors);

    if (!inserts.length) return;
    setImportPreview(prev => (prev?.length ? [...prev, ...inserts] : inserts));
  };

  const updateField = async (id, field, value) => {
    const dbVal = value === '' ? null : value;
    await supabase.from('pending_receipts').update({ [field]: dbVal }).eq('id', id);
    setEntries(prev => prev.map(e => e.id === id ? { ...e, [field]: dbVal } : e));
  };

  const runNameSearch = useCallback(async (entryId, q) => {
    if (q.length < 2) { setNameSuggestions(prev => ({ ...prev, [entryId]: [] })); return; }
    const { data } = await supabase.from('customers')
      .select('*')
      .or(`name.ilike.%${q}%,bank_account.ilike.%${q}%,id_number.ilike.%${q}%`)
      .limit(6);
    setNameSuggestions(prev => ({ ...prev, [entryId]: data || [] }));
  }, []);
  // Debounced per-entry (a separate timer per row) so typing in one row's
  // name field doesn't cancel a pending search for another row.
  const searchNameSuggestions = useMemo(
    () => debounceByKey(runNameSearch, 300, (entryId) => entryId),
    [runNameSearch]
  );

  const applyNameSuggestion = async (entry, customer) => {
    const patch = { customer_name: customer.name };
    if (!entry.customer_id?.trim()    && customer.id_number) patch.customer_id    = customer.id_number;
    if (!entry.customer_email?.trim() && customer.email)     patch.customer_email = customer.email;
    await supabase.from('pending_receipts').update(patch).eq('id', entry.id);
    setEntries(prev => prev.map(e => e.id === entry.id ? { ...e, ...patch } : e));
    setNameSuggestions(prev => ({ ...prev, [entry.id]: [] }));
    setActiveSuggestId(null);
  };

  const deleteEntry = async (entry) => {
    const ok = await confirm({
      title: 'מחיקת העברה',
      message: `למחוק את ההעברה של ${entry.customer_name || 'הלקוח'} (${formatCurrency(entry.amount)})?`,
      confirmText: 'מחיקה',
      tone: 'danger',
    });
    if (!ok) return;
    await supabase.from('pending_receipts').delete().eq('id', entry.id);
    setEntries(prev => prev.filter(e => e.id !== entry.id));
  };

  const deleteSelected = async () => {
    if (!selectedIds.size) return;
    const ids = [...selectedIds];
    const ok = await confirm({
      title: 'מחיקת העברות',
      message: `למחוק ${ids.length} העברות מסומנות?`,
      confirmText: `מחיקת ${ids.length}`,
      tone: 'danger',
    });
    if (!ok) return;
    await supabase.from('pending_receipts').delete().in('id', ids);
    setEntries(prev => prev.filter(e => !ids.includes(e.id)));
    setSelectedIds(new Set());
  };

  // Issues the receipt for one pending entry. Returns { ok, error } — the
  // single-row button reports it with a toast, batch mode with one summary.
  const createReceipt = async (entry, { batch = false } = {}) => {
    const fail = (error) => { if (!batch) toast.error(error); return { ok: false, error }; };
    if (!entry.branch) return fail(`${entry.customer_name || 'העברה'}: יש לבחור מוסד`);
    if (!entry.amount || entry.amount <= 0) return fail(`${entry.customer_name || 'העברה'}: סכום לא תקין`);
    if (!isIdOptional(entry.branch) && !entry.customer_id?.trim()) {
      setErrorIds(prev => new Set(prev).add(entry.id));
      return fail(`${entry.customer_name || 'העברה'}: יש למלא ת"ז לפני הפקת קבלה`);
    }
    setErrorIds(prev => { const next = new Set(prev); next.delete(entry.id); return next; });
    setSendingId(entry.id);
    try {
      const res = await authFetch('/api/receipts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerName:  entry.customer_name || '',
          customerId:    entry.customer_id   || undefined,
          customerEmail: entry.customer_email?.trim() || undefined,
          amount:        entry.amount,
          branch:        entry.branch,
          payments: [{
            paymentMethod: 4,
            amount: entry.amount,
            bankName:     entry.bank_name     || undefined,
            bankBranch:   entry.bank_branch   || undefined,
            bankAccount:  entry.bank_account  || undefined,
            checkNumber:  entry.reference_number || undefined,
            transferDate: entry.transfer_date    || undefined,
          }],
          notes: entry.notes?.trim() || undefined,
          fundId: entry.fund_id || undefined,
          sendTelegram: !!entry.send_telegram,
        }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || 'שגיאה');
      await supabase.from('pending_receipts').update({ status: 'success', doc_number: data.docNumber }).eq('id', entry.id);
      setEntries(prev => prev.filter(e => e.id !== entry.id));
      if (!batch) toast.success(`קבלה ${data.docNumber} הופקה עבור ${entry.customer_name || 'הלקוח'}`);
      return { ok: true };
    } catch (err) {
      await supabase.from('pending_receipts').update({ status: 'error' }).eq('id', entry.id);
      setEntries(prev => prev.map(e => e.id === entry.id ? { ...e, status: 'error' } : e));
      return fail(`${entry.customer_name || 'העברה'}: ${err.message}`);
    } finally {
      setSendingId(null);
    }
  };

  const batchCreate = async () => {
    const selected = filteredEntries.filter(e => selectedIds.has(e.id));
    if (!selected.length) return;
    setBatchSending(true);
    const failures = [];
    let done = 0;
    for (const entry of selected) {
      const r = await createReceipt(entry, { batch: true });
      if (r.ok) done++; else failures.push(r.error);
    }
    setSelectedIds(new Set());
    setBatchSending(false);
    if (done) toast.success(`הופקו ${formatNumber(done)} קבלות`);
    if (failures.length) {
      toast.error(failures.slice(0, 3).join('\n') + (failures.length > 3 ? `\n…ועוד ${failures.length - 3}` : ''), {
        title: `${failures.length} העברות לא הופקו`,
      });
    }
  };

  const exportExcel = async () => {
    const rows = (selectedIds.size > 0 ? filteredEntries.filter(e => selectedIds.has(e.id)) : filteredEntries)
      .map(e => ({ 'שם לקוח': e.customer_name || '', 'ת.ז': e.customer_id || '', 'אימייל': e.customer_email || '', 'סכום': e.amount ?? '', 'תאריך': e.transfer_date || '', 'בנק': e.bank_name || '', 'סניף': e.bank_branch || '', 'חשבון': e.bank_account || '', 'אסמכתא': e.reference_number || '', 'מוסד': e.branch || '', 'הערות': e.notes || '' }));
    if (!rows.length) return;
    const XLSX = await import('xlsx');
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'העברות');
    XLSX.writeFile(wb, `pending-${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const filteredEntries = entries
    .filter(e => { if (idFilter === 'has_id') return hasId(e); if (idFilter === 'no_id') return !hasId(e); return true; })
    .filter(e => {
      const q = search.trim().toLowerCase();
      if (!q) return true;
      return [e.customer_name, e.customer_id, e.customer_email, e.reference_number, e.bank_account, e.bank_name, e.notes, e.amount != null ? String(e.amount) : '']
        .some(v => v && String(v).toLowerCase().includes(q));
    })
    .sort((a, b) => {
      if (sortBy === 'name')   return (a.customer_name || '').localeCompare(b.customer_name || '', 'he');
      if (sortBy === 'branch') { const c = (a.branch || '').localeCompare(b.branch || '', 'he'); return c !== 0 ? c : (a.customer_name || '').localeCompare(b.customer_name || '', 'he'); }
      const at = a.created_at ? new Date(a.created_at).getTime() : 0;
      const bt = b.created_at ? new Date(b.created_at).getTime() : 0;
      return sortBy === 'newest' ? bt - at : at - bt;
    });

  const allSelected = filteredEntries.length > 0 && filteredEntries.every(e => selectedIds.has(e.id));
  const toggleAll = () => setSelectedIds(allSelected ? new Set() : new Set(filteredEntries.map(e => e.id)));
  const toggleOne = (id) => setSelectedIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const previewTotal = importPreview ? importPreview.reduce((sum, r) => sum + (r.amount || 0), 0) : 0;

  // Plain render helper (not a component) so re-renders don't remount the
  // uncontrolled inputs. Each field saves on blur; `key` includes the stored
  // value so an external change (e.g. a picked suggestion) refreshes it.
  const entryField = (entry, field, label, { wide, ...props } = {}) => {
    const id = `pr-${entry.id}-${field}`;
    return (
      <Field label={label} htmlFor={id} className={wide ? s.wide : undefined}>
        <Input
          id={id}
          key={`${field}-${entry.id}-${entry[field] ?? ''}`}
          size="sm"
          defaultValue={entry[field] ?? ''}
          onBlur={(e) => updateField(entry.id, field, e.target.value.trim())}
          onKeyDown={blurOnEnter}
          {...props}
        />
      </Field>
    );
  };

  return (
    <Stack>
      <Card>
        <CardHeader title="ייבוא העברות" subtitle="מקובץ אקסל של הבנק, או מצילומי מסך של אישורי העברה. שום דבר לא נשמר לפני שמאשרים." />
        <CardBody>
          <div className={s.uploads}>
            <FileDrop icon="sheet" title="העלאת קובץ אקסל" hint="xlsx, xls, csv" accept=".xlsx,.xls,.csv" onFiles={([f]) => handleExcel(f)} compact />
            <FileDrop
              icon="image"
              title={imgAnalyzing ? `מנתח ${imgProgress.current} מתוך ${imgProgress.total}…` : 'העלאת צילומי מסך של העברות'}
              hint="jpg, png, webp — אפשר לבחור כמה תמונות יחד"
              accept="image/jpeg,image/jpg,image/png,image/webp"
              multiple
              disabled={imgAnalyzing}
              onFiles={handleImages}
              compact
            />
          </div>
          {imgErrors.length > 0 && (
            <Alert tone="danger" className={s.mt} title={`${imgErrors.length} תמונות לא נותחו`} onClose={() => setImgErrors([])}>
              <ul className={s.errorList}>
                {imgErrors.map((e, i) => <li key={i}>{e.fileName} — {e.error}</li>)}
              </ul>
            </Alert>
          )}
        </CardBody>
      </Card>

      {/* Import preview — nothing is saved until the user confirms */}
      {importPreview && (
        <Card className={s.previewCard}>
          <CardHeader
            title="בדיקה לפני ייבוא"
            subtitle={`${formatNumber(importPreview.length)} שורות · סה"כ ${formatCurrency(previewTotal)} · אפשר לתקן או להסיר שורות לפני האישור`}
            actions={(
              <>
                <Button variant="ghost" onClick={() => setImportPreview(null)} disabled={importing}>ביטול</Button>
                <Button variant="primary" icon="check" onClick={confirmImport} loading={importing}>
                  אישור ייבוא ({formatNumber(importPreview.length)})
                </Button>
              </>
            )}
          />
          <div className={s.previewScroll}>
            <Table>
              <thead>
                <tr><th>שם</th><th>סכום</th><th>תאריך</th><th>בנק</th><th>חשבון</th><th>אסמכתא</th><th>מוסד</th><th /></tr>
              </thead>
              <tbody>
                {importPreview.map((r, i) => (
                  <tr key={r._key ?? i}>
                    <td>
                      <div className={s.nameCell}>
                        <Input size="sm" defaultValue={r.customer_name || ''} placeholder="שם" aria-label="שם"
                          onBlur={(e) => updatePreviewField(i, 'customer_name', e.target.value.trim())} />
                        {r._uncertain && (
                          <Icon name="alertTriangle" size={16} className={s.warnIcon} title="שם לא מאומת מהצילום (שם בעל החשבון) — יש לבדוק" />
                        )}
                      </div>
                    </td>
                    <td><Input size="sm" type="number" defaultValue={r.amount ?? ''} placeholder="סכום" aria-label="סכום" dir="ltr"
                      onBlur={(e) => updatePreviewField(i, 'amount', e.target.value ? parseFloat(e.target.value) : null)} /></td>
                    <td><Input size="sm" defaultValue={r.transfer_date || ''} placeholder="dd/mm/yyyy" aria-label="תאריך" dir="ltr"
                      onBlur={(e) => updatePreviewField(i, 'transfer_date', e.target.value.trim())} /></td>
                    <td><Input size="sm" defaultValue={r.bank_name || ''} placeholder="בנק" aria-label="בנק"
                      onBlur={(e) => updatePreviewField(i, 'bank_name', e.target.value.trim())} /></td>
                    <td><Input size="sm" defaultValue={r.bank_account || ''} placeholder="חשבון" aria-label="חשבון" dir="ltr"
                      onBlur={(e) => updatePreviewField(i, 'bank_account', e.target.value.trim())} /></td>
                    <td><Input size="sm" defaultValue={r.reference_number || ''} placeholder="אסמכתא" aria-label="אסמכתא" dir="ltr"
                      onBlur={(e) => updatePreviewField(i, 'reference_number', e.target.value.trim())} /></td>
                    <td>
                      <Select size="sm" value={r.branch || ''} aria-label="מוסד" onChange={(e) => updatePreviewField(i, 'branch', e.target.value)}>
                        <option value="">בחר מוסד…</option>
                        {BRANCHES.map(b => <option key={b} value={b}>{b}</option>)}
                      </Select>
                    </td>
                    <td><IconButton size="sm" icon="x" label="הסרת השורה מהייבוא" onClick={() => removePreviewRow(i)} /></td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </div>
        </Card>
      )}

      {/* Checkpoint */}
      <Card>
        <CardHeader
          title="נקודת עצירה לייבוא מאקסל"
          subtitle="פרטי הקבלה האחרונה שהונפקה — בייבוא הבא ייקלטו רק שורות חדשות ממנה"
          actions={(
            <>
              {checkpoint && !showCpForm && <Button size="sm" variant="ghost" icon="x" onClick={clearCheckpoint}>ניקוי</Button>}
              <Button
                size="sm"
                variant={checkpoint ? 'secondary' : 'soft'}
                icon={checkpoint ? 'edit' : 'plus'}
                onClick={() => { setCpDraft(checkpoint ?? EMPTY_CHECKPOINT); setShowCpForm(!showCpForm); }}
              >
                {showCpForm ? 'סגירה' : checkpoint ? 'עריכה' : 'הגדרת נקודת עצירה'}
              </Button>
            </>
          )}
        />
        {(checkpoint || showCpForm) && (
          <CardBody>
            {showCpForm ? (
              <>
                <div className={formStyles.grid}>
                  {CHECKPOINT_FIELDS.map(([key, lbl]) => (
                    <Field key={key} label={lbl} required={key === 'amount'}>
                      <Input
                        value={cpDraft[key]}
                        onChange={(e) => setCpDraft(p => ({ ...p, [key]: e.target.value }))}
                        placeholder={key === 'transfer_date' ? 'DD/MM/YYYY' : lbl}
                        type={key === 'amount' ? 'number' : 'text'}
                      />
                    </Field>
                  ))}
                </div>
                <div className={s.entryFooter}>
                  <Button variant="primary" onClick={saveCheckpoint} disabled={!cpDraft.amount.trim()}>שמירה</Button>
                  <Button variant="ghost" onClick={() => setShowCpForm(false)}>ביטול</Button>
                </div>
              </>
            ) : (
              <div className={s.checkpointSummary}>
                {checkpoint.customer_name && <span><strong>{checkpoint.customer_name}</strong></span>}
                {checkpoint.amount && <span>סכום: <strong>{formatCurrency(Number(checkpoint.amount))}</strong></span>}
                {checkpoint.transfer_date && <span>תאריך: <strong>{checkpoint.transfer_date}</strong></span>}
                {checkpoint.reference_number && <span>אסמכתא: <strong>{checkpoint.reference_number}</strong></span>}
                {checkpoint.bank_account && <span>חשבון: <strong>{checkpoint.bank_account}</strong></span>}
              </div>
            )}
          </CardBody>
        )}
      </Card>

      {/* Pending entries */}
      <Card>
        {loading ? (
          <StateMessage kind="loading" />
        ) : entries.length === 0 ? (
          <StateMessage title="אין העברות שממתינות לקבלה" description="מעלים קובץ אקסל או צילומי מסך, והן יופיעו כאן" icon="inbox" />
        ) : (
          <>
            <Toolbar>
              <SearchInput
                className={toolbarSearchClass}
                value={search}
                delay={150}
                onSearch={(q) => { setSearch(q); setSelectedIds(new Set()); }}
                placeholder='חיפוש: שם, ת"ז, סכום, אסמכתא…'
              />
              <SegmentedControl
                aria-label="סינון לפי תעודת זהות"
                options={ID_FILTERS}
                value={idFilter}
                onChange={(v) => { setIdFilter(v); setSelectedIds(new Set()); }}
              />
              <Select value={sortBy} onChange={(e) => setSortBy(e.target.value)} aria-label="מיון">
                {SORTS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </Select>
              <ToolbarSpacer />
              <ToolbarMeta>{formatNumber(filteredEntries.length)} ממתינות</ToolbarMeta>
              <Button icon="download" onClick={exportExcel}>ייצוא</Button>
            </Toolbar>

            <div className={s.selectBar}>
              <Checkbox checked={allSelected} onChange={toggleAll} label={selectedIds.size ? `${selectedIds.size} נבחרו` : 'סימון הכל'} />
              {selectedIds.size > 0 && (
                <>
                  <Button size="sm" variant="dangerSoft" icon="trash" onClick={deleteSelected}>מחיקת {selectedIds.size}</Button>
                  {idFilter === 'has_id' ? (
                    <Button size="sm" variant="primary" icon="receipt" onClick={batchCreate} loading={batchSending}>
                      {batchSending ? 'מפיק…' : `הפקת ${selectedIds.size} קבלות`}
                    </Button>
                  ) : (
                    <span className={s.selectHint}>להפקה מרובה עוברים לסינון "יש ת"ז"</span>
                  )}
                </>
              )}
            </div>

            {filteredEntries.length === 0 && <StateMessage compact title="אין תוצאות" description="נסה לשנות את החיפוש או את הסינון" />}

            {filteredEntries.map((entry) => {
              const missingId = errorIds.has(entry.id) && !entry.customer_id?.trim();
              const busy = sendingId === entry.id;
              const nameId = `pr-${entry.id}-customer_name`;
              return (
                <div key={entry.id} className={[s.entry, selectedIds.has(entry.id) && s.entrySelected, entry.status === 'error' && s.entryError].filter(Boolean).join(' ')}>
                  <div className={s.entryHead}>
                    <input
                      type="checkbox"
                      className={s.entryCheck}
                      checked={selectedIds.has(entry.id)}
                      onChange={() => toggleOne(entry.id)}
                      aria-label={`סימון ${entry.customer_name || 'העברה'}`}
                    />
                    <Field label="שם" htmlFor={nameId}>
                      <div className={formStyles.suggestWrap}>
                        <Input
                          id={nameId}
                          key={`n-${entry.id}-${entry.customer_name}`}
                          size="sm"
                          defaultValue={entry.customer_name || ''}
                          placeholder="שם לקוח"
                          autoComplete="off"
                          onChange={(e) => searchNameSuggestions(entry.id, e.target.value)}
                          onFocus={() => setActiveSuggestId(entry.id)}
                          onBlur={(e) => { updateField(entry.id, 'customer_name', e.target.value.trim()); setTimeout(() => setActiveSuggestId(null), 150); }}
                          onKeyDown={blurOnEnter}
                        />
                        {activeSuggestId === entry.id && (
                          <Suggestions
                            items={nameSuggestions[entry.id]}
                            onSelect={(c) => applyNameSuggestion(entry, c)}
                            getTitle={(c) => c.name}
                            getSub={(c) => [c.id_number, c.bank_account, c.email].filter(Boolean).join(' · ')}
                          />
                        )}
                      </div>
                      {uncertainNameIds.has(entry.id) && (
                        <div className={s.warnText}>שם לא מאומת מהצילום (שם בעל החשבון) — יש לבדוק</div>
                      )}
                    </Field>
                    {entryField(entry, 'amount', 'סכום (₪)', {
                      type: 'number',
                      dir: 'ltr',
                      className: s.amount,
                      onBlur: (e) => updateField(entry.id, 'amount', e.target.value ? parseFloat(e.target.value) : null),
                    })}
                    <div className={s.entryMeta}>
                      {entry.status === 'error' && <Badge tone="danger">שגיאה — נסה שוב</Badge>}
                      {entry.created_at && <span>נוסף {formatDateTime(entry.created_at)}</span>}
                    </div>
                  </div>

                  <div className={s.entryFields}>
                    <Field label={isIdOptional(entry.branch) ? 'ת"ז' : 'ת"ז *'} htmlFor={`pr-${entry.id}-customer_id`} error={missingId ? 'חובה להפקת קבלה' : undefined}>
                      <Input
                        id={`pr-${entry.id}-customer_id`}
                        key={`id-${entry.id}-${entry.customer_id}`}
                        size="sm"
                        dir="ltr"
                        inputMode="numeric"
                        defaultValue={entry.customer_id || ''}
                        placeholder="מספר זהות"
                        aria-invalid={missingId || undefined}
                        onBlur={(e) => {
                          updateField(entry.id, 'customer_id', e.target.value.trim());
                          if (e.target.value.trim()) setErrorIds(p => { const n = new Set(p); n.delete(entry.id); return n; });
                        }}
                        onKeyDown={blurOnEnter}
                      />
                    </Field>
                    {entryField(entry, 'transfer_date', 'תאריך', { placeholder: 'dd/mm/yyyy', dir: 'ltr' })}
                    {entryField(entry, 'bank_name', 'בנק', { placeholder: 'בנק' })}
                    {entryField(entry, 'bank_branch', 'סניף', { placeholder: 'סניף', dir: 'ltr' })}
                    {entryField(entry, 'bank_account', 'חשבון', { placeholder: 'חשבון', dir: 'ltr' })}
                    {entryField(entry, 'reference_number', 'אסמכתא', { placeholder: 'מספר אסמכתא', dir: 'ltr' })}
                    {entryField(entry, 'customer_email', 'מייל (הקבלה תישלח אליו)', { wide: true, type: 'email', dir: 'ltr', placeholder: 'email@example.com' })}
                    {entryField(entry, 'notes', 'הערות', {
                      wide: true,
                      placeholder: 'הערות',
                      onBlur: (e) => updateField(entry.id, 'notes', e.target.value),
                    })}
                  </div>

                  <div className={s.entryFooter}>
                    <Select size="sm" value={entry.branch || ''} aria-label="מוסד" aria-invalid={!entry.branch || undefined}
                      onChange={(e) => updateField(entry.id, 'branch', e.target.value)}>
                      <option value="">בחר מוסד…</option>
                      {BRANCHES.map(b => <option key={b} value={b}>{b}</option>)}
                    </Select>
                    <Select size="sm" value={entry.fund_id || ''} aria-label="קרן" onChange={(e) => updateField(entry.id, 'fund_id', e.target.value)}>
                      <option value="">ללא קרן</option>
                      {funds.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                    </Select>
                    <Checkbox checked={!!entry.send_telegram} onChange={(e) => updateField(entry.id, 'send_telegram', e.target.checked)} label="שליחה לטלגרם" />
                    <ToolbarSpacer />
                    <IconButton size="sm" icon="trash" label="מחיקת ההעברה" onClick={() => deleteEntry(entry)} disabled={busy} />
                    <Button size="sm" variant="primary" icon="receipt" onClick={() => createReceipt(entry)} loading={busy}>
                      {busy ? 'מפיק…' : 'הפקת קבלה'}
                    </Button>
                  </div>
                </div>
              );
            })}
          </>
        )}
      </Card>
    </Stack>
  );
}
