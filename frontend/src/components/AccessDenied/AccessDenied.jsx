import { useAuth } from '../../contexts/AuthContext.jsx';
import styles from './AccessDenied.module.css';

export default function AccessDenied() {
  const { user, signOut } = useAuth();

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <div className={styles.icon}>⛔</div>
        <h1 className={styles.title}>אין גישה</h1>
        <p className={styles.message}>
          הכתובת <strong>{user?.email}</strong> אינה מורשית לגשת למערכת.
        </p>
        <p className={styles.hint}>פנה למנהל המערכת להוספת הרשאה.</p>
        <button className={styles.signOutBtn} onClick={signOut}>
          התנתק
        </button>
      </div>
    </div>
  );
}
