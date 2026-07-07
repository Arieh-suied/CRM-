// Shared sortable table header — the same header used across all the data
// tabs (Stripe, bank transfers, Grow, standing orders, refusals…).
// `sort` is { col, dir }; clicking calls onSort(col).
export default function SortTh({ label, col, sort, onSort, className }) {
  const active = sort.col === col;
  return (
    <th
      className={className}
      onClick={() => onSort(col)}
      style={{ cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }}
    >
      {label}
      <span style={{ marginRight: 4, opacity: active ? 1 : 0.35, fontSize: 10 }}>
        {active ? (sort.dir === 'asc' ? '▲' : '▼') : '⇅'}
      </span>
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
