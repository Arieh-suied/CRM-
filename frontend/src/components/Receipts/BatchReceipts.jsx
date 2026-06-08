import { useState, useEffect, useRef, useCallback } from 'react';
import * as XLSX from 'xlsx';
import styles from './Receipts.module.css';
import { supabase } from '../../lib/supabase.js';
import { useAuth } from '../../contexts/AuthContext.jsx';

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

export default function BatchReceipts() {
  const { user } = useAuth();
  const [entries, setEntries]         = useState([]);
  const [loading, setLoading]         = useState(true);
  const [sendingId, setSendingId]     = useState(null);
  const [batchSending, setBatchSending] = useState(false);
  const [errorIds, setErrorIds]       = useState(new Set());
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [idFilter, setIdFilter]       = useState('all');
  const [sortBy, setSortBy]           = useState('name');

  // Checkpoint
  const [checkpoint, setCheckpoint]   = useState(null);
  const [showCpForm, setShowCpForm]   = useState(false);
  const [cpDraft, setCpDraft]         = useState({ customer_name: '', amount: '', reference_number: '', bank_account: '' });

  const xlsxRef = useRef(null);

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
        if (data) setCheckpoint({ customer_name: data.customer_name ?? '', amount: data.amount != null ? String(data.amount) : '', reference_number: data.reference_number ?? '', bank_account: data.bank_account ?? '' });
      });
  }, [user]);

  const saveCheckpoint = async () => {
    if (!cpDraft.amount.trim()) return;
    setCheckpoint({ ...cpDraft });
    setShowCpForm(false);
    if (user) {
      await supabase.from('manual_checkpoints').delete().eq('user_id', user.id);
      await supabase.from('manual_checkpoints').insert({ user_id: user.id, customer_name: cpDraft.customer_name || null, amount: cpDraft.amount ? parseFloat(cpDraft.amount) : null, reference_number: cpDraft.reference_number || null, bank_account: cpDraft.bank_account || null });
    }
  };

  const clearCheckpoint = async () => {
    setCheckpoint(null);
    if (user) await supabase.from('manual_checkpoints').delete().eq('user_id', user.id);
  };

  // Excel upload
  const handleExcel = async (file) => {
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
          if (sameName || sameRef || sameAccount) { cpIdx = i; break; }
        }
      }

      let inserts = cpIdx >= 0 ? preparedRows.slice(0, cpIdx) : preparedRows;
      inserts = inserts.filter(r => !skipNames.some(s => r.customer_name?.includes(s)));
      allInserts.push(...inserts);
    }

    if (!allInserts.length) { alert('לא נמצאו שורות חדשות לייבוא'); return; }
    const { error } = await supabase.from('pending_receipts').insert(allInserts);
    if (!error) { fetchEntries(); if (xlsxRef.current) xlsxRef.current.value = ''; }
    else alert('שגיאה בשמירה: ' + error.message);
  };

  const updateField = async (id, field, value) => {
    const dbVal = value === '' ? null : value;
    await supabase.from('pending_receipts').update({ [field]: dbVal }).eq('id', id);
    setEntries(prev => prev.map(e => e.id === id ? { ...e, [field]: dbVal } : e));
  };

  const deleteEntry = async (id) => {
    await supabase.from('pending_receipts').delete().eq('id', id);
    setEntries(prev => prev.filter(e => e.id !== id));
  };

  const deleteSelected = async () => {
    const ids = selectedIds.size > 0 ? [...selectedIds] : filteredEntries.map(e => e.id);
    if (!ids.length || !confirm(`למחוק ${ids.length} רשומות?`)) return;
    await supabase.from('pending_receipts').delete().in('id', ids);
    setEntries(prev => prev.filter(e => !ids.includes(e.id)));
    setSelectedIds(new Set());
  };

  const createReceipt = async (entry) => {
    if (!entry.branch) return alert('יש לבחור מוסד');
    if (!entry.amount || entry.amount <= 0) return alert('סכום לא תקין');
    if (!isIdOptional(entry.branch) && !entry.customer_id?.trim()) {
      setErrorIds(prev => new Set(prev).add(entry.id));
      return alert('יש למלא ת.ז לפני הפקת קבלה');
    }
    setErrorIds(prev => { const next = new Set(prev); next.delete(entry.id); return next; });
    setSendingId(entry.id);
    try {
      const res = await fetch('/api/receipts', {
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
          telegramRecipient: 'none',
        }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || 'שגיאה');
      await supabase.from('pending_receipts').update({ status: 'success', doc_number: data.docNumber }).eq('id', entry.id);
      setEntries(prev => prev.filter(e => e.id !== entry.id));
    } catch (err) {
      await supabase.from('pending_receipts').update({ status: 'error' }).eq('id', entry.id);
      setEntries(prev => prev.map(e => e.id === entry.id ? { ...e, status: 'error' } : e));
      alert('שגיאה: ' + err.message);
    } finally {
      setSendingId(null);
    }
  };

  const batchCreate = async () => {
    const selected = filteredEntries.filter(e => selectedIds.has(e.id));
    if (!selected.length) return;
    setBatchSending(true);
    for (const entry of selected) {
      try { await createReceipt(entry); } catch { /* individual errors handled */ }
    }
    setSelectedIds(new Set());
    setBatchSending(false);
  };

  const exportExcel = () => {
    const rows = (selectedIds.size > 0 ? filteredEntries.filter(e => selectedIds.has(e.id)) : filteredEntries)
      .map(e => ({ 'שם לקוח': e.customer_name || '', 'ת.ז': e.customer_id || '', 'אימייל': e.customer_email || '', 'סכום': e.amount ?? '', 'תאריך': e.transfer_date || '', 'בנק': e.bank_name || '', 'סניף': e.bank_branch || '', 'חשבון': e.bank_account || '', 'אסמכתא': e.reference_number || '', 'מוסד': e.branch || '', 'הערות': e.notes || '' }));
    if (!rows.length) return;
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'העברות');
    XLSX.writeFile(wb, `pending-${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const filteredEntries = entries
    .filter(e => { if (idFilter === 'has_id') return hasId(e); if (idFilter === 'no_id') return !hasId(e); return true; })
    .sort((a, b) => {
      if (sortBy === 'name')   return (a.customer_name || '').localeCompare(b.customer_name || '', 'he');
      if (sortBy === 'branch') { const c = (a.branch || '').localeCompare(b.branch || '', 'he'); return c !== 0 ? c : (a.customer_name || '').localeCompare(b.customer_name || '', 'he'); }
      const at = a.created_at ? new Date(a.created_at).getTime() : 0;
      const bt = b.created_at ? new Date(b.created_at).getTime() : 0;
      return sortBy === 'newest' ? bt - at : at - bt;
    });

  const allSelected = filteredEntries.length > 0 && filteredEntries.every(e => selectedIds.has(e.id));
  const toggleAll = () => setSelectedIds(allSelected ? new Set() : new Set(filteredEntries.map(e => e.id)));

  return (
    <div>
      <h3 className={styles.sectionTitle}>העלאת העברות בנקאיות</h3>

      {/* Excel upload */}
      <div className={styles.card}>
        <input ref={xlsxRef} type="file" accept=".xlsx,.xls,.csv" style={{ display: 'none' }}
          onChange={e => { const f = e.target.files?.[0]; if (f) handleExcel(f); }} />
        <div className={styles.uploadZone} onClick={() => xlsxRef.current?.click()}>
          <div className={styles.uploadIcon}>📊</div>
          <div className={styles.uploadLabel}>העלה קובץ אקסל</div>
          <div className={styles.uploadSub}>xlsx, xls, csv</div>
        </div>
      </div>

      {/* Checkpoint */}
      <div style={{ marginBottom: 14 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button
            className={`${styles.btn} ${styles.btnGhost} ${styles.btnSm}`}
            onClick={() => { setCpDraft(checkpoint ?? { customer_name: '', amount: '', reference_number: '', bank_account: '' }); setShowCpForm(!showCpForm); }}
          >
            {checkpoint ? '✓ checkpoint ידני פעיל' : 'הגדר קבלה אחרונה'}
          </button>
          {checkpoint && (
            <button className={`${styles.btn} ${styles.btnDanger} ${styles.btnSm}`} onClick={clearCheckpoint}>נקה</button>
          )}
        </div>
        {checkpoint && !showCpForm && (
          <div className={styles.checkpointBar}>
            <span className={styles.checkpointBarLabel}>קבלה אחרונה:</span>
            {checkpoint.customer_name && <span>{checkpoint.customer_name}</span>}
            {checkpoint.amount && <span>₪{checkpoint.amount}</span>}
            {checkpoint.reference_number && <span>אסמכתא: {checkpoint.reference_number}</span>}
            {checkpoint.bank_account && <span>חשבון: {checkpoint.bank_account}</span>}
          </div>
        )}
        {showCpForm && (
          <div className={styles.card} style={{ marginTop: 8 }}>
            <p style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 0 }}>פרטי הקבלה האחרונה שהונפקה. שורות חדשות יותר ממנה בלבד ייובאו.</p>
            <div className={styles.formGrid}>
              {[['customer_name','שם לקוח'],['amount','סכום'],['reference_number','אסמכתא'],['bank_account','חשבון בנק']].map(([key, lbl]) => (
                <div key={key} className={styles.fieldGroup}>
                  <label className={styles.fieldLabel}>{lbl}</label>
                  <input className={styles.fieldInput} value={cpDraft[key]} onChange={e => setCpDraft(p => ({ ...p, [key]: e.target.value }))} placeholder={lbl} type={key === 'amount' ? 'number' : 'text'} />
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
              <button className={`${styles.btn} ${styles.btnPrimary} ${styles.btnSm}`} onClick={saveCheckpoint} disabled={!cpDraft.amount.trim()}>שמור</button>
              <button className={`${styles.btn} ${styles.btnGhost} ${styles.btnSm}`} onClick={() => setShowCpForm(false)}>ביטול</button>
            </div>
          </div>
        )}
      </div>

      {/* Entries list */}
      {loading ? (
        <div className={styles.placeholder}>טוען...</div>
      ) : entries.length === 0 ? (
        <div className={styles.empty}>אין העברות ממתינות. העלה קובץ אקסל.</div>
      ) : (
        <>
          {/* Toolbar */}
          <div className={styles.toolbar}>
            <span style={{ fontSize: 13, fontWeight: 600 }}>{filteredEntries.length} העברות ממתינות</span>
            <div className={styles.filterBtns}>
              {(['all','has_id','no_id']).map(f => (
                <button key={f} className={`${styles.filterBtn} ${idFilter === f ? styles.filterBtnActive : ''}`}
                  onClick={() => { setIdFilter(f); setSelectedIds(new Set()); }}>
                  {f === 'all' ? 'הכל' : f === 'has_id' ? 'יש ת.ז' : 'חסר ת.ז'}
                </button>
              ))}
              <span style={{ margin: '0 4px', borderRight: '1px solid var(--color-border)', height: 16, alignSelf: 'center' }} />
              {(['name','branch','newest','oldest']).map(s => (
                <button key={s} className={`${styles.filterBtn} ${sortBy === s ? styles.filterBtnActive : ''}`}
                  onClick={() => setSortBy(s)}>
                  {s === 'name' ? 'א-ב' : s === 'branch' ? 'מוסד' : s === 'newest' ? 'חדש→ישן' : 'ישן→חדש'}
                </button>
              ))}
            </div>
            <div className={styles.toolbarRight}>
              <button className={`${styles.btn} ${styles.btnGhost} ${styles.btnSm}`} onClick={exportExcel}>⬇ ייצוא</button>
              <button className={`${styles.btn} ${styles.btnDanger} ${styles.btnSm}`} onClick={deleteSelected}>🗑 מחק</button>
            </div>
          </div>

          {/* Select all bar */}
          <div className={styles.selectBar}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input type="checkbox" className={styles.checkbox} checked={allSelected} onChange={toggleAll} />
              <span>סמן הכל ({selectedIds.size} נבחרו)</span>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              {selectedIds.size > 0 && (
                <button className={`${styles.btn} ${styles.btnDanger} ${styles.btnSm}`} onClick={deleteSelected}>
                  🗑 מחק {selectedIds.size}
                </button>
              )}
              {idFilter === 'has_id' && selectedIds.size > 0 && (
                <button className={`${styles.btn} ${styles.btnPrimary} ${styles.btnSm}`} disabled={batchSending} onClick={batchCreate}>
                  {batchSending ? 'שולח...' : `הפק ${selectedIds.size} קבלות`}
                </button>
              )}
            </div>
          </div>

          {/* Entry cards */}
          {filteredEntries.map(entry => (
            <div key={entry.id} className={`${styles.entryCard} ${entry.status === 'error' ? styles.entryCardError : ''}`}>
              {/* Row 1: Name + Amount */}
              <div className={styles.entryRow} style={{ alignItems: 'flex-start' }}>
                <input type="checkbox" className={styles.checkbox} style={{ marginTop: 4 }}
                  checked={selectedIds.has(entry.id)}
                  onChange={() => setSelectedIds(prev => { const n = new Set(prev); n.has(entry.id) ? n.delete(entry.id) : n.add(entry.id); return n; })} />
                <div style={{ flex: 1 }}>
                  <div className={styles.entryMeta}>
                    <span>שם</span>
                    {entry.created_at && <span>נוסף: {new Date(entry.created_at).toLocaleString('he-IL', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>}
                  </div>
                  <input key={`n-${entry.id}-${entry.customer_name}`}
                    defaultValue={entry.customer_name || ''}
                    className={styles.inlineInput}
                    placeholder="שם לקוח"
                    onBlur={e => updateField(entry.id, 'customer_name', e.target.value.trim())}
                    onKeyDown={e => e.key === 'Enter' && e.target.blur()}
                  />
                </div>
                <div style={{ width: 110 }}>
                  <div className={styles.entryMeta}><span>סכום</span></div>
                  <input key={`a-${entry.id}`}
                    defaultValue={entry.amount ?? ''}
                    className={`${styles.inlineInput} ${styles.amountInput}`}
                    type="number" placeholder="סכום"
                    onBlur={e => updateField(entry.id, 'amount', e.target.value ? parseFloat(e.target.value) : null)}
                    onKeyDown={e => e.key === 'Enter' && e.target.blur()}
                  />
                </div>
              </div>

              {/* Row 2: ID + Date */}
              <div className={styles.entryRow}>
                <div style={{ flex: 1 }}>
                  <div className={styles.entryMeta}><span>ת.ז *</span></div>
                  <input key={`id-${entry.id}-${entry.customer_id}`}
                    defaultValue={entry.customer_id || ''}
                    className={`${styles.inlineInput} ${errorIds.has(entry.id) && !entry.customer_id?.trim() ? styles.inlineInputError : ''}`}
                    placeholder="מספר זהות"
                    onBlur={e => { updateField(entry.id, 'customer_id', e.target.value.trim()); if (e.target.value.trim()) setErrorIds(p => { const n = new Set(p); n.delete(entry.id); return n; }); }}
                    onKeyDown={e => e.key === 'Enter' && e.target.blur()}
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <div className={styles.entryMeta}><span>תאריך</span></div>
                  <input key={`d-${entry.id}`}
                    defaultValue={entry.transfer_date || ''}
                    className={styles.inlineInput} placeholder="dd/mm/yyyy"
                    onBlur={e => updateField(entry.id, 'transfer_date', e.target.value.trim())}
                    onKeyDown={e => e.key === 'Enter' && e.target.blur()}
                  />
                </div>
              </div>

              {/* Row 3: Bank details */}
              <div className={styles.entryRow}>
                <div style={{ flex: 1 }}>
                  <div className={styles.entryMeta}><span>בנק</span></div>
                  <input key={`bk-${entry.id}-${entry.bank_name}`} defaultValue={entry.bank_name || ''} className={styles.inlineInput} placeholder="בנק"
                    onBlur={e => updateField(entry.id, 'bank_name', e.target.value.trim())} onKeyDown={e => e.key === 'Enter' && e.target.blur()} />
                </div>
                <div style={{ width: 70 }}>
                  <div className={styles.entryMeta}><span>סניף</span></div>
                  <input key={`br-${entry.id}-${entry.bank_branch}`} defaultValue={entry.bank_branch || ''} className={styles.inlineInput} placeholder="סניף"
                    onBlur={e => updateField(entry.id, 'bank_branch', e.target.value.trim())} onKeyDown={e => e.key === 'Enter' && e.target.blur()} />
                </div>
                <div style={{ width: 100 }}>
                  <div className={styles.entryMeta}><span>חשבון</span></div>
                  <input key={`ac-${entry.id}-${entry.bank_account}`} defaultValue={entry.bank_account || ''} className={styles.inlineInput} placeholder="חשבון"
                    onBlur={e => updateField(entry.id, 'bank_account', e.target.value.trim())} onKeyDown={e => e.key === 'Enter' && e.target.blur()} />
                </div>
              </div>

              {/* Row 4: Reference + Notes */}
              <div className={styles.entryRow}>
                <div style={{ flex: 1 }}>
                  <div className={styles.entryMeta}><span>אסמכתא</span></div>
                  <input key={`ref-${entry.id}`} defaultValue={entry.reference_number || ''} className={styles.inlineInput} placeholder="מספר אסמכתא"
                    onBlur={e => updateField(entry.id, 'reference_number', e.target.value.trim())} onKeyDown={e => e.key === 'Enter' && e.target.blur()} />
                </div>
                <div style={{ flex: 1 }}>
                  <div className={styles.entryMeta}><span>הערות</span></div>
                  <input key={`no-${entry.id}`} defaultValue={entry.notes || ''} className={styles.inlineInput} placeholder="הערות"
                    onBlur={e => updateField(entry.id, 'notes', e.target.value)} onKeyDown={e => e.key === 'Enter' && e.target.blur()} />
                </div>
              </div>

              {/* Row 5: Email */}
              <div style={{ marginBottom: 10 }}>
                <div className={styles.entryMeta}><span>דוא"ל (ישלח קבלה אוטומטית)</span></div>
                <input key={`em-${entry.id}-${entry.customer_email}`} defaultValue={entry.customer_email || ''} className={styles.inlineInput} placeholder="email@example.com" type="email" dir="ltr"
                  onBlur={e => updateField(entry.id, 'customer_email', e.target.value.trim())} onKeyDown={e => e.key === 'Enter' && e.target.blur()} />
              </div>

              {entry.status === 'error' && (
                <span className={`${styles.badge} ${styles.badgeError}`} style={{ marginBottom: 8, display: 'inline-block' }}>שגיאה - נסה שוב</span>
              )}

              {/* Actions */}
              <div className={styles.entryActions}>
                <select className={styles.fieldSelect} style={{ height: 34, flex: 1, fontSize: 12 }} value={entry.branch}
                  onChange={e => updateField(entry.id, 'branch', e.target.value)}>
                  <option value="">בחר מוסד</option>
                  {BRANCHES.map(b => <option key={b} value={b}>{b}</option>)}
                </select>
                <button
                  className={`${styles.btn} ${styles.btnPrimary} ${styles.btnSm}`}
                  disabled={sendingId === entry.id}
                  onClick={() => createReceipt(entry)}
                >
                  {sendingId === entry.id ? 'שולח...' : '📄 צור קבלה'}
                </button>
                <button className={styles.btnIconDanger} disabled={sendingId === entry.id} onClick={() => deleteEntry(entry.id)}>🗑</button>
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  );
}
