// Join truthy class names: cx('a', cond && 'b', undefined) → 'a b'
export const cx = (...names) => names.filter(Boolean).join(' ');
