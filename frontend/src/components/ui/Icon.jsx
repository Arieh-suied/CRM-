// Single stroke-icon set for the whole app (24×24 grid, 1.8px stroke), so
// buttons and menus stop mixing emoji, unicode arrows and one-off SVGs.
const PATHS = {
  search:        <><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></>,
  x:             <path d="M18 6 6 18M6 6l12 12" />,
  plus:          <path d="M12 5v14M5 12h14" />,
  check:         <path d="m5 12.5 4.5 4.5L19 7.5" />,
  download:      <><path d="M12 4v11" /><path d="m7 10 5 5 5-5" /><path d="M5 20h14" /></>,
  upload:        <><path d="M12 16V5" /><path d="m7 10 5-5 5 5" /><path d="M5 20h14" /></>,
  refresh:       <><path d="M20 11a8 8 0 0 0-14.3-4.9L4 8" /><path d="M4 4v4h4" /><path d="M4 13a8 8 0 0 0 14.3 4.9L20 16" /><path d="M20 20v-4h-4" /></>,
  chevronDown:   <path d="m6 9 6 6 6-6" />,
  chevronUp:     <path d="m18 15-6-6-6 6" />,
  chevronLeft:   <path d="m15 18-6-6 6-6" />,
  chevronRight:  <path d="m9 18 6-6-6-6" />,
  chevronsUpDown: <><path d="m7 15 5 5 5-5" /><path d="m7 9 5-5 5 5" /></>,
  arrowUp:       <><path d="M12 19V5" /><path d="m5 12 7-7 7 7" /></>,
  arrowDown:     <><path d="M12 5v14" /><path d="m19 12-7 7-7-7" /></>,
  menu:          <path d="M4 6h16M4 12h16M4 18h16" />,
  logout:        <><path d="M15 21h4a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2h-4" /><path d="m8 17-5-5 5-5" /><path d="M3 12h12" /></>,
  mail:          <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3.5 7 8.5 6 8.5-6" /></>,
  receipt:       <><path d="M5 3v18l2.3-1.5L9.7 21l2.3-1.5 2.3 1.5 2.4-1.5L19 21V3z" /><path d="M9 8h6M9 12h6M9 16h3" /></>,
  fileText:      <><path d="M14 3H6.5A1.5 1.5 0 0 0 5 4.5v15A1.5 1.5 0 0 0 6.5 21h11a1.5 1.5 0 0 0 1.5-1.5V8z" /><path d="M14 3v5h5" /><path d="M9 13h6M9 17h6" /></>,
  sheet:         <><rect x="4" y="3" width="16" height="18" rx="2" /><path d="M4 9h16M4 15h16M10 3v18" /></>,
  image:         <><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="9" cy="10" r="2" /><path d="m21 16-5-5L5 20" /></>,
  trash:         <><path d="M4 7h16" /><path d="M10 11v6M14 11v6" /><path d="m6 7 1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13" /><path d="M9 7V4h6v3" /></>,
  edit:          <><path d="M4 20h4L19 9l-4-4L4 16z" /><path d="m13.5 6.5 4 4" /></>,
  externalLink:  <><path d="M14 4h6v6" /><path d="M20 4 10 14" /><path d="M19 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5" /></>,
  checkCircle:   <><circle cx="12" cy="12" r="9" /><path d="m8 12.5 2.8 2.8L16 9.5" /></>,
  alertCircle:   <><circle cx="12" cy="12" r="9" /><path d="M12 7.5v5.5" /><path d="M12 16.5h.01" /></>,
  alertTriangle: <><path d="M10.3 4.3 2.6 17.6A2 2 0 0 0 4.3 20.6h15.4a2 2 0 0 0 1.7-3L13.7 4.3a2 2 0 0 0-3.4 0z" /><path d="M12 9.5v4" /><path d="M12 17h.01" /></>,
  info:          <><circle cx="12" cy="12" r="9" /><path d="M12 11v5.5" /><path d="M12 7.5h.01" /></>,
  xCircle:       <><circle cx="12" cy="12" r="9" /><path d="m15 9-6 6M9 9l6 6" /></>,
  filter:        <path d="M4 5h16l-6.2 7.6V19l-3.6 1.6v-8z" />,
  calendar:      <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></>,
  list:          <><path d="M9 6h11M9 12h11M9 18h11" /><path d="M4.5 6h.01M4.5 12h.01M4.5 18h.01" /></>,
  creditCard:    <><rect x="2.5" y="5" width="19" height="14" rx="2" /><path d="M2.5 10h19" /><path d="M6 15h4" /></>,
  landmark:      <><path d="M3 10 12 4l9 6" /><path d="M5 10v8M9.7 10v8M14.3 10v8M19 10v8" /><path d="M3 20.5h18" /></>,
  repeat:        <><path d="m17 2 3 3-3 3" /><path d="M4 11V9a4 4 0 0 1 4-4h12" /><path d="m7 22-3-3 3-3" /><path d="M20 13v2a4 4 0 0 1-4 4H4" /></>,
  sprout:        <><path d="M12 21v-9" /><path d="M12 12c0-4.2 2.8-7 7.5-7 0 4.6-2.9 7.3-7.5 7z" /><path d="M12 14.5c0-3.2-2.3-5.5-6.5-5.5 0 3.8 2.4 5.8 6.5 5.5z" /></>,
  barChart:      <><path d="M3 20.5h18" /><path d="M6.5 16.5v-5M11.5 16.5V6.5M16.5 16.5v-8" /></>,
  coins:         <><ellipse cx="12" cy="6" rx="7" ry="3" /><path d="M5 6v6c0 1.7 3.1 3 7 3s7-1.3 7-3V6" /><path d="M5 12v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6" /></>,
  arrowLeftRight: <><path d="M8 3 4 7l4 4" /><path d="M4 7h16" /><path d="m16 21 4-4-4-4" /><path d="M20 17H4" /></>,
  undo:          <><path d="m15 14 5-5-5-5" /><path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13" /></>,
  users:         <><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20a6.5 6.5 0 0 1 13 0" /><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8" /><path d="M18 14.6a6.5 6.5 0 0 1 3.5 5.4" /></>,
  inbox:         <><path d="M3 13h5l1.5 3h5l1.5-3h5" /><path d="M5.5 5h13L21 13v6a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-6z" /></>,
  send:          <><path d="M21 3 3.5 10.2l7 2.8 2.8 7z" /><path d="m10.5 13 4.5-4.5" /></>,
  more:          <><circle cx="5" cy="12" r="1.2" /><circle cx="12" cy="12" r="1.2" /><circle cx="19" cy="12" r="1.2" /></>,
  sparkles:      <><path d="M12 3.5 13.8 9 19.5 11l-5.7 2-1.8 5.5-1.8-5.5L4.5 11l5.7-2z" /><path d="M19 3v4M17 5h4" /></>,
  lock:          <><rect x="4.5" y="10.5" width="15" height="10" rx="2" /><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" /></>,
  eye:           <><path d="M2.5 12S6 5 12 5s9.5 7 9.5 7-3.5 7-9.5 7-9.5-7-9.5-7z" /><circle cx="12" cy="12" r="3" /></>,
  copy:          <><rect x="8" y="8" width="13" height="13" rx="2" /><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3" /></>,
};

export default function Icon({ name, size = 16, className, strokeWidth = 1.8, title, ...rest }) {
  const path = PATHS[name];
  if (!path) return null;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden={title ? undefined : true}
      role={title ? 'img' : undefined}
      focusable="false"
      style={{ flexShrink: 0 }}
      {...rest}
    >
      {title && <title>{title}</title>}
      {path}
    </svg>
  );
}
