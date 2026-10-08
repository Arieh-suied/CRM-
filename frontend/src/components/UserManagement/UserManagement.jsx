import { useState, useEffect, useCallback, useId } from 'react';
import styles from './UserManagement.module.css';
import { fetchAdminUsers, createAdminUser, updateAdminUser, deleteAdminUser, resetInstitutionPassword } from '../../services/api.js';
import { ROLE_LABELS } from '../../navigation.js';
import {
  Card, Toolbar, ToolbarSpacer, ToolbarMeta, Modal, Field, Input, Button, IconButton, Badge, Alert, StateMessage,
  Table, Popover, MenuItem, MenuDivider, formStyles, tableStyles as t, useToast, useConfirm, usePrompt,
} from '../ui';

const ROLES = [
  { value: 'viewer',      label: 'צופה',   desc: 'צפייה בנתונים בלבד' },
  { value: 'editor',      label: 'עורך',   desc: 'צפייה ועריכת נתונים' },
  { value: 'admin',       label: 'מנהל',   desc: 'גישה מלאה וניהול משתמשים' },
  { value: 'institution', label: 'מוסד',   desc: 'כניסה עם סיסמה, צפייה בנתוני המוסד בלבד' },
];

const ROLE_TONE = { admin: 'primary', editor: 'warning', viewer: 'neutral', institution: 'success' };

const EXTRA_TABS = [
  { value: 'bank-refusals', label: 'סירובים בנקאיים', desc: 'צפייה בלבד בדוח הוראות הקבע שחזרו' },
  { value: 'donor-report', label: 'דוח קבלות שנתי', desc: 'צפייה והורדה, מסונן לפי הקרן/קטגוריה שהוקצתה למשתמש' },
];

// Inline multi-select: "all" (value null) or a subset. Used for institutions
// and for the sub-fund categories of an institution user.
function CheckList({ options, value, onChange, allLabel }) {
  const allSelected = !value || value.length === 0;
  const toggle = (v) => {
    if (allSelected) return onChange([v]);
    if (value.includes(v)) {
      const next = value.filter((n) => n !== v);
      return onChange(next.length ? next : null);
    }
    return onChange([...value, v]);
  };
  return (
    <div className={styles.checkList}>
      <label className={`${styles.checkItem} ${styles.checkAll}`}>
        <input type="checkbox" checked={allSelected} onChange={() => onChange(null)} />
        <span>{allLabel}</span>
      </label>
      {options.map((o) => (
        <label key={o.value} className={styles.checkItem}>
          <input type="checkbox" checked={!allSelected && value.includes(o.value)} onChange={() => toggle(o.value)} />
          <span>{o.label}</span>
        </label>
      ))}
    </div>
  );
}

// Selectable card (radio for the role, checkbox for extra screens).
function OptionCard({ type, name, checked, onChange, label, desc }) {
  return (
    <label className={`${styles.option} ${checked ? styles.optionActive : ''}`}>
      <input type={type} name={name} checked={checked} onChange={onChange} />
      <span>
        <span className={styles.optionLabel}>{label}</span>
        <span className={styles.optionDesc}>{desc}</span>
      </span>
    </label>
  );
}

const EMPTY_FORM = { email: '', full_name: '', role: 'viewer', allowed_mosadim: null, allowed_group_names: null, extra_tabs: null, password: '' };

