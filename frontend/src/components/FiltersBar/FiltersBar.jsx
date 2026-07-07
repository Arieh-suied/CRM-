import { useState, useEffect, useRef } from 'react';
import styles from './FiltersBar.module.css';

function localStr(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

const today = () => localStr(new Date());
const startOfMonth = () => { const d = new Date(); return localStr(new Date(d.getFullYear(), d.getMonth(), 1)); };
const startOfYear = () => localStr(new Date(new Date().getFullYear(), 0, 1));
const startOfLastMonth = () => { const d = new Date(); return localStr(new Date(d.getFullYear(), d.getMonth() - 1, 1)); };
const endOfLastMonth = () => { const d = new Date(); return localStr(new Date(d.getFullYear(), d.getMonth(), 0)); };

const QUICK_DATES = [
  { label: 'היום',       from: today,            to: today },
  { label: 'החודש',      from: startOfMonth,     to: today },
  { label: 'חודש שעבר', from: startOfLastMonth,  to: endOfLastMonth },
  { label: 'השנה',       from: startOfYear,      to: today },
];

export default function FiltersBar({ filters, onChange, institutions, filterOptions, onExport, exporting }) {
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [searchText, setSearchText] = useState(filters.search || '');
  const didMount = useRef(false);

  // Sync local search state when filters are reset externally
  useEffect(() => {
    if (filters.search === '' && searchText !== '') setSearchText('');
  }, [filters.search]); // eslint-disable-line react-hooks/exhaustive-deps

  // Debounced search — skip firing on initial mount
  useEffect(() => {
    if (!didMount.current) { didMount.current = true; return; }
    const t = setTimeout(() => onChange({ search: searchText.trim() }), 350);
    return () => clearTimeout(t);
  }, [searchText]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (key, value) => onChange({ [key]: value });

  const applyQuickDate = (p) => onChange({ date_from: p.from(), date_to: p.to() });

  const reset = () => {
    setSearchText('');
    onChange({ mosad_number: '', transaction_type: '', group_name: '', date_from: '', date_to: '', search: '' });
  };

  const activePreset = QUICK_DATES.find(
    (p) => filters.date_from === p.from() && filters.date_to === p.to()
  );
  const hasAdvanced = !!(filters.transaction_type || filters.group_name || filters.date_from || filters.date_to);
  const hasAnyActive = hasAdvanced || !!filters.mosad_number || !!searchText;

  return (
    <div className={styles.toolbar}>

      {/* ── Primary row ── */}
      <div className={styles.primary}>

        {/* Search */}
        <div className={styles.searchWrap}>
          <svg className={styles.searchIcon} viewBox="0 0 20 20" fill="none" aria-hidden="true">
            <circle cx="9" cy="9" r="6" stroke="currentColor" strokeWidth="1.8"/>
            <path d="M14 14l3 3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
          </svg>
          <input
            className={styles.searchInput}
            type="text"
            placeholder="חיפוש לפי שם, טלפון, מייל..."
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
          />
          {searchText && (
            <button type="button" className={styles.searchClear} onClick={() => setSearchText('')} aria-label="נקה חיפוש">✕</button>
          )}
        </div>

        {/* Institution select */}
        <select
          className={styles.select}
          value={filters.mosad_number}
          onChange={(e) => set('mosad_number', e.target.value)}
        >
          <option value="">כל המוסדות</option>
          {institutions.map((i) => (
            <option key={i.mosad_number} value={i.mosad_number}>{i.mosad_name}</option>
          ))}
        </select>

        <div className={styles.divider} aria-hidden="true" />

        {/* Quick date presets */}
        <div className={styles.quickDates}>
          {QUICK_DATES.map((p) => (
            <button
              key={p.label}
              type="button"
              className={`${styles.chip} ${activePreset?.label === p.label ? styles.chipActive : ''}`}
              onClick={() => applyQuickDate(p)}
            >
              {p.label}
            </button>
          ))}
        </div>

        {/* Advanced toggle */}
        <button
          type="button"
          className={`${styles.moreBtn} ${showAdvanced ? styles.moreBtnOpen : ''} ${hasAdvanced ? styles.moreBtnHighlight : ''}`}
          onClick={() => setShowAdvanced((v) => !v)}
        >
          <svg viewBox="0 0 16 16" fill="none" className={styles.filterIcon} aria-hidden="true">
            <path d="M2 4h12M4 8h8M6 12h4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
          </svg>
          <span>מסננים{hasAdvanced ? ' ●' : ''}</span>
          <svg viewBox="0 0 12 12" fill="none" className={`${styles.chevron} ${showAdvanced ? styles.chevronUp : ''}`} aria-hidden="true">
            <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>

        {hasAnyActive && (
          <button type="button" className={styles.resetInline} onClick={reset}>נקה</button>
        )}

        {onExport && (
          <button type="button" className={styles.exportBtn} onClick={onExport} disabled={exporting}>
            {exporting ? 'מייצא...' : '⬇ ייצוא אקסל'}
          </button>
        )}
      </div>

      {/* ── Advanced row (collapsible) ── */}
      {showAdvanced && (
        <div className={styles.advanced}>
          <select
            className={styles.select}
            value={filters.transaction_type}
            onChange={(e) => set('transaction_type', e.target.value)}
          >
            <option value="">כל הסוגים</option>
            {filterOptions.transaction_types?.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>

          <select
            className={styles.select}
            value={filters.group_name}
            onChange={(e) => set('group_name', e.target.value)}
          >
            <option value="">כל הקבוצות</option>
            {filterOptions.group_names?.map((g) => <option key={g} value={g}>{g}</option>)}
          </select>

          <div className={styles.dateRange}>
            <input
              className={styles.dateInput}
              type="date"
              value={filters.date_from}
              placeholder="מתאריך"
              onChange={(e) => set('date_from', e.target.value)}
            />
            <span className={styles.dateSep}>—</span>
            <input
              className={styles.dateInput}
              type="date"
              value={filters.date_to}
              placeholder="עד תאריך"
              onChange={(e) => set('date_to', e.target.value)}
            />
            {(filters.date_from || filters.date_to) && (
              <button
                type="button"
                className={styles.dateClear}
                onClick={() => onChange({ date_from: '', date_to: '' })}
                aria-label="נקה תאריכים"
              >✕</button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
