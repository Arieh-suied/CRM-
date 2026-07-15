import { useRef, useEffect, forwardRef, useImperativeHandle } from 'react';
import styles from './RichTextEditor.module.css';

// Minimal dependency-free rich-text editor for email bodies: contentEditable
// + document.execCommand (deprecated but universally supported, and the
// inline markup it produces — <b>, <i>, <u>, <font>, <div align> — is exactly
// what email clients render reliably). Emits HTML via onChange; exposes
// insertText() so placeholder chips can drop {שם} etc. at the caret.

const COLORS = ['#222222', '#c0392b', '#1a6fb8', '#1a9c5d', '#8e44ad', '#b8860b'];

const RichTextEditor = forwardRef(function RichTextEditor({ value, onChange, disabled }, ref) {
  const editorRef = useRef(null);

  // Sync external value → editor without clobbering the caret while typing
  // (during typing the incoming value equals the editor's own innerHTML).
  useEffect(() => {
    const el = editorRef.current;
    if (el && el.innerHTML !== (value || '')) el.innerHTML = value || '';
  }, [value]);

  useImperativeHandle(ref, () => ({
    insertText(text) {
      const el = editorRef.current;
      if (!el) return;
      el.focus();
      document.execCommand('insertText', false, text);
      onChange(el.innerHTML);
    },
  }));

  function exec(command, arg = null) {
    const el = editorRef.current;
    if (!el || disabled) return;
    el.focus();
    document.execCommand(command, false, arg);
    onChange(el.innerHTML);
  }

  // mousedown+preventDefault keeps the text selection alive while clicking.
  const btn = (label, title, command, arg) => (
    <button
      type="button"
      className={styles.toolBtn}
      title={title}
      onMouseDown={(e) => { e.preventDefault(); exec(command, arg); }}
      disabled={disabled}
    >
      {label}
    </button>
  );

  return (
    <div className={styles.wrapper}>
      <div className={styles.toolbar}>
        {btn(<b>B</b>, 'מודגש', 'bold')}
        {btn(<i>I</i>, 'נטוי', 'italic')}
        {btn(<u>U</u>, 'קו תחתון', 'underline')}
        <span className={styles.sep} />
        <select
          className={styles.sizeSelect}
          title="גודל טקסט"
          defaultValue=""
          disabled={disabled}
          onMouseDown={(e) => e.stopPropagation()}
          onChange={(e) => { if (e.target.value) { exec('fontSize', e.target.value); e.target.value = ''; } }}
        >
          <option value="" disabled>גודל</option>
          <option value="2">קטן</option>
          <option value="3">רגיל</option>
          <option value="5">גדול</option>
          <option value="6">ענק</option>
        </select>
        <span className={styles.sep} />
        {COLORS.map((c) => (
          <button
            key={c}
            type="button"
            className={styles.colorBtn}
            style={{ background: c }}
            title="צבע טקסט"
            onMouseDown={(e) => { e.preventDefault(); exec('foreColor', c); }}
            disabled={disabled}
          />
        ))}
        <span className={styles.sep} />
        {btn('⟸', 'יישור לימין', 'justifyRight')}
        {btn('☰', 'מרכוז', 'justifyCenter')}
        {btn('⟹', 'יישור לשמאל', 'justifyLeft')}
        <span className={styles.sep} />
        {btn('•', 'רשימת נקודות', 'insertUnorderedList')}
        {btn('1.', 'רשימה ממוספרת', 'insertOrderedList')}
        <span className={styles.sep} />
        {btn('🧹', 'ניקוי עיצוב', 'removeFormat')}
      </div>
      <div
        ref={editorRef}
        className={styles.editor}
        contentEditable={!disabled}
        dir="rtl"
        onInput={() => onChange(editorRef.current.innerHTML)}
        suppressContentEditableWarning
      />
    </div>
  );
});

export default RichTextEditor;
