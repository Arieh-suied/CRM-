import styles from './Layout.module.css';
import Icon from './Icon.jsx';
import { Spinner } from './Button.jsx';
import { cx } from '../../lib/cx.js';

export const layoutStyles = styles;

export function Card({ as: Tag = 'div', padded = false, clip = false, className, children, ...rest }) {
  return (
    <Tag className={cx(styles.card, padded && styles.padded, clip && styles.clip, className)} {...rest}>
      {children}
    </Tag>
  );
}

export function CardHeader({ title, subtitle, actions, className, children }) {
  return (
    <div className={cx(styles.cardHeader, className)}>
      <div>
        {title && <h3 className={styles.cardTitle}>{title}</h3>}
        {subtitle && <p className={styles.cardSubtitle}>{subtitle}</p>}
        {children}
      </div>
      {actions && <div className={styles.cardActions}>{actions}</div>}
    </div>
  );
}

// Vertical rhythm between the blocks of a screen.
export function Stack({ className, children, gap }) {
  return <div className={cx(styles.stack, className)} style={gap ? { gap } : undefined}>{children}</div>;
}

// Row of filters/actions. `standalone` renders it as its own card; otherwise
// it sits at the top of a Card with a divider underneath.
export function Toolbar({ standalone = false, className, children }) {
  return <div className={cx(styles.toolbar, standalone && styles.toolbarStandalone, className)}>{children}</div>;
}

export const ToolbarSpacer = () => <div className={styles.spacer} />;
export const ToolbarDivider = () => <div className={styles.toolbarDivider} aria-hidden="true" />;
export const ToolbarMeta = ({ children }) => <span className={styles.toolbarMeta}>{children}</span>;
export const toolbarSearchClass = styles.toolbarSearch;

// In-page view switcher. options: [{ value, label, count? }]
export function SegmentedControl({ options, value, onChange, className, 'aria-label': ariaLabel }) {
  return (
    <div className={cx(styles.segmented, className)} role="tablist" aria-label={ariaLabel}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="tab"
          aria-selected={value === o.value}
          className={cx(styles.segment, value === o.value && styles.segmentActive)}
          onClick={() => onChange(o.value)}
        >
          {o.icon && <Icon name={o.icon} size={15} />}
          {o.label}
          {o.count != null && <span className={styles.segmentCount}>{o.count.toLocaleString('he-IL')}</span>}
        </button>
      ))}
    </div>
  );
}

// Optional single-choice filter chips (e.g. quick date ranges): same look as
// the segmented control, but nothing has to be selected — clicking the active
// chip clears it (onChange(null)).
export function ChipGroup({ options, value, onChange, className, 'aria-label': ariaLabel }) {
  return (
    <div className={cx(styles.segmented, className)} role="group" aria-label={ariaLabel}>
      {options.map((o) => {
        const active = value === o.value;
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={active}
            className={cx(styles.segment, active && styles.segmentActive)}
            onClick={() => onChange(active ? null : o.value)}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

// tone: neutral | primary | success | warning | danger
export function Badge({ tone = 'neutral', dot = false, className, children, title }) {
  return (
    <span className={cx(styles.badge, styles[tone], className)} title={title}>
      {dot && <span className={styles.badgeDot} aria-hidden="true" />}
      {children}
    </span>
  );
}

const ALERT_ICON = { info: 'info', success: 'checkCircle', warning: 'alertTriangle', danger: 'alertCircle' };

export function Alert({ tone = 'info', title, children, onClose, className }) {
  return (
    <div className={cx(styles.alert, styles[tone], className)} role={tone === 'danger' ? 'alert' : 'status'}>
      <Icon name={ALERT_ICON[tone]} size={17} className={styles.alertIcon} />
      <div className={styles.alertBody}>
        {title && <div className={styles.alertTitle}>{title}</div>}
        {children}
      </div>
      {onClose && (
        <button type="button" className={styles.alertClose} onClick={onClose} aria-label="סגור" title="סגור">
          <Icon name="x" size={14} />
        </button>
      )}
    </div>
  );
}

const STATE_DEFAULTS = {
  loading: { title: 'טוען…' },
  empty:   { title: 'אין נתונים להצגה', icon: 'inbox' },
  error:   { title: 'משהו השתבש', icon: 'alertCircle' },
  info:    { icon: 'info' },
};

// Loading / empty / error placeholder, used both as a whole-panel state and
// inside a table row (TableMessage).
export function StateMessage({ kind = 'empty', title, description, action, icon, compact = false, className }) {
  const d = STATE_DEFAULTS[kind] ?? {};
  return (
    <div className={cx(styles.state, compact && styles.stateCompact, className)} role={kind === 'error' ? 'alert' : undefined}>
      {kind === 'loading' ? (
        <Spinner size={22} className={styles.stateSpinner} />
      ) : (
        <div className={cx(styles.stateIcon, kind === 'error' && styles.stateIconError)}>
          <Icon name={icon || d.icon} size={20} />
        </div>
      )}
      {(title ?? d.title) && <div className={styles.stateTitle}>{title ?? d.title}</div>}
      {description && <div className={styles.stateDescription}>{description}</div>}
      {action && <div className={styles.stateAction}>{action}</div>}
    </div>
  );
}

export function StatGrid({ children, className }) {
  return <div className={cx(styles.statGrid, className)}>{children}</div>;
}

// tone colors the value: success | danger | warning | primary
export function Stat({ label, value, hint, tone }) {
  return (
    <div className={styles.stat}>
      <div className={styles.statLabel}>{label}</div>
      <div className={cx(styles.statValue, tone && styles[tone])}>{value}</div>
      {hint && <div className={styles.statHint}>{hint}</div>}
    </div>
  );
}

// Label/value pairs for detail views; empty values are skipped.
// items: [[label, value], …]
export function InfoGrid({ items, className }) {
  const shown = items.filter(([, v]) => v !== null && v !== undefined && v !== '');
  return (
    <dl className={cx(styles.info, className)}>
      {shown.map(([label, value]) => (
        <div key={label} className={styles.infoItem}>
          <dt className={styles.infoLabel}>{label}</dt>
          <dd className={styles.infoValue}>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function SectionTitle({ children, className }) {
  return <h3 className={cx(styles.sectionTitle, className)}>{children}</h3>;
}
