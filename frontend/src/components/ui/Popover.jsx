import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import styles from './Popover.module.css';
import Icon from './Icon.jsx';
import { cx } from '../../lib/cx.js';

// Dropdown panel anchored to a trigger button. Rendered in a portal with
// fixed positioning, so a parent with overflow:hidden (table cards) can't
// clip it. Opens downward, or upward when there's no room below.
//
// <Popover trigger={({ ref, toggle, open }) => <Button ref={ref} onClick={toggle}>…</Button>}>
//   {({ close }) => <MenuItem onClick={() => { doIt(); close(); }}>…</MenuItem>}
// </Popover>
export function Popover({ trigger, children, maxHeight = 360, className }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState(null);
  const btnRef = useRef(null);
  const panelRef = useRef(null);

  const close = useCallback(() => setOpen(false), []);
  const toggle = useCallback(() => setOpen((o) => !o), []);

  useLayoutEffect(() => {
    if (!open || !btnRef.current) return undefined;
    const update = () => {
      const r = btnRef.current.getBoundingClientRect();
      const below = window.innerHeight - r.bottom - 8;
      const above = r.top - 8;
      const up = below < Math.min(maxHeight, 240) && above > below;
      setPos({
        right: Math.max(8, window.innerWidth - r.right),
        top: up ? undefined : r.bottom + 4,
        bottom: up ? window.innerHeight - r.top + 4 : undefined,
        maxHeight: Math.min(maxHeight, up ? above : below),
      });
    };
    update();
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
    };
  }, [open, maxHeight]);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => {
      if (btnRef.current?.contains(e.target) || panelRef.current?.contains(e.target)) return;
      setOpen(false);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') { setOpen(false); btnRef.current?.focus(); }
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <>
      {trigger({ ref: btnRef, toggle, open, 'aria-expanded': open })}
      {open && pos && createPortal(
        <div ref={panelRef} className={cx(styles.panel, className)} style={pos} role="menu">
          {typeof children === 'function' ? children({ close }) : children}
        </div>,
        document.body,
      )}
    </>
  );
}

export function MenuItem({ icon, children, count, className, ...rest }) {
  return (
    <button type="button" role="menuitem" className={cx(styles.item, className)} {...rest}>
      {icon && <Icon name={icon} size={15} />}
      <span>{children}</span>
      {count != null && <span className={styles.itemCount}>{count}</span>}
    </button>
  );
}

export function MenuCheckbox({ checked, onChange, children, count }) {
  return (
    <label className={cx(styles.item, styles.check)} role="menuitemcheckbox" aria-checked={checked}>
      <input type="checkbox" checked={checked} onChange={onChange} />
      <span>{children}</span>
      {count != null && <span className={styles.itemCount}>{count}</span>}
    </label>
  );
}

export const MenuLabel = ({ children }) => <div className={styles.label}>{children}</div>;
export const MenuDivider = () => <div className={styles.divider} role="separator" />;
export const MenuSection = ({ children, className }) => <div className={cx(styles.section, className)}>{children}</div>;