function UserFormModal({ institutions, groupNames, initial, onSave, onCancel, saving, error }) {
  const [form, setForm] = useState(initial ?? EMPTY_FORM);
  const formId = useId();
  const isEdit = !!initial;
  const isInstitution = form.role === 'institution';

  const set = (key, val) => setForm((p) => ({ ...p, [key]: val }));
  const toggleTab = (tab, checked) => {
    const next = checked
      ? [...(form.extra_tabs ?? []), tab]
      : (form.extra_tabs ?? []).filter((x) => x !== tab);
    set('extra_tabs', next.length ? next : null);
  };

  return (
    <Modal
      size="lg"
      title={isEdit ? 'עריכת משתמש' : 'הוספת משתמש'}
      subtitle={isEdit ? form.email : undefined}
      onClose={saving ? undefined : onCancel}
      footer={(
        <>
          <Button onClick={onCancel} disabled={saving}>ביטול</Button>
          <Button type="submit" form={formId} variant="primary" loading={saving}>
            {isEdit ? 'שמירת שינויים' : 'הוספת המשתמש'}
          </Button>
        </>
      )}
    >
      <form id={formId} className={styles.form} onSubmit={(e) => { e.preventDefault(); onSave(form); }}>
        {error && <Alert tone="danger">{error}</Alert>}

        <div className={formStyles.grid2}>
          <Field label='דוא"ל' required>
            <Input type="email" required placeholder="user@example.com" dir="ltr" value={form.email} onChange={(e) => set('email', e.target.value)} disabled={isEdit} />
          </Field>
          <Field label="שם מלא">
            <Input placeholder="שם המשתמש" value={form.full_name ?? ''} onChange={(e) => set('full_name', e.target.value)} />
          </Field>
        </div>

        <fieldset className={styles.fieldset}>
          <legend className={styles.legend}>תפקיד</legend>
          <div className={styles.options}>
            {ROLES.map((r) => (
              <OptionCard key={r.value} type="radio" name="role" checked={form.role === r.value} onChange={() => set('role', r.value)} label={r.label} desc={r.desc} />
            ))}
          </div>
        </fieldset>

        <div className={formStyles.grid2}>
          <fieldset className={styles.fieldset}>
            <legend className={styles.legend}>גישה למוסדות</legend>
            <CheckList
              allLabel="כל המוסדות"
              options={institutions.map((i) => ({ value: i.mosad_number, label: i.mosad_name }))}
              value={form.allowed_mosadim}
              onChange={(v) => set('allowed_mosadim', v)}
            />
          </fieldset>

          {isInstitution && (
            <fieldset className={styles.fieldset}>
              <legend className={styles.legend}>קטגוריה בתוך המוסד (לא חובה)</legend>
              <CheckList
                allLabel="כל הקטגוריות במוסד"
                options={(groupNames ?? []).map((g) => ({ value: g, label: g }))}
                value={form.allowed_group_names}
                onChange={(v) => set('allowed_group_names', v)}
              />
              <p className={styles.hint}>לקרן ייעודית תחת מוסד משותף (למשל יחי ראובן תחת סומך נופלים)</p>
            </fieldset>
          )}
        </div>

        {isInstitution && !isEdit && (
          <Field label="סיסמה ראשונית" required hint="הסיסמה שתימסר למוסד">
            <Input required value={form.password} onChange={(e) => set('password', e.target.value)} autoComplete="new-password" />
          </Field>
        )}

        {isInstitution && (
          <fieldset className={styles.fieldset}>
            <legend className={styles.legend}>מסכים נוספים</legend>
            <div className={styles.options}>
              {EXTRA_TABS.map((tab) => (
                <OptionCard
                  key={tab.value}
                  type="checkbox"
                  checked={(form.extra_tabs ?? []).includes(tab.value)}
                  onChange={(e) => toggleTab(tab.value, e.target.checked)}
                  label={tab.label}
                  desc={tab.desc}
                />
              ))}
            </div>
          </fieldset>
        )}
      </form>
    </Modal>
  );
}

