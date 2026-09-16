import { useState, useEffect, useCallback } from 'react';
import styles from './UserManagement.module.css';
import { fetchAdminUsers, createAdminUser, updateAdminUser, deleteAdminUser, resetInstitutionPassword } from '../../services/api.js';

const ROLES = [
  { value: 'viewer',      label: 'צופה',   desc: 'יכול לצפות בנתונים בלבד' },
  { value: 'editor',      label: 'עורך',   desc: 'יכול לערוך נתונים' },
  { value: 'admin',       label: 'מנהל',   desc: 'גישה מלאה וניהול משתמשים' },
  { value: 'institution', label: 'מוסד',   desc: 'כניסה עם סיסמה, צפייה בנתוני המוסד בלבד' },
];

const ROLE_LABELS = { admin: 'מנהל', editor: 'עורך', viewer: 'צופה', institution: 'מוסד' };
const ROLE_COLORS = { admin: 'admin', editor: 'editor', viewer: 'viewer', institution: 'institution' };

function RoleBadge({ role }) {
  return (
    <span className={`${styles.badge} ${styles[`badge_${ROLE_COLORS[role] ?? 'viewer'}`]}`}>
      {ROLE_LABELS[role] ?? role}
    </span>
  );
}

function MosadimSelect({ institutions, value, onChange }) {
  const [open, setOpen] = useState(false);
  const allSelected = !value || value.length === 0;

  function toggle(mosadNumber) {
    if (allSelected) {
      onChange([mosadNumber]);
    } else if (value.includes(mosadNumber)) {
      const next = value.filter((n) => n !== mosadNumber);
      onChange(next.length ? next : null);
    } else {
      onChange([...value, mosadNumber]);
    }
  }

  function toggleAll() {
    onChange(null);
  }

  const label = allSelected
    ? 'כל המוסדות'
    : `${value.length} מוסד${value.length !== 1 ? 'ות' : ''}`;

  return (
    <div className={styles.mosadDropdown}>
      <button
        type="button"
        className={styles.mosadTrigger}
        onClick={() => setOpen((v) => !v)}
      >
        <span>{label}</span>
        <svg viewBox="0 0 12 12" fill="none" className={styles.chevron} style={{ transform: open ? 'rotate(180deg)' : '' }}>
          <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>

      {open && (
        <div className={styles.mosadMenu}>
          <label className={styles.mosadItem}>
            <input type="checkbox" checked={allSelected} onChange={toggleAll} />
            <span>כל המוסדות</span>
          </label>
          {institutions.map((inst) => (
            <label key={inst.mosad_number} className={styles.mosadItem}>
              <input
                type="checkbox"
                checked={!allSelected && value.includes(inst.mosad_number)}
                onChange={() => toggle(inst.mosad_number)}
              />
              <span>{inst.mosad_name}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

// Same shape as MosadimSelect but over group_name strings — used to further
// restrict an institution user to a specific sub-fund (e.g. "יחי ראובן"
// inside מוסד סומך נופלים, which shares its mosad_number with other funds).
function GroupNamesSelect({ groupNames, value, onChange }) {
  const [open, setOpen] = useState(false);
  const allSelected = !value || value.length === 0;

  function toggle(name) {
    if (allSelected) {
      onChange([name]);
    } else if (value.includes(name)) {
      const next = value.filter((n) => n !== name);
      onChange(next.length ? next : null);
    } else {
      onChange([...value, name]);
    }
  }

  const label = allSelected
    ? 'כל הקטגוריות במוסד'
    : `${value.length} קטגורי${value.length !== 1 ? 'ות' : 'ה'}`;

  return (
    <div className={styles.mosadDropdown}>
      <button type="button" className={styles.mosadTrigger} onClick={() => setOpen((v) => !v)}>
        <span>{label}</span>
        <svg viewBox="0 0 12 12" fill="none" className={styles.chevron} style={{ transform: open ? 'rotate(180deg)' : '' }}>
          <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>
      {open && (
        <div className={styles.mosadMenu}>
          <label className={styles.mosadItem}>
            <input type="checkbox" checked={allSelected} onChange={() => onChange(null)} />
            <span>כל הקטגוריות</span>
          </label>
          {(groupNames ?? []).map((name) => (
            <label key={name} className={styles.mosadItem}>
              <input
                type="checkbox"
                checked={!allSelected && value.includes(name)}
                onChange={() => toggle(name)}
              />
              <span>{name}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

const EMPTY_FORM = { email: '', full_name: '', role: 'viewer', allowed_mosadim: null, allowed_group_names: null, extra_tabs: null, password: '' };

function UserForm({ institutions, groupNames, initial, onSave, onCancel, saving }) {
  const [form, setForm] = useState(initial ?? EMPTY_FORM);
  const isEdit = !!initial;
  const isInstitution = form.role === 'institution';

  const set = (key, val) => setForm((p) => ({ ...p, [key]: val }));
  const toggleTab = (tab, checked) => {
    const next = checked
      ? [...(form.extra_tabs ?? []), tab]
      : (form.extra_tabs ?? []).filter((t) => t !== tab);
    set('extra_tabs', next.length ? next : null);
  };

  function handleSubmit(e) {
    e.preventDefault();
    onSave(form);
  }

  return (
    <form className={styles.formCard} onSubmit={handleSubmit}>
      <h3 className={styles.formTitle}>{isEdit ? 'עריכת משתמש' : 'הוספת משתמש חדש'}</h3>

      <div className={styles.formRow}>
        <div className={styles.formField}>
          <label className={styles.formLabel}>דוא"ל *</label>
          <input
            className={styles.formInput}
            type="email"
            required
            placeholder="user@example.com"
            value={form.email}
            onChange={(e) => set('email', e.target.value)}
            disabled={isEdit}
          />
        </div>

        <div className={styles.formField}>
          <label className={styles.formLabel}>שם מלא</label>
          <input
            className={styles.formInput}
            type="text"
            placeholder="שם המשתמש"
            value={form.full_name ?? ''}
            onChange={(e) => set('full_name', e.target.value)}
          />
        </div>
      </div>

      <div className={styles.formRow}>
        <div className={styles.formField}>
          <label className={styles.formLabel}>תפקיד</label>
          <div className={styles.roleSelect}>
            {ROLES.map((r) => (
              <label key={r.value} className={`${styles.roleOption} ${form.role === r.value ? styles.roleOptionActive : ''}`}>
                <input
                  type="radio"
                  name="role"
                  value={r.value}
                  checked={form.role === r.value}
                  onChange={() => set('role', r.value)}
                />
                <div>
                  <span className={styles.roleLabel}>{r.label}</span>
                  <span className={styles.roleDesc}>{r.desc}</span>
                </div>
              </label>
            ))}
          </div>
        </div>

        <div className={styles.formField}>
          <label className={styles.formLabel}>גישה למוסדות</label>
          <MosadimSelect
            institutions={institutions}
            value={form.allowed_mosadim}
            onChange={(val) => set('allowed_mosadim', val)}
          />
          <p className={styles.formHint}>
            {!form.allowed_mosadim ? 'גישה לכל המוסדות (מומלץ למנהל)' : 'גישה לנבחרים בלבד'}
          </p>
        </div>
      </div>

      {isInstitution && (
        <div className={styles.formRow}>
          <div className={styles.formField}>
            <label className={styles.formLabel}>קטגוריה בתוך המוסד (אופציונלי)</label>
            <GroupNamesSelect
              groupNames={groupNames}
              value={form.allowed_group_names}
              onChange={(val) => set('allowed_group_names', val)}
            />
            <p className={styles.formHint}>
              למוסד עם קרן ייעודית תחת מוסד משותף (למשל יחי ראובן תחת סומך נופלים) - הגבל לקטגוריה הספציפית
            </p>
          </div>

          {!isEdit && (
            <div className={styles.formField}>
              <label className={styles.formLabel}>סיסמה ראשונית *</label>
              <input
                className={styles.formInput}
                type="text"
                required
                placeholder="סיסמה למסירה למוסד"
                value={form.password}
                onChange={(e) => set('password', e.target.value)}
              />
            </div>
          )}
        </div>
      )}

      {isInstitution && (
        <div className={styles.formRow}>
          <div className={styles.formField}>
            <label className={styles.formLabel}>לשוניות נוספות</label>
            <label className={styles.roleOption} style={{ minWidth: 0 }}>
              <input
                type="checkbox"
                checked={(form.extra_tabs ?? []).includes('bank-refusals')}
                onChange={(e) => toggleTab('bank-refusals', e.target.checked)}
              />
              <div>
                <span className={styles.roleLabel}>סירובים בנקאי</span>
                <span className={styles.roleDesc}>גישת צפייה בלבד לדוח הוראות הקבע שחזרו</span>
              </div>
            </label>
            <label className={styles.roleOption} style={{ minWidth: 0 }}>
              <input
                type="checkbox"
                checked={(form.extra_tabs ?? []).includes('donor-report')}
                onChange={(e) => toggleTab('donor-report', e.target.checked)}
              />
              <div>
                <span className={styles.roleLabel}>דוח קבלות שנתי</span>
                <span className={styles.roleDesc}>צפייה/הורדה של דוח קבלות שנתי, מסונן לפי הקרן/קטגוריה שהוקצתה למשתמש</span>
              </div>
            </label>
          </div>
        </div>
      )}

      <div className={styles.formActions}>
        <button type="submit" className={styles.btnPrimary} disabled={saving}>
          {saving ? 'שומר...' : isEdit ? 'שמור שינויים' : 'הוסף משתמש'}
        </button>
        <button type="button" className={styles.btnSecondary} onClick={onCancel} disabled={saving}>
          ביטול
        </button>
      </div>
    </form>
  );
}

export default function UserManagement({ institutions, groupNames }) {
  const [users, setUsers]       = useState([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing]   = useState(null);
  const [saving, setSaving]     = useState(false);
  const [actionError, setActionError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchAdminUsers();
      setUsers(data);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  function startAdd() {
    setEditing(null);
    setShowForm(true);
    setActionError(null);
  }

  function startEdit(user) {
    setEditing(user);
    setShowForm(true);
    setActionError(null);
  }

  function cancelForm() {
    setShowForm(false);
    setEditing(null);
    setActionError(null);
  }

  async function handleSave(form) {
    setSaving(true);
    setActionError(null);
    try {
      if (editing) {
        await updateAdminUser(editing.id, {
          full_name:           form.full_name,
          role:                form.role,
          allowed_mosadim:     form.allowed_mosadim,
          allowed_group_names: form.allowed_group_names,
          extra_tabs:          form.extra_tabs,
        });
      } else {
        await createAdminUser(form);
      }
      setShowForm(false);
      setEditing(null);
      await load();
    } catch (e) {
      setActionError(e.message);
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(user) {
    setActionError(null);
    try {
      await updateAdminUser(user.id, { is_active: !user.is_active });
      await load();
    } catch (e) {
      setActionError(e.message);
    }
  }

  async function handleDelete(user) {
    if (!window.confirm(`למחוק את ${user.email}? פעולה זו אינה הפיכה.`)) return;
    setActionError(null);
    try {
      await deleteAdminUser(user.id);
      await load();
    } catch (e) {
      setActionError(e.message);
    }
  }

  async function handleResetPassword(user) {
    const password = window.prompt(`סיסמה חדשה עבור ${user.email}:`);
    if (!password) return;
    setActionError(null);
    try {
      await resetInstitutionPassword(user.id, password);
      window.alert('הסיסמה עודכנה');
    } catch (e) {
      setActionError(e.message);
    }
  }

  function mosadimLabel(user) {
    if (!user.allowed_mosadim) return 'הכל';
    const names = user.allowed_mosadim.map((num) => {
      const inst = institutions.find((i) => i.mosad_number === num);
      return inst?.mosad_name ?? num;
    });
    return names.join(', ') || '—';
  }

  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <div>
          <h2 className={styles.pageTitle}>ניהול משתמשים</h2>
          <p className={styles.pageSubtitle}>הגדר מי יכול לגשת למערכת ומה הם יכולים לראות</p>
        </div>
        {!showForm && (
          <button className={styles.btnPrimary} onClick={startAdd}>+ הוסף משתמש</button>
        )}
      </div>

      {showForm && (
        <UserForm
          institutions={institutions}
          groupNames={groupNames}
          initial={editing}
          onSave={handleSave}
          onCancel={cancelForm}
          saving={saving}
        />
      )}

      {actionError && (
        <div className={styles.errorBanner}>{actionError}</div>
      )}

      {loading ? (
        <div className={styles.loadingState}>טוען משתמשים...</div>
      ) : error ? (
        <div className={styles.errorBanner}>{error}</div>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>דוא"ל</th>
                <th>שם</th>
                <th>תפקיד</th>
                <th>מוסדות</th>
                <th>סטטוס</th>
                <th>פעולות</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className={!u.is_active ? styles.rowInactive : ''}>
                  <td className={styles.cellEmail}>{u.email}</td>
                  <td>{u.full_name || <span className={styles.muted}>—</span>}</td>
                  <td><RoleBadge role={u.role} /></td>
                  <td className={styles.cellMosadim}>{mosadimLabel(u)}</td>
                  <td>
                    <span className={`${styles.statusDot} ${u.is_active ? styles.statusActive : styles.statusInactive}`}>
                      {u.is_active ? 'פעיל' : 'מושבת'}
                    </span>
                  </td>
                  <td>
                    <div className={styles.actions}>
                      <button className={styles.btnAction} onClick={() => startEdit(u)}>ערוך</button>
                      {u.role === 'institution' && (
                        <button className={styles.btnAction} onClick={() => handleResetPassword(u)}>איפוס סיסמה</button>
                      )}
                      <button className={styles.btnAction} onClick={() => toggleActive(u)}>
                        {u.is_active ? 'השבת' : 'הפעל'}
                      </button>
                      <button className={`${styles.btnAction} ${styles.btnDanger}`} onClick={() => handleDelete(u)}>
                        מחק
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {users.length === 0 && (
                <tr>
                  <td colSpan={6} className={styles.emptyState}>אין משתמשים עדיין</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
