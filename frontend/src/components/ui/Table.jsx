import styles from './Table.module.css';
import Icon from './Icon.jsx';
import { Button } from './Button.jsx';
import { StateMessage } from './Layout.jsx';
import { cx } from '../../lib/cx.js';

export const tableStyles = styles;

// Horizontal-scroll container + table. `stackOnMobile` turns each row into a
// label/value card under 640px — give every <td> a data-label for that.
// `busy` dims the current rows while the next page / filter result loads.
export function Table({ stackOnMobile = false, busy = false, className, children }) {
  return (
    <div className={styles.wrap}>
      <table className={cx(styles.table, stackOnMobile && styles.stack, busy && styles.busy, className)} aria-busy={busy || undefined}>
        {children}
      </table>
    </div>
  );
}

// Sortable column header. `sort` is { col, dir }; clicking calls onSort(col).
export function SortTh({ label, col, sort, onSort, className }) {
  const active = sort.col === col;
  const ariaSort = active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none';
  return (
    <th className={className} aria-sort={ariaSort}>
      <button type="button" className={styles.sortBtn} onClick={() => onSort(col)}>
        {label}
        <Icon
          name={active ? (sort.dir === 'asc' ? 'arrowUp' : 'arrowDown') : 'chevronsUpDown'}
          size={12}
          strokeWidth={2.2}
          className={active ? styles.sortIconActive : styles.sortIcon}
        />
      </button>
    </th>
  );
}

// Client-side sort for fully-loaded tables: numeric when both values parse
// as numbers, Hebrew-aware string compare otherwise.
export function sortRows(rows, col, dir) {
  if (!col) return rows;
  return [...rows].sort((a, b) => {
    const av = a[col] ?? '', bv = b[col] ?? '';
    const an = parseFloat(av), bn = parseFloat(bv);
    const cmp = (!isNaN(an) && !isNaN(bn)) ? an - bn : String(av).localeCompare(String(bv), 'he');
    return dir === 'asc' ? cmp : -cmp;
  });
}

// Next sort state when a header is clicked: same column flips, a new column
// starts at `firstDir`.
export const toggleSort = (prev, col, firstDir = 'asc') =>
  prev.col === col ? { col, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { col, dir: firstDir };

// Loading / empty / error spanning the whole table body.
export function TableMessage({ colSpan, ...stateProps }) {
  return (
    <tr className={styles.messageRow}>
      <td colSpan={colSpan}><StateMessage compact {...stateProps} /></td>
    </tr>
  );
}

// Props for a clickable <tr>: pointer + keyboard (Tab, then Enter / Space).
export function rowActivation(onActivate, className) {
  return {
    className: cx(styles.clickable, className),
    tabIndex: 0,
    onClick: onActivate,
    onKeyDown: (e) => {
      if (e.target !== e.currentTarget) return;
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onActivate(); }
    },
  };
}

// "עמוד 2 מתוך 25 · 1,243 עסקאות" + previous/next. In RTL "previous" sits on
// the right with a right-pointing chevron.
export function Pagination({ page, totalPages, total, onPageChange, itemLabel = 'רשומות', disabled = false }) {
  const fmt = (n) => Number(n || 0).toLocaleString('he-IL');
  return (
    <div className={styles.pagination}>
      <span className={styles.paginationInfo}>
        עמוד <strong>{fmt(page)}</strong> מתוך <strong>{fmt(Math.max(totalPages, 1))}</strong>
        {total != null && <> · {fmt(total)} {itemLabel}</>}
      </span>
      <div className={styles.paginationButtons}>
        <Button size="sm" icon="chevronRight" disabled={disabled || page <= 1} onClick={() => onPageChange(page - 1)}>הקודם</Button>
        <Button size="sm" iconEnd="chevronLeft" disabled={disabled || page >= totalPages} onClick={() => onPageChange(page + 1)}>הבא</Button>
      </div>
    </div>
  );
}