export default function UserManagement({ institutions, groupNames }) {
  const toast = useToast();
  const confirm = useConfirm();
  const prompt = usePrompt();
  const [users, setUsers]       = useState([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing]   = useState(null);
  const [saving, setSaving]     = useState(false);
  const [formError, setFormError] = useState(null);

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

  function openForm(user = null) {
    setEditing(user);
    setFormError(null);
    setShowForm(true);
  }

  function cancelForm() {
    setShowForm(false);
    setEditing(null);
    setFormError(null);
  }

  async function handleSave(form) {
    setSaving(true);
    setFormError(null);
    try {
      if (editing) {
        await updateAdminUser(editing.id, {
          full_name:           form.full_name,
          role:                form.role,
          allowed_mosadim:     form.allowed_mosadim,
          allowed_group_names: form.allowed_group_names,
          extra_tabs:          form.extra_tabs,
        });
        toast.success('המשתמש עודכן');
      } else {
        await createAdminUser(form);
        toast.success(`${form.email} נוסף`);
      }
      setShowForm(false);
      setEditing(null);
      await load();
    } catch (e) {
      setFormError(e.message);
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(user) {
    try {
      await updateAdminUser(user.id, { is_active: !user.is_active });
      toast.success(user.is_active ? `${user.email} הושבת` : `${user.email} הופעל`);
      await load();
    } catch (e) {
      toast.error(e.message);
    }
  }

  async function handleDelete(user) {
    const ok = await confirm({
      title: 'מחיקת משתמש',
      message: `למחוק את ${user.email}? פעולה זו אינה הפיכה.`,
      confirmText: 'מחיקה',
      tone: 'danger',
    });
    if (!ok) return;
    try {
      await deleteAdminUser(user.id);
      toast.success(`${user.email} נמחק`);
      await load();
    } catch (e) {
      toast.error(e.message);
    }
  }

  async function handleResetPassword(user) {
    const password = await prompt({
      title: 'איפוס סיסמה',
      message: `סיסמה חדשה עבור ${user.email}. הסיסמה הקודמת תפסיק לעבוד.`,
      label: 'סיסמה חדשה',
      required: true,
      confirmText: 'עדכון הסיסמה',
    });
    if (!password) return;
    try {
      await resetInstitutionPassword(user.id, password);
      toast.success('הסיסמה עודכנה');
    } catch (e) {
      toast.error(e.message);
    }
  }

  function mosadimLabel(user) {
    if (!user.allowed_mosadim) return 'כל המוסדות';
    const names = user.allowed_mosadim.map((num) => {
      const inst = institutions.find((i) => i.mosad_number === num);
      return inst?.mosad_name ?? num;
    });
    return names.join(', ') || '—';
  }

  return (
    <>
      <Card clip>
        <Toolbar>
          <ToolbarMeta>{loading ? 'טוען…' : `${users.length} משתמשים`}</ToolbarMeta>
          <ToolbarSpacer />
          <Button variant="primary" icon="plus" onClick={() => openForm()}>הוספת משתמש</Button>
        </Toolbar>

        {loading && !users.length ? (
          <StateMessage kind="loading" title="טוען משתמשים…" />
        ) : error ? (
          <StateMessage kind="error" description={error} action={<Button size="sm" icon="refresh" onClick={load}>נסה שוב</Button>} />
        ) : users.length === 0 ? (
          <StateMessage title="אין משתמשים עדיין" icon="users" />
        ) : (
          <Table stackOnMobile busy={loading}>
            <thead>
              <tr>
                <th>דוא"ל</th>
                <th>שם</th>
                <th>תפקיד</th>
                <th>מוסדות</th>
                <th>סטטוס</th>
                <th aria-label="פעולות" />
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className={!u.is_active ? t.rowMuted : undefined}>
                  <td data-label='דוא"ל' className={t.strong} dir="ltr">{u.email}</td>
                  <td data-label="שם">{u.full_name || <span className={t.subtle}>—</span>}</td>
                  <td data-label="תפקיד"><Badge tone={ROLE_TONE[u.role] ?? 'neutral'}>{ROLE_LABELS[u.role] ?? u.role}</Badge></td>
                  <td data-label="מוסדות" className={`${t.muted} ${t.truncate}`} title={mosadimLabel(u)}>{mosadimLabel(u)}</td>
                  <td data-label="סטטוס">
                    {u.is_active ? <Badge tone="success" dot>פעיל</Badge> : <Badge tone="neutral" dot>מושבת</Badge>}
                  </td>
                  <td>
                    <div className={t.actions}>
                      <Button size="sm" variant="ghost" icon="edit" onClick={() => openForm(u)}>עריכה</Button>
                      <Popover
                        trigger={({ ref, toggle, open }) => (
                          <IconButton ref={ref} size="sm" icon="more" label={`פעולות נוספות עבור ${u.email}`} onClick={toggle} aria-expanded={open} />
                        )}
                      >
                        {({ close }) => (
                          <>
                            {u.role === 'institution' && (
                              <MenuItem icon="lock" onClick={() => { close(); handleResetPassword(u); }}>איפוס סיסמה</MenuItem>
                            )}
                            <MenuItem icon={u.is_active ? 'xCircle' : 'checkCircle'} onClick={() => { close(); toggleActive(u); }}>
                              {u.is_active ? 'השבתת המשתמש' : 'הפעלת המשתמש'}
                            </MenuItem>
                            <MenuDivider />
                            <MenuItem icon="trash" className={styles.dangerItem} onClick={() => { close(); handleDelete(u); }}>מחיקה</MenuItem>
                          </>
                        )}
                      </Popover>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      {showForm && (
        <UserFormModal
          institutions={institutions}
          groupNames={groupNames}
          initial={editing}
          onSave={handleSave}
          onCancel={cancelForm}
          saving={saving}
          error={formError}
        />
      )}
    </>
  );
}
