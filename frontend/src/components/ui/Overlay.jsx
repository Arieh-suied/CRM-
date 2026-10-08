import { createContext, useCallback, useContext, useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import styles from './Overlay.module.css';
import Icon from './Icon.jsx';
import { Button, IconButton } from './Button.jsx';
import { Field, Input } from './Form.jsx';
import { cx } from '../../lib/cx.js';

/* ── Modal ──────────────────────────────────────────────────────────────── */

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), iframe, [tabindex]:not([tabindex="-1"])';
const INITIAL_FOCUS = 'input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), button:not([disabled]), a[href]';

// Open modals, top-most last — only the top one reacts to Esc, and the page
// stays scroll-locked until the last one closes.
const modalStack = [];

// Accessible dialog: Esc / overlay click close it, Tab stays inside, focus
// returns to whatever opened it. size: sm | md | lg | xl | full
export function Modal({
  title, subtitle, onClose, size = 'md', footer, headerActions, children,
  closeOnOverlay = true, initialFocusRef, flushBody = false, className, bodyClassName,
  'aria-label': ariaLabel,
}) {
  const panelRef = useRef(null);
  const bodyRef = useRef(null);
  const pressStartedOnOverlay = useRef(false);
  const onCloseRef = useRef(onClose);
  const titleId = useId();
  onCloseRef.current = onClose;

  useEffect(() => {
    const token = {};
    modalStack.push(token);
    const opener = document.activeElement;
    if (modalStack.length === 1) document.body.style.overflow = 'hidden';

    // On touch screens focusing a field would pop the keyboard over the
    // dialog, so there only an explicit autofocus target gets focus.
    const touch = window.matchMedia?.('(pointer: coarse)').matches;
    const target = initialFocusRef?.current
      || panelRef.current?.querySelector('[data-autofocus]')
      || (!touch && bodyRef.current?.querySelector(INITIAL_FOCUS))
      || panelRef.current;
    target?.focus({ preventScroll: true });

    const onKey = (e) => {
      if (modalStack[modalStack.length - 1] !== token) return;
      if (e.key === 'Escape' && onCloseRef.current) {
        e.stopPropagation();
        onCloseRef.current();
      }
      if (e.key === 'Tab' && panelRef.current) {
        const items = [...panelRef.current.querySelectorAll(FOCUSABLE)].filter((el) => el.offsetParent !== null);
        if (!items.length) return;
        const first = items[0], last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', onKey);

    return () => {
      document.removeEventListener('keydown', onKey);
      modalStack.splice(modalStack.indexOf(token), 1);
      if (!modalStack.length) document.body.style.overflow = '';
      if (opener && document.contains(opener)) opener.focus?.({ preventScroll: true });
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return createPortal(
    <div
      className={styles.overlay}
      onMouseDown={(e) => { pressStartedOnOverlay.current = e.target === e.currentTarget; }}
      onClick={(e) => {
        if (closeOnOverlay && onClose && pressStartedOnOverlay.current && e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        className={cx(styles.panel, styles[size], className)}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        aria-label={title ? undefined : ariaLabel}
        tabIndex={-1}
      >
        {(title || onClose || headerActions) && (
          <div className={styles.header}>
            <div className={styles.titleWrap}>
              {title && <h2 id={titleId} className={styles.title}>{title}</h2>}
              {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
            </div>
            <div className={styles.headerActions}>
              {headerActions}
              {onClose && <IconButton icon="x" label="סגור" onClick={onClose} />}
            </div>
          </div>
        )}
        <div ref={bodyRef} className={cx(styles.body, flushBody && styles.bodyFlush, bodyClassName)}>{children}</div>
        {footer && <div className={styles.footer}>{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

/* ── Toasts ─────────────────────────────────────────────────────────────── */

const ToastContext = createContext(null);
const TOAST_ICON = { success: 'checkCircle', danger: 'alertCircle', warning: 'alertTriangle', info: 'info' };

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const nextId = useRef(0);

  const dismiss = useCallback((id) => setToasts((list) => list.filter((t) => t.id !== id)), []);

  const show = useCallback((tone, message, { title, duration } = {}) => {
    const id = ++nextId.current;
    setToasts((list) => [...list.slice(-3), { id, tone, message, title }]);
    const ms = duration ?? (tone === 'danger' ? 8000 : 4500);
    if (ms) setTimeout(() => dismiss(id), ms);
    return id;
  }, [dismiss]);

  const api = useMemo(() => ({
    success: (m, o) => show('success', m, o),
    error:   (m, o) => show('danger', m, o),
    warning: (m, o) => show('warning', m, o),
    info:    (m, o) => show('info', m, o),
    dismiss,
  }), [show, dismiss]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      {createPortal(
        <div className={styles.toasts} aria-live="polite">
          {toasts.map((t) => (
            <div key={t.id} className={cx(styles.toast, styles[t.tone])} role={t.tone === 'danger' ? 'alert' : 'status'}>
              <Icon name={TOAST_ICON[t.tone]} size={18} className={styles.toastIcon} />
              <div className={styles.toastBody}>
                {t.title && <div className={styles.toastTitle}>{t.title}</div>}
                {t.message}
              </div>
              <button type="button" className={styles.toastClose} onClick={() => dismiss(t.id)} aria-label="סגור הודעה">
                <Icon name="x" size={14} />
              </button>
            </div>
          ))}
        </div>,
        document.body,
      )}
    </ToastContext.Provider>
  );
}

const fallbackToast = {
  success: () => {}, info: () => {}, warning: (m) => window.alert(m), error: (m) => window.alert(m), dismiss: () => {},
};

// toast.success('נשמר') / toast.error(err.message) — replaces window.alert.
export function useToast() {
  return useContext(ToastContext) ?? fallbackToast;
}

/* ── Confirm / prompt dialogs ───────────────────────────────────────────── */

const DialogContext = createContext(null);

function ConfirmDialog({ opts, onDone }) {
  const danger = opts.tone === 'danger';
  return (
    <Modal
      size="sm"
      title={opts.title || 'אישור פעולה'}
      onClose={() => onDone(false)}
      footer={(
        <>
          <Button onClick={() => onDone(false)} data-autofocus={danger || undefined}>{opts.cancelText || 'ביטול'}</Button>
          <Button variant={danger ? 'danger' : 'primary'} onClick={() => onDone(true)} data-autofocus={!danger || undefined}>
            {opts.confirmText || 'אישור'}
          </Button>
        </>
      )}
    >
      <p className={styles.message}>{opts.message}</p>
    </Modal>
  );
}

function PromptDialog({ opts, onDone }) {
  const [value, setValue] = useState(opts.defaultValue ?? '');
  const formId = useId();
  const canSubmit = !opts.required || value.trim().length > 0;
  return (
    <Modal
      size="sm"
      title={opts.title || 'הזנת ערך'}
      onClose={() => onDone(null)}
      footer={(
        <>
          <Button onClick={() => onDone(null)}>{opts.cancelText || 'ביטול'}</Button>
          <Button type="submit" form={formId} variant="primary" disabled={!canSubmit}>{opts.confirmText || 'אישור'}</Button>
        </>
      )}
    >
      <form id={formId} onSubmit={(e) => { e.preventDefault(); if (canSubmit) onDone(value); }}>
        {opts.message && <p className={styles.message}>{opts.message}</p>}
        <Field label={opts.label} hint={opts.hint}>
          <Input
            type={opts.inputType || 'text'}
            value={value}
            placeholder={opts.placeholder}
            onChange={(e) => setValue(e.target.value)}
            autoComplete={opts.inputType === 'password' ? 'new-password' : 'off'}
            data-autofocus
          />
        </Field>
      </form>
    </Modal>
  );
}

const cancelValue = (kind) => (kind === 'confirm' ? false : null);

export function DialogProvider({ children }) {
  const [dialog, setDialog] = useState(null); // { kind, opts, resolve }
  const current = useRef(null);

  const open = useCallback((kind, opts) => new Promise((resolve) => {
    // A new request while one is still open cancels the pending one.
    if (current.current) current.current.resolve(cancelValue(current.current.kind));
    const next = { kind, opts: typeof opts === 'string' ? { message: opts } : (opts || {}), resolve };
    current.current = next;
    setDialog(next);
  }), []);

  const api = useMemo(() => ({
    confirm: (opts) => open('confirm', opts),
    prompt:  (opts) => open('prompt', opts),
  }), [open]);

  const done = (value) => {
    current.current?.resolve(value);
    current.current = null;
    setDialog(null);
  };

  return (
    <DialogContext.Provider value={api}>
      {children}
      {dialog?.kind === 'confirm' && <ConfirmDialog opts={dialog.opts} onDone={done} />}
      {dialog?.kind === 'prompt' && <PromptDialog opts={dialog.opts} onDone={done} />}
    </DialogContext.Provider>
  );
}

// const confirm = useConfirm(); if (!(await confirm({ title, message, tone: 'danger' }))) return;
export function useConfirm() {
  const ctx = useContext(DialogContext);
  return ctx?.confirm ?? ((o) => Promise.resolve(window.confirm(typeof o === 'string' ? o : o.message)));
}

// const prompt = usePrompt(); const value = await prompt({ title, label, inputType }); // null = cancelled
export function usePrompt() {
  const ctx = useContext(DialogContext);
  return ctx?.prompt ?? ((o) => Promise.resolve(window.prompt(o.message || o.label || '', o.defaultValue ?? '')));
}
