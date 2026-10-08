import { useState } from 'react';
import QuickReceipt from './QuickReceipt.jsx';
import BatchReceipts from './BatchReceipts.jsx';
import ExternalTransfers from './ExternalTransfers.jsx';
import { Stack, SegmentedControl } from '../ui';

// The annual donor report used to be a fourth view here too; it has its own
// sidebar entry (דוח קבלות שנתי), so it's no longer duplicated.
const VIEWS = [
  { value: 'quick',    label: 'קבלה מהירה', icon: 'receipt' },
  { value: 'batch',    label: 'העלאת העברות', icon: 'upload' },
  { value: 'external', label: 'העברות מהדף החיצוני', icon: 'inbox' },
];

export default function Receipts() {
  const [view, setView] = useState('quick');

  return (
    <Stack>
      <div>
        <SegmentedControl options={VIEWS} value={view} onChange={setView} aria-label="אופן הפקת הקבלה" />
      </div>
      {view === 'quick' && <QuickReceipt />}
      {view === 'batch' && <BatchReceipts />}
      {view === 'external' && <ExternalTransfers />}
    </Stack>
  );
}
