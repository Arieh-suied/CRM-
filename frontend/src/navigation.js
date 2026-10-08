// Every screen of the app, grouped the way the sidebar shows them.
// Items without `roles` are visible to everyone; otherwise only to the listed
// roles — or to a user whose extra_tabs grants that specific screen.
// 'institution' is a narrow, row-scoped portal role (see frontend/api/_scope.js):
// every screen it should NOT see needs an explicit roles list that excludes it.
const STAFF = ['admin', 'editor', 'viewer'];
const WRITERS = ['admin', 'editor'];

export const ROLE_LABELS = { admin: 'מנהל', editor: 'עורך', viewer: 'צופה', institution: 'מוסד' };

export const NAV_GROUPS = [
  {
    id: 'overview',
    items: [
      { id: 'summary', label: 'סיכום', icon: 'barChart', roles: ['institution'], description: 'סיכום התרומות של המוסד לפי חודשים' },
    ],
  },
  {
    id: 'donations',
    label: 'תרומות',
    items: [
      { id: 'transactions', label: 'עסקאות', icon: 'list', description: 'כל העסקאות שנקלטו מנדרים פלוס' },
      { id: 'keva', label: 'הוראות קבע', icon: 'repeat', roles: STAFF, description: 'הוראות קבע באשראי ובבנק, לפי מוסד' },
      { id: 'bank', label: 'העברות בנקאיות', icon: 'landmark', roles: STAFF, description: 'העברות בנקאיות והקבלות שהופקו עבורן' },
      { id: 'stripe', label: 'Stripe', icon: 'creditCard', roles: STAFF, description: 'תרומות ומנויים פעילים ב-Stripe' },
      { id: 'grow', label: 'Grow', icon: 'sprout', roles: STAFF, description: 'תשלומים מ-Grow והקבלות שהופקו עבורם' },
    ],
  },
  {
    id: 'receipts',
    label: 'קבלות',
    items: [
      { id: 'receipts', label: 'הפקת קבלות', icon: 'receipt', roles: STAFF, description: 'קבלה ידנית, ייבוא העברות מקובץ או מצילומי מסך, והעברות מהדף החיצוני' },
      { id: 'donor-report', label: 'דוח קבלות שנתי', icon: 'fileText', roles: STAFF, description: 'כל הקבלות של תורם בשנה נבחרת, עם הורדה כ-PDF' },
    ],
  },
  {
    id: 'refusals',
    label: 'סירובים',
    items: [
      { id: 'failures', label: 'סירובי אשראי', icon: 'xCircle', description: 'חיובי אשראי שנדחו, מתוך מיילי הסירוב של נדרים פלוס' },
      { id: 'bank-refusals', label: 'סירובים בנקאיים', icon: 'undo', roles: STAFF, description: 'בדיקה חודשית של הוראות קבע בנקאיות: נפרעו או חזרו' },
    ],
  },
  {
    id: 'funds',
    label: 'קרנות',
    items: [
      { id: 'funds', label: 'ניהול קרנות', icon: 'coins', roles: STAFF, description: 'הקרנות, היתרות שלהן והגיליונות המקושרים' },
      { id: 'fund-transfer', label: 'תנועה בקרן', icon: 'arrowLeftRight', roles: WRITERS, description: 'רישום העברה לנתמך או תרומה ידנית בגיליון הקרן' },
    ],
  },
  {
    id: 'settings',
    label: 'הגדרות',
    items: [
      { id: 'email-template', label: 'תבניות מייל', icon: 'mail', roles: WRITERS, description: 'מיילי התודה לתורמים, לכל מוסד' },
      { id: 'users', label: 'ניהול משתמשים', icon: 'users', roles: ['admin'], description: 'מי נכנס למערכת ומה כל אחד רואה' },
    ],
  },
];

export const ALL_SCREENS = NAV_GROUPS.flatMap((g) => g.items);
export const SCREEN_IDS = new Set(ALL_SCREENS.map((s) => s.id));

export function canSee(item, role, extraTabs = []) {
  return !item.roles || item.roles.includes(role) || extraTabs.includes(item.id);
}

// Groups filtered down to what this user may open (empty groups dropped).
export function visibleNav(role, extraTabs = []) {
  return NAV_GROUPS
    .map((g) => ({ ...g, items: g.items.filter((i) => canSee(i, role, extraTabs)) }))
    .filter((g) => g.items.length);
}

export const findScreen = (id) => ALL_SCREENS.find((s) => s.id === id);
