import { useState, useEffect, useCallback } from 'react';
import styles from './UserManagement.module.css';
import { fetchAdminUsers, createAdminUser, updateAdminUser, deleteAdminUser } from '../../services/api.js';

const ROLES = [
  { value: 'viewer', label: 'צופה',   desc: 'יכול לצפות בנתונים בלבד' },
  { value: 'editor', label: 'עורך',   desc: 'יכול לערוך נתונים' },
  { value: 'admin',  label: 'מנהל',   desc: 'גישה מלאה וניהול משתמשים' },
];

const ROLE_LABELS = { admin: 'מנהל', editor: 'עורך', viewer: 'צופה' };
const ROLE_COLORS = { admin: 'admin', editor: 'editor', viewer: 'viewer' };

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

const EMPTY_FORM = { email: '', full_name: '', role: 'viewer', allowed_mosadim: null };

function UserForm({ institutions, initial, onSave, onCancel, saving }) {
  const [form, setForm] = useState(initial ?? EMPTY_FORM);
  const isEdit = !!initial;

  const set = (key, val) => setForm((p) => ({ ...p, [key]: val }));

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

export default function UserManagement({ institutions }) {
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
          full_name:       form.full_name,
          role:            form.role,
          allowed_mosadim: form.allowed_mosadim,
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
