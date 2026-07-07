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
