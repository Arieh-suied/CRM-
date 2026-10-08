import { useState } from 'react';
import { toInputDate, formatNumber } from '../../lib/format.js';
import {
  Toolbar, ToolbarSpacer, ToolbarMeta, SearchInput, Select, DateRange, ChipGroup, Button, toolbarSearchClass,
} from '../ui';

const today = () => toInputDate(new Date());
const startOfMonth = () => { const d = new Date(); return toInputDate(new Date(d.getFullYear(), d.getMonth(), 1)); };
const startOfYear = () => toInputDate(new Date(new Date().getFullYear(), 0, 1));
const startOfLastMonth = () => { const d = new Date(); return toInputDate(new Date(d.getFullYear(), d.getMonth() - 1, 1)); };
const endOfLastMonth = () => { const d = new Date(); return toInputDate(new Date(d.getFullYear(), d.getMonth(), 0)); };

const QUICK_DATES = [
  { value: 'today',     label: 'היום',      from: today,            to: today },
  { value: 'month',     label: 'החודש',     from: startOfMonth,     to: today },
  { value: 'lastMonth', label: 'חודש שעבר', from: startOfLastMonth, to: endOfLastMonth },
  { value: 'year',      label: 'השנה',      from: startOfYear,      to: today },
];

const NO_FILTERS = { mosad_number: '', transaction_type: '', group_name: '', date_from: '', date_to: '', search: '' };

// Filter rows for the עסקאות screen — rendered at the top of the table card.
export default function FiltersBar({ filters, onChange, institutions, filterOptions, onExport, exporting, total }) {
  const advancedCount = [filters.transaction_type, filters.group_name, filters.date_from || filters.date_to].filter(Boolean).length;
  const [showAdvanced, setShowAdvanced] = useState(advancedCount > 0);

  const set = (key, value) => onChange({ [key]: value });

  const activePreset = QUICK_DATES.find((p) => filters.date_from === p.from() && filters.date_to === p.to());
  const applyPreset = (value) => {
    const p = QUICK_DATES.find((q) => q.value === value);
    onChange(p ? { date_from: p.from(), date_to: p.to() } : { date_from: '', date_to: '' });
  };

  const hasAnyActive = advancedCount > 0 || !!filters.mosad_number || !!filters.search;

  return (
    <>
      <Toolbar>
        <SearchInput
          className={toolbarSearchClass}
          value={filters.search}
          onSearch={(q) => set('search', q)}
          placeholder="חיפוש לפי שם, טלפון, מייל…"
        />
        <Select value={filters.mosad_number} onChange={(e) => set('mosad_number', e.target.value)} aria-label="מוסד">
          <option value="">כל המוסדות</option>
          {institutions.map((i) => (
            <option key={i.mosad_number} value={i.mosad_number}>{i.mosad_name}</option>
          ))}
        </Select>
        <ChipGroup aria-label="טווח תאריכים מהיר" options={QUICK_DATES} value={activePreset?.value ?? null} onChange={applyPreset} />
        <Button
          variant={advancedCount ? 'soft' : 'secondary'}
          icon="filter"
          iconEnd={showAdvanced ? 'chevronUp' : 'chevronDown'}
          aria-expanded={showAdvanced}
          onClick={() => setShowAdvanced((v) => !v)}
        >
          מסננים נוספים{advancedCount ? ` (${advancedCount})` : ''}
        </Button>
        {hasAnyActive && (
          <Button variant="ghost" icon="x" onClick={() => onChange(NO_FILTERS)}>ניקוי</Button>
        )}
        <ToolbarSpacer />
        {total != null && <ToolbarMeta>{formatNumber(total)} עסקאות</ToolbarMeta>}
        {onExport && <Button icon="download" onClick={onExport} loading={exporting} disabled={!total}>ייצוא לאקסל</Button>}
      </Toolbar>

      {showAdvanced && (
        <Toolbar>
          <Select value={filters.transaction_type} onChange={(e) => set('transaction_type', e.target.value)} aria-label="סוג עסקה">
            <option value="">כל סוגי העסקאות</option>
            {filterOptions.transaction_types?.map((t) => <option key={t} value={t}>{t}</option>)}
          </Select>
          <Select value={filters.group_name} onChange={(e) => set('group_name', e.target.value)} aria-label="קבוצה">
            <option value="">כל הקבוצות</option>
            {filterOptions.group_names?.map((g) => <option key={g} value={g}>{g}</option>)}
          </Select>
          <DateRange
            from={filters.date_from}
            to={filters.date_to}
            onChange={({ from, to }) => onChange({ date_from: from, date_to: to })}
          />
        </Toolbar>
      )}
    </>
  );
}
