import { useAuth } from '../../contexts/AuthContext.jsx';
import styles from './AccessDenied.module.css';
import AuthCard from '../AuthCard/AuthCard.jsx';
import { Button } from '../ui';

export default function AccessDenied() {
  const { user, signOut } = useAuth();

  return (
    <AuthCard icon="lock" tone="danger" title="אין גישה למערכת">
      <p className={styles.message}>
        הכתובת <strong dir="ltr">{user?.email}</strong> אינה מורשית לגשת למערכת.
      </p>
      <p className={styles.hint}>כדי לקבל גישה, יש לפנות למנהל המערכת.</p>
      <Button block icon="logout" onClick={signOut}>התנתקות וכניסה עם חשבון אחר</Button>
    </AuthCard>
  );
}
