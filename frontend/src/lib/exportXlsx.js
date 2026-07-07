// Client-side Excel export. xlsx is imported dynamically so it stays out of
// the main bundle (same pattern as the Receipts tab).
export async function exportXlsx(rows, filename, sheetName = 'נתונים') {
  const XLSX = await import('xlsx');
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  ws['!cols'] = Object.keys(rows[0] ?? {}).map(() => ({ wch: 18 }));
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  XLSX.writeFile(wb, filename);
}

export const dateStamp = () => new Date().toISOString().slice(0, 10);

// Parses a cell that looks like an Israeli date — "dd/mm/yyyy" (optionally
// with time) or ISO "yyyy-mm-dd". Returns null when the cell isn't a date.
function parseCellDate(v) {
  const s = String(v ?? '').trim();
  let m = s.match(/^(\d{1,2})[/.](\d{1,2})[/.](\d{2,4})/);
  if (m) {
    let y = Number(m[3]);
    if (y < 100) y += 2000;
    const dt = new Date(y, Number(m[2]) - 1, Number(m[1]));
    return isNaN(dt) ? null : dt;
  }
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) {
    const dt = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    return isNaN(dt) ? null : dt;
  }
  return null;
}

// Filters CSV rows (array-of-arrays, first row = header) to a date range.
// The CSV comes from an external system whose columns we don't control, so
// the date column is detected: the column where the most cells parse as
// dates wins. Returns null when no date column exists at all.
export function filterRowsByDateRange(rows, fromStr, toStr) {
  const [header, ...body] = rows;
  if (!body.length) return rows;
  const width = Math.max(...body.map((r) => r.length));
  let best = -1, bestCount = 0;
  for (let c = 0; c < width; c++) {
    const count = body.reduce((n, r) => n + (parseCellDate(r[c]) ? 1 : 0), 0);
    if (count > bestCount) { bestCount = count; best = c; }
  }
  if (best === -1) return null;
  // Parse the yyyy-mm-dd bounds as *local* dates — new Date('yyyy-mm-dd')
  // would read them as UTC midnight and shift the range in Israel time.
  const localDate = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  const fromMs = fromStr ? localDate(fromStr).getTime() : -Infinity;
  const toMs = toStr ? localDate(toStr).setHours(23, 59, 59, 999) : Infinity;
  const filtered = body.filter((r) => {
    const d = parseCellDate(r[best]);
    return d && d.getTime() >= fromMs && d.getTime() <= toMs;
  });
  return [header, ...filtered];
}

// Export rows that are already array-of-arrays (e.g. a parsed CSV).
export async function exportAoaXlsx(aoa, filename, sheetName = 'נתונים') {
  const XLSX = await import('xlsx');
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = (aoa[0] ?? []).map(() => ({ wch: 18 }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  XLSX.writeFile(wb, filename);
}
