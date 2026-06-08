import { useState, useEffect, useCallback, useRef } from 'react';
import * as XLSX from 'xlsx';
import styles from './Receipts.module.css';
import { supabase } from '../../lib/supabase.js';
import { useAuth } from '../../contexts/AuthContext.jsx';

const INSTITUTIONS = ['סומך נופלים', 'אור אפרים', 'חכמי ירושלים'];

const STATUS_LABELS = { pending: 'ממתין', matched: 'הוצלב', cancelled: 'בוטל' };
const STATUS_CLASSES = { pending: styles.badgePending, matched: styles.badgeMatched, cancelled: styles.badgeError };

// ── MASAV / Excel parser ─────────────────────────────────────────────────────
const NAME_KEYS    = ['שם', 'שם לקוח', 'שם החייב', 'שם משלם', 'name', 'payer'];
const AMOUNT_KEYS  = ['סכום', 'סכום בשח', 'amount', 'value', 'סך'];
const DATE_KEYS    = ['תאריך', 'תאריך עסקה', 'date', 'transaction date'];
const REF_KEYS     = ['אסמכתא', 'מספר אסמכתא', 'reference', 'ref'];
const ACCOUNT_KEYS = ['חשבון', 'מספר חשבון', 'account', 'מס חשבון'];
const BANK_KEYS    = ['בנק', 'שם בנק', 'bank'];
const BRANCH_KEYS  = ['סניף', 'מספר סניף', 'branch'];
const ID_KEYS      = ['תז', 'זהות', 'תעודת זהות', 'id', 'payer id'];

function norm(s) {
  return String(s).replace(/^﻿/, '').replace(/[֑-ׇ]/g, '').replace(/["'׳״.\-_]/g, '').replace(/\s+/g, '').toLowerCase();
}
function findKey(row, candidates) {
  const keys = Object.keys(row);
  const nc = candidates.map(norm);
  for (const k of keys) { const nk = norm(k); if (nc.some(c => nk === c || nk.includes(c) || c.includes(nk))) return k; }
  return null;
}
function parseAmt(v) {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return v;
  const n = parseFloat(String(v).replace(/[^\d.\-,]/g, '').replace(/,/g, ''));
  return isNaN(n) ? null : n;
}
function parseDate(v) {
  if (v == null || v === '') return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === 'number') {
    const d = new Date((v - 25569) * 86400 * 1000);
    return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
  }
  const s = String(v).trim();
  const m = s.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})$/);
  if (m) { let [, d, mo, y] = m; if (y.length === 2) y = `20${y}`; return `${y}-${mo.padStart(2,'0')}-${d.padStart(2,'0')}`; }
  const m2 = s.match(/^(\d{4})[\/\-\.](\d{1,2})[\/\-\.](\d{1,2})$/);
  if (m2) { const [, y, mo, d] = m2; return `${y}-${mo.padStart(2,'0')}-${d.padStart(2,'0')}`; }
  const dt = new Date(s);
  return isNaN(dt.getTime()) ? null : dt.toISOString().slice(0, 10);
}

