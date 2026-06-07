import styles from './FiltersBar.module.css';

function localStr(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function todayStr() { return localStr(new Date()); }
function startOfMonth() { const d = new Date(); return localStr(new Date(d.getFullYear(), d.getMonth(), 1)); }
function startOfYear() { return localStr(new Date(new Date().getFullYear(), 0, 1)); }
function startOfLastMonth() { const d = new Date(); return localStr(new Date(d.getFullYear(), d.getMonth() - 1, 1)); }
function endOfLastMonth() { const d = new Date(); return localStr(new Date(d.getFullYear(), d.getMonth(), 0)); }

const QUICK_DATES = [
  { label: 'היום',        from: todayStr,        to: todayStr },
  { label: 'החודש',       from: startOfMonth,    to: todayStr },
  { label: 'חודש שעבר',  from: startOfLastMonth, to: endOfLastMonth },
  { label: 'השנה',        from: startOfYear,     to: todayStr },
];

export default function FiltersBar({ filters, onChange, institutions, filterOptions }) {
  function set(key, value) {
    onChange({ ...filters, [key]: value });
  }

  function applyQuickDate(preset) {
    onChange({ ...filters, date_from: preset.from(), date_to: preset.to() });
  }

  function reset() {
    onChange({ mosad_number: '', transaction_type: '', group_name: '', date_from: '', date_to: '' });
  }

  const hasActive = Object.values(filters).some((v) => v !== '');

  const activePreset = QUICK_DATES.find(
    (p) => filters.date_from === p.from() && filters.date_to === p.to()
  );

  return (
    <div className={styles.bar}>
      <div className={styles.fields}>

        <div className={styles.field}>
          <label className={styles.label}>מוסד</label>
          <select className={styles.select} value={filters.mosad_number} onChange={(e) => set('mosad_number', e.target.value)}>
            <option value="">הכל</option>
            {institutions.map((inst) => (
              <option key={inst.mosad_number} value={inst.mosad_number}>{inst.mosad_name}</option>
            ))}
          </select>
        </div>

        <div className={styles.field}>
          <label className={styles.label}>סוג עסקה</label>
          <select className={styles.select} value={filters.transaction_type} onChange={(e) => set('transaction_type', e.target.value)}>
            <option value="">הכל</option>
            {filterOptions.transaction_types?.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>

        <div className={styles.field}>
          <label className={styles.label}>קבוצה</label>
          <select className={styles.select} value={filters.group_name} onChange={(e) => set('group_name', e.target.value)}>
            <option value="">הכל</option>
            {filterOptions.group_names?.map((g) => <option key={g} value={g}>{g}</option>)}
          </select>
        </div>

        <div className={styles.dateGroup}>
          <label className={styles.label}>טווח תאריכים</label>

          <div className={styles.quickDates}>
            {QUICK_DATES.map((p) => (
              <button
                key={p.label}
                type="button"
                className={`${styles.quickBtn} ${activePreset?.label === p.label ? styles.quickBtnActive : ''}`}
                onClick={() => applyQuickDate(p)}
              >
                {p.label}
              </button>
            ))}
          </div>

          <div className={styles.dateRange}>
            <div className={styles.dateInputWrapper}>
              <span className={`${styles.datePlaceholder} ${filters.date_from ? styles.datePlaceholderHidden : ''}`}>
                מתאריך
              </span>
              <input
                className={`${styles.dateInput} ${!filters.date_from ? styles.dateInputEmpty : ''}`}
                type="date"
                value={filters.date_from}
                onChange={(e) => set('date_from', e.target.value)}
              />
            </div>
            <span className={styles.dateSep}>←</span>
            <div className={styles.dateInputWrapper}>
              <span className={`${styles.datePlaceholder} ${filters.date_to ? styles.datePlaceholderHidden : ''}`}>
                עד תאריך
              </span>
              <input
                className={`${styles.dateInput} ${!filters.date_to ? styles.dateInputEmpty : ''}`}
                type="date"
                value={filters.date_to}
                onChange={(e) => set('date_to', e.target.value)}
              />
            </div>
            {(filters.date_from || filters.date_to) && (
              <button
                type="button"
                className={styles.dateClear}
                onClick={() => onChange({ ...filters, date_from: '', date_to: '' })}
              >✕</button>
            )}
          </div>
        </div>

      </div>

      {hasActive && (
        <button className={styles.reset} onClick={reset}>נקה הכל</button>
      )}
    </div>
  );
}
