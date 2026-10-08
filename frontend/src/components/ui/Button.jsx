import { forwardRef } from 'react';
import styles from './Button.module.css';
import Icon from './Icon.jsx';
import { cx } from '../../lib/cx.js';

export function Spinner({ size = 16, className }) {
  return (
    <span
      className={cx(styles.spinner, className)}
      style={{ width: size, height: size }}
      role="status"
      aria-label="טוען"
    />
  );
}

// Class string for anything that should look like a button (e.g. <a> links).
export function buttonClass({ variant = 'secondary', size = 'md', block = false, className } = {}) {
  return cx(styles.btn, styles[variant], size !== 'md' && styles[size], block && styles.block, className);
}

const iconSize = (size) => (size === 'sm' ? 14 : size === 'lg' ? 18 : 16);

// variant: primary | secondary | ghost | soft | danger | dangerSoft | successSoft | link
// `loading` swaps the icon for a spinner and disables the button.
export const Button = forwardRef(function Button(
  { variant = 'secondary', size = 'md', icon, iconEnd, loading = false, block = false, className, children, type = 'button', disabled, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={buttonClass({ variant, size, block, className })}
      aria-busy={loading || undefined}
      {...rest}
      disabled={disabled || loading}
    >
      {loading ? <Spinner size={iconSize(size) - 2} /> : icon && <Icon name={icon} size={iconSize(size)} />}
      {children}
      {iconEnd && !loading && <Icon name={iconEnd} size={iconSize(size)} />}
    </button>
  );
});

// Icon-only button — `label` is required: it becomes the tooltip and the
// accessible name, since there's no visible text.
export const IconButton = forwardRef(function IconButton(
  { icon, label, variant = 'ghost', size = 'md', className, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cx(styles.btn, styles.icon, styles[variant], size !== 'md' && styles[size], className)}
      aria-label={label}
      title={label}
      {...rest}
    >
      <Icon name={icon} size={iconSize(size)} />
    </button>
  );
});