async function parseMasavFile(file) {
  const buf = await file.arrayBuffer();
  const isCsv = file.name.toLowerCase().endsWith('.csv') || file.type.includes('csv');
  let rows = [];

  if (isCsv) {
    const bytes = new Uint8Array(buf);
    let bestRows = []; let bestScore = -1;
    for (const enc of ['utf-8', 'windows-1255', 'iso-8859-8']) {
      try {
        const text = new TextDecoder(enc).decode(bytes);
        for (const sep of [',', '\t', ';']) {
          const wb = XLSX.read(text, { type: 'string', cellDates: true, FS: sep });
          const sn = wb.SheetNames[0];
          const r = sn ? XLSX.utils.sheet_to_json(wb.Sheets[sn], { defval: null, raw: false }) : [];
          const score = r[0] ? [NAME_KEYS, AMOUNT_KEYS, DATE_KEYS, REF_KEYS, ACCOUNT_KEYS, BANK_KEYS, BRANCH_KEYS, ID_KEYS].flat().reduce((s, k) => findKey(r[0], [k]) ? s + 1 : s, 0) : -1;
          if (score > bestScore) { bestRows = r; bestScore = score; }
        }
      } catch { continue; }
    }
    rows = bestRows;
  } else {
    const wb = XLSX.read(buf, { type: 'array', cellDates: true });
    const sn = wb.SheetNames[0];
    rows = sn ? XLSX.utils.sheet_to_json(wb.Sheets[sn], { defval: null, raw: false }) : [];
  }

  if (!rows.length) throw new Error('לא נמצאו שורות');
  const sample = rows[0];
  const nameKey    = findKey(sample, NAME_KEYS);
  const idKey      = findKey(sample, ID_KEYS);
  const amountKey  = findKey(sample, AMOUNT_KEYS);
  const dateKey    = findKey(sample, DATE_KEYS);
  const refKey     = findKey(sample, REF_KEYS);
  const accountKey = findKey(sample, ACCOUNT_KEYS);
  const bankKey    = findKey(sample, BANK_KEYS);
  const branchKey  = findKey(sample, BRANCH_KEYS);

  return rows.map(r => {
    const rawAccount = accountKey && r[accountKey] != null ? String(r[accountKey]) : null;
    let bankName   = bankKey   && r[bankKey]   != null ? String(r[bankKey])   : null;
    let bankBranch = branchKey && r[branchKey] != null ? String(r[branchKey]) : null;
    let bankAccount = rawAccount;
    if (rawAccount) {
      const parts = rawAccount.replace(/\s+/g, '').split(/[-\/]/).filter(Boolean);
      if (parts.length === 3) { if (!bankName) bankName = parts[0]; if (!bankBranch) bankBranch = parts[1]; bankAccount = parts[2]; }
    }
    return { payer_name: nameKey ? r[nameKey] ?? null : null, payer_id: idKey && r[idKey] != null ? String(r[idKey]) : null, amount: amountKey ? parseAmt(r[amountKey]) : null, transaction_date: dateKey ? parseDate(r[dateKey]) : null, reference: refKey && r[refKey] != null ? String(r[refKey]) : null, bank_account: bankAccount, bank_name: bankName, bank_branch: bankBranch, raw_row: r };
  }).filter(r => r.payer_name || r.amount || r.reference);
}

// ─────────────────────────────────────────────────────────────────────────────

