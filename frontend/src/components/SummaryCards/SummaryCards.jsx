import { useState, useRef, useEffect } from 'react';
import styles from './SummaryCards.module.css';
import { FEATURED_INSTITUTION_NAMES } from '../../config/featuredInstitutions.js';

const fmt = (n) =>
  new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS', maximumFractionDigits: 0 }).format(n);

function Dropdown({ options, value, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const selected = options.find((o) => o.value === value) || options[0];

  return (
    <div className={styles.dropdown} ref={ref}>
      <button
        type="button"
        className={`${styles.dropdownTrigger} ${open ? styles.dropdownTriggerOpen : ''}`}
        onClick={() => setOpen((v) => !v)}
      >
        <span>{selected.label}</span>
        <svg className={`${styles.chevron} ${open ? styles.chevronOpen : ''}`} viewBox="0 0 12 12" fill="none">
          <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>

      {open && (
        <div className={styles.dropdownMenu}>
          {options.map((opt) => (
            <button
              key={opt.value}
              type="button"
              className={`${styles.dropdownItem} ${opt.value === value ? styles.dropdownItemActive : ''}`}
              onClick={() => { onChange(opt.value); setOpen(false); }}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function SummaryCards({ summary, institutions, loading, selectedMosad, onSelectMosad }) {
  if (loading) {
    return (
      <div className={styles.wrapper}>
        <div className={styles.grid}>
          {[1, 2, 3, 4, 5, 6, 7].map((i) => (
            <div key={i} className={`${styles.card} ${styles.skeleton}`} />
          ))}
        </div>
      </div>
    );
  }

  const totalMap = Object.fromEntries(
    summary.institutionBreakdown.map(({ mosad_number, total }) => [mosad_number, total])
  );

  const featured = institutions
    .filter((inst) => FEATURED_INSTITUTION_NAMES.has(inst.mosad_name))
    .map((inst) => ({ mosad_number: inst.mosad_number, name: inst.mosad_name, total: totalMap[inst.mosad_number] ?? 0 }))
    .sort((a, b) => b.total - a.total);

  if (!institutions.length) return null;

  const dropdownOptions = [
    { value: '', label: 'בחירת מוסד' },
    ...featured.map((f) => ({ value: f.mosad_number, label: f.name })),
  ];

  return (
    <div className={styles.wrapper}>
      <div className={styles.header}>
        <span className={styles.headerTitle}>סה"כ חודשי עבור כל מוסד</span>
        <Dropdown options={dropdownOptions} value={selectedMosad} onChange={onSelectMosad} />
      </div>

      <div className={styles.grid}>
        {featured.map(({ mosad_number, name, total }) => (
          <div
            key={mosad_number}
            className={`${styles.card} ${selectedMosad === mosad_number ? styles.cardActive : ''}`}
          >
            <span className={styles.name}>{name}</span>
            <span className={styles.amount}>{fmt(total)}</span>
          </div>
        ))}
      </div>

      {selectedMosad && (() => {
        const inst = featured.find((f) => f.mosad_number === selectedMosad);
        if (!inst) return null;
        return (
          <div className={styles.mobileSelected}>
            <span className={styles.name}>{inst.name}</span>
            <span className={styles.amount}>{fmt(inst.total)}</span>
          </div>
        );
      })()}
    </div>
  );
}
