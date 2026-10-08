import { forwardRef, useEffect, useId, useRef, useState, cloneElement, isValidElement } from 'react';
import styles from './Form.module.css';
import Icon from './Icon.jsx';
import { cx } from '../../lib/cx.js';

export const formStyles = styles;

// Label + control + optional hint/error. The single child control gets an id
// (unless it already has one) so the label is properly associated with it.
export function Field({ label, hint, error, required, className, children, htmlFor }) {
  const autoId = useId();
  const child = isValidElement(children) ? children : null;
  const id = htmlFor || child?.props.id || autoId;
  const control = child && !htmlFor
    ? cloneElement(child, { id, 'aria-invalid': error ? true : child.props['aria-invalid'] })
    : children;
  return (
    <div className={cx(styles.field, className)}>
      {label && <label htmlFor={id} className={cx(styles.label, required && styles.required)}>{label}</label>}
      {control}
      {error ? <span className={styles.error}>{error}</span> : hint && <span className={styles.hint}>{hint}</span>}
    </div>
  );
}

export const Input = forwardRef(function Input({ size, className, ...rest }, ref) {
  return <input ref={ref} className={cx(styles.control, size === 'sm' && styles.sm, className)} {...rest} />;
});

export const Select = forwardRef(function Select({ size, className, children, ...rest }, ref) {
  return (
    <select ref={ref} className={cx(styles.control, styles.select, size === 'sm' && styles.sm, className)} {...rest}>
      {children}
    </select>
  );
});

export const Textarea = forwardRef(function Textarea({ className, ...rest }, ref) {
  return <textarea ref={ref} className={cx(styles.control, styles.textarea, className)} {...rest} />;
});

export function Checkbox({ label, className, ...rest }) {
  return (
    <label className={cx(styles.check, className)}>
      <input type="checkbox" {...rest} />
      {label && <span>{label}</span>}
    </label>
  );
}

// Search box with the same behavior on every screen: results update while
// typing (debounced), Enter searches immediately, ✕ / Esc clears.
// `value` is the committed query; `onSearch(text)` fires with the trimmed text.
export function SearchInput({ value = '', onSearch, placeholder = 'חיפוש...', delay = 350, size, className, autoFocus, 'aria-label': ariaLabel }) {
  const [text, setText] = useState(value);
  const onSearchRef = useRef(onSearch);
  const committed = useRef(value);
  onSearchRef.current = onSearch;

  // Parent reset the query (e.g. a "clear filters" button) — mirror it.
  useEffect(() => {
    if (value !== committed.current) {
      committed.current = value;
      setText(value);
    }
  }, [value]);

  const commit = (next) => {
    const q = next.trim();
    if (q === committed.current) return;
    committed.current = q;
    onSearchRef.current?.(q);
  };

  useEffect(() => {
    const t = setTimeout(() => commit(text), delay);
    return () => clearTimeout(t);
  }, [text, delay]); // eslint-disable-line react-hooks/exhaustive-deps

  const clear = () => { setText(''); commit(''); };

  return (
    <div className={cx(styles.search, className)}>
      <Icon name="search" size={15} className={styles.searchIcon} />
      <input
        type="search"
        className={cx(styles.control, styles.searchInput, size === 'sm' && styles.sm)}
        placeholder={placeholder}
        aria-label={ariaLabel || placeholder}
        value={text}
        autoFocus={autoFocus}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit(text);
          if (e.key === 'Escape' && text) { e.preventDefault(); clear(); }
        }}
      />
      {text && (
        <button type="button" className={styles.searchClear} onClick={clear} aria-label="נקה חיפוש" title="נקה חיפוש">
          <Icon name="x" size={14} />
        </button>
      )}
    </div>
  );
}

// Dropdown of matches under an input (wrap both in formStyles.suggestWrap).
// Options are buttons, so they're reachable with Tab; mousedown is swallowed
// so picking one doesn't blur the input first.
export function Suggestions({ items, onSelect, getKey = (it) => it.id, getTitle, getSub }) {
  if (!items?.length) return null;
  return (
    <div className={styles.suggestions} role="listbox">
      {items.map((it) => {
        const sub = getSub?.(it);
        return (
          <button
            key={getKey(it)}
            type="button"
            role="option"
            aria-selected="false"
            className={styles.suggestion}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => onSelect(it)}
          >
            <div className={styles.suggestionTitle}>{getTitle(it)}</div>
            {sub && <div className={styles.suggestionSub}>{sub}</div>}
          </button>
        );
      })}
    </div>
  );
}

// Click-or-drag file picker. onFiles receives an array of File.
export function FileDrop({ icon = 'upload', title, hint, accept, multiple = false, onFiles, disabled = false, compact = false, className }) {
  const inputRef = useRef(null);
  const [over, setOver] = useState(false);
  const take = (list) => {
    const files = [...(list || [])];
    if (files.length) onFiles(multiple ? files : files.slice(0, 1));
  };
  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        hidden
        onChange={(e) => { take(e.target.files); e.target.value = ''; }}
      />
      <button
        type="button"
        disabled={disabled}
        className={cx(styles.drop, compact && styles.dropCompact, over && styles.dropActive, className)}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); if (!disabled) setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); if (!disabled) take(e.dataTransfer.files); }}
      >
        <span className={styles.dropIcon}><Icon name={icon} size={20} /></span>
        <span className={styles.dropTitle}>{title}</span>
        {hint && <span className={styles.dropHint}>{hint}</span>}
      </button>
    </>
  );
}

// From/to date pair in one bordered control, with an inline clear button.
export function DateRange({ from, to, onChange, className, labelFrom = 'מתאריך', labelTo = 'עד תאריך' }) {
  return (
    <div className={cx(styles.dateRange, className)}>
      <input
        type="date"
        className={styles.dateInput}
        value={from || ''}
        max={to || undefined}
        aria-label={labelFrom}
        onChange={(e) => onChange({ from: e.target.value, to })}
      />
      <span className={styles.dateSep} aria-hidden="true">–</span>
      <input
        type="date"
        className={styles.dateInput}
        value={to || ''}
        min={from || undefined}
        aria-label={labelTo}
        onChange={(e) => onChange({ from, to: e.target.value })}
      />
      {(from || to) && (
        <button type="button" className={styles.dateClear} onClick={() => onChange({ from: '', to: '' })} aria-label="נקה תאריכים" title="נקה תאריכים">
          <Icon name="x" size={14} />
        </button>
      )}
    </div>
  );
}