export default function Reconciliation() {
  const { user } = useAuth();
  const [activeTab, setActiveTab]       = useState('dashboard');
  const [transactions, setTransactions] = useState([]);
  const [matches, setMatches]           = useState([]);
  const [loading, setLoading]           = useState(true);
  const [search, setSearch]             = useState('');

  // Upload state
  const [preview, setPreview]           = useState([]);
  const [institution, setInstitution]   = useState('');
  const [txDate, setTxDate]             = useState(new Date().toISOString().slice(0, 10));
  const [parsing, setParsing]           = useState(false);
  const [saving, setSaving]             = useState(false);
  const [uploadFile, setUploadFile]     = useState(null);
  const fileRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: txs }, { data: mts }] = await Promise.all([
      supabase.from('masav_transactions').select('*').order('transaction_date', { ascending: false }),
      supabase.from('reconciliation_matches').select('id, transaction_id, letter_id, confidence, score'),
    ]);
    setTransactions(txs ?? []);
    setMatches(mts ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleFile = async (file) => {
    if (!file) return;
    setUploadFile(file);
    setParsing(true);
    try {
      const rows = await parseMasavFile(file);
      setPreview(rows);
    } catch (e) {
      alert(e.message);
    } finally {
      setParsing(false);
    }
  };

  const saveUpload = async () => {
    if (!user || !preview.length) return;
    if (!institution) { alert('יש לבחור שם מוסד'); return; }
    setSaving(true);
    try {
      const { data: batch, error: bErr } = await supabase
        .from('masav_batches')
        .insert({ file_name: uploadFile?.name || 'upload', row_count: preview.length, institution, user_id: user.id })
        .select()
        .single();
      if (bErr) throw bErr;
      const inserts = preview.map(r => ({
        user_id: user.id,
        batch_id: batch.id,
        institution,
        payer_name:       r.payer_name,
        payer_id:         r.payer_id,
        amount:           r.amount,
        transaction_date: txDate || r.transaction_date,
        reference:        r.reference,
        bank_account:     r.bank_account,
        bank_name:        r.bank_name,
        bank_branch:      r.bank_branch,
        raw_row:          r.raw_row,
        status: 'pending',
      }));
      const { error } = await supabase.from('masav_transactions').insert(inserts);
      if (error) throw error;
      setPreview([]); setUploadFile(null); setInstitution('');
      if (fileRef.current) fileRef.current.value = '';
      load(); setActiveTab('dashboard');
    } catch (e) {
      alert('שגיאה: ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  const updateStatus = async (id, status) => {
    await supabase.from('masav_transactions').update({ status }).eq('id', id);
    setTransactions(prev => prev.map(t => t.id === id ? { ...t, status } : t));
  };

  const deleteTransaction = async (id) => {
    if (!confirm('למחוק רשומה זו?')) return;
    await supabase.from('masav_transactions').delete().eq('id', id);
    setTransactions(prev => prev.filter(t => t.id !== id));
  };

  const deleteBatch = async (batchId) => {
    if (!confirm('למחוק את כל הרשומות מאצווה זו?')) return;
    await supabase.from('masav_transactions').delete().eq('batch_id', batchId);
    setTransactions(prev => prev.filter(t => t.batch_id !== batchId));
  };

  // Stats
  const total   = transactions.length;
  const pending = transactions.filter(t => t.status === 'pending').length;
  const matched = transactions.filter(t => t.status === 'matched').length;
  const cancelled = transactions.filter(t => t.status === 'cancelled').length;

  const filtered = transactions.filter(t =>
    !search || [t.payer_name, t.payer_id, t.reference, t.bank_account].some(v => v?.toLowerCase().includes(search.toLowerCase()))
  );

  // Group by batch for history view
  const batchGroups = transactions.reduce((acc, t) => {
    const key = t.batch_id || 'none';
    if (!acc[key]) acc[key] = [];
    acc[key].push(t);
    return acc;
  }, {});

  return (
    <div>
      <h3 className={styles.sectionTitle}>הצלבת מסב</h3>

      {/* Sub-tabs */}
      <div className={styles.reconTabs} style={{ borderBottom: '1px solid var(--color-border)', marginBottom: 20 }}>
        {[['dashboard','דשבורד'],['upload','העלאת מסב'],['history','היסטוריה']].map(([id, lbl]) => (
          <button key={id} className={`${styles.reconTab} ${activeTab === id ? styles.reconTabActive : ''}`} onClick={() => setActiveTab(id)}>
            {lbl}
          </button>
        ))}
      </div>

      {/* ── Dashboard ── */}
      {activeTab === 'dashboard' && (
        <>
          <div className={styles.statCards}>
            <div className={styles.statCard}><div className={styles.statValue}>{total}</div><div className={styles.statLabel}>סה"כ</div></div>
            <div className={styles.statCard}><div className={styles.statValue} style={{ color: '#744210' }}>{pending}</div><div className={styles.statLabel}>ממתינים</div></div>
            <div className={styles.statCard}><div className={styles.statValue} style={{ color: '#2b5ea7' }}>{matched}</div><div className={styles.statLabel}>הוצלבו</div></div>
            <div className={styles.statCard}><div className={styles.statValue} style={{ color: '#c53030' }}>{cancelled}</div><div className={styles.statLabel}>בוטלו</div></div>
          </div>

          {/* Search */}
          <div className={styles.toolbar} style={{ padding: '10px 0', border: 'none' }}>
            <input
              className={styles.fieldInput}
              style={{ maxWidth: 280 }}
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="חיפוש לפי שם / אסמכתא / חשבון..."
            />
          </div>

          {loading ? (
            <div className={styles.placeholder}>טוען...</div>
          ) : filtered.length === 0 ? (
            <div className={styles.empty}>אין עסקאות. העלה קובץ מסב.</div>
          ) : (
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>שם משלם</th>
                    <th>ת.ז</th>
                    <th>סכום</th>
                    <th>תאריך</th>
                    <th>אסמכתא</th>
                    <th>מוסד</th>
                    <th>סטטוס</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(t => (
                    <tr key={t.id}>
                      <td style={{ fontWeight: 500 }}>{t.payer_name ?? '—'}</td>
                      <td style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{t.payer_id ?? '—'}</td>
                      <td style={{ fontWeight: 700, color: 'var(--color-success)' }}>{t.amount != null ? `₪${Number(t.amount).toLocaleString('he-IL')}` : '—'}</td>
                      <td style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{t.transaction_date ?? '—'}</td>
                      <td style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{t.reference ?? '—'}</td>
                      <td style={{ fontSize: 12 }}>{t.institution ?? '—'}</td>
                      <td>
                        <span className={`${styles.badge} ${STATUS_CLASSES[t.status] ?? styles.badgePending}`}>
                          {STATUS_LABELS[t.status] ?? t.status}
                        </span>
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: 4 }}>
                          {t.status !== 'matched' && (
                            <button className={`${styles.btn} ${styles.btnGhost} ${styles.btnSm}`} style={{ padding: '3px 8px', fontSize: 11 }}
                              onClick={() => updateStatus(t.id, 'matched')}>הוצלב</button>
                          )}
                          {t.status !== 'cancelled' && (
                            <button className={`${styles.btn} ${styles.btnDanger} ${styles.btnSm}`} style={{ padding: '3px 8px', fontSize: 11 }}
                              onClick={() => updateStatus(t.id, 'cancelled')}>בטל</button>
                          )}
                          {t.status === 'cancelled' && (
                            <button className={`${styles.btn} ${styles.btnGhost} ${styles.btnSm}`} style={{ padding: '3px 8px', fontSize: 11 }}
                              onClick={() => updateStatus(t.id, 'pending')}>שחזר</button>
                          )}
                          <button className={styles.btnIconDanger} onClick={() => deleteTransaction(t.id)}>🗑</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* ── Upload ── */}
      {activeTab === 'upload' && (
        <>
          {/* File picker */}
          <div className={styles.card}>
            <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" style={{ display: 'none' }}
              onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
            <div className={styles.uploadZone} onClick={() => fileRef.current?.click()}>
              {parsing
                ? <div>מנתח קובץ...</div>
                : <>
                    <div className={styles.uploadIcon}>📂</div>
                    <div className={styles.uploadLabel}>העלה קובץ מסב (CSV / Excel)</div>
                    <div className={styles.uploadSub}>{uploadFile ? uploadFile.name : 'לחץ לבחירת קובץ'}</div>
                  </>
              }
            </div>
          </div>

          {preview.length > 0 && (
            <div className={styles.card}>
              <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', marginBottom: 14 }}>
                <div className={styles.fieldGroup}>
                  <label className={styles.fieldLabel}>מוסד *</label>
                  <select className={styles.fieldSelect} value={institution} onChange={e => setInstitution(e.target.value)}>
                    <option value="">בחר מוסד</option>
                    {INSTITUTIONS.map(i => <option key={i} value={i}>{i}</option>)}
                  </select>
                </div>
                <div className={styles.fieldGroup}>
                  <label className={styles.fieldLabel}>תאריך עסקה</label>
                  <input className={styles.fieldInput} type="date" value={txDate} onChange={e => setTxDate(e.target.value)} />
                </div>
                <button className={`${styles.btn} ${styles.btnPrimary}`} onClick={saveUpload} disabled={saving || !institution}>
                  {saving ? 'שומר...' : `שמור ${preview.length} שורות`}
                </button>
                <button className={`${styles.btn} ${styles.btnGhost}`} onClick={() => { setPreview([]); setUploadFile(null); }}>ביטול</button>
              </div>

              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr><th>שם</th><th>ת.ז</th><th>סכום</th><th>תאריך</th><th>אסמכתא</th><th>חשבון</th></tr>
                  </thead>
                  <tbody>
                    {preview.slice(0, 20).map((r, i) => (
                      <tr key={i}>
                        <td>{r.payer_name ?? '—'}</td>
                        <td style={{ fontSize: 12 }}>{r.payer_id ?? '—'}</td>
                        <td style={{ fontWeight: 700, color: 'var(--color-success)' }}>{r.amount != null ? `₪${r.amount}` : '—'}</td>
                        <td style={{ fontSize: 12 }}>{r.transaction_date ?? '—'}</td>
                        <td style={{ fontSize: 12 }}>{r.reference ?? '—'}</td>
                        <td style={{ fontSize: 12 }}>{r.bank_account ?? '—'}</td>
                      </tr>
                    ))}
                    {preview.length > 20 && (
                      <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--color-text-muted)', fontSize: 12 }}>... ועוד {preview.length - 20} שורות</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {/* ── History ── */}
      {activeTab === 'history' && (
        loading ? (
          <div className={styles.placeholder}>טוען...</div>
        ) : Object.keys(batchGroups).length === 0 ? (
          <div className={styles.empty}>אין היסטוריה</div>
        ) : (
          Object.entries(batchGroups).map(([batchId, rows]) => {
            const first = rows[0];
            return (
              <div key={batchId} className={styles.card}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                  <div>
                    <strong style={{ fontSize: 13 }}>{first.institution || 'לא ידוע'}</strong>
                    <span style={{ fontSize: 11, color: 'var(--color-text-muted)', marginRight: 10 }}>
                      {new Date(first.created_at).toLocaleDateString('he-IL')} · {rows.length} שורות
                    </span>
                  </div>
                  <button className={`${styles.btn} ${styles.btnDanger} ${styles.btnSm}`} onClick={() => deleteBatch(batchId)}>מחק אצווה</button>
                </div>
                <div style={{ display: 'flex', gap: 12, fontSize: 12, color: 'var(--color-text-muted)' }}>
                  <span>ממתינים: {rows.filter(r => r.status === 'pending').length}</span>
                  <span>הוצלבו: {rows.filter(r => r.status === 'matched').length}</span>
                  <span>בוטלו: {rows.filter(r => r.status === 'cancelled').length}</span>
                </div>
              </div>
            );
          })
        )
      )}
    </div>
  );
}
