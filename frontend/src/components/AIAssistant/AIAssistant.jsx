import { useState, useRef, useEffect } from 'react';
import styles from './AIAssistant.module.css';
import { authFetch } from '../../services/api.js';
import { Icon, IconButton } from '../ui';

const EXAMPLES = [
  'מתי ישראל ישראלי תרם בפעם האחרונה?',
  'כמה תרומות היו החודש בסומך נופלים?',
  'אילו קבלות הופקו היום?',
];

export default function AIAssistant() {
  const [open, setOpen]       = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput]     = useState('');
  const [loading, setLoading] = useState(false);
  const listRef = useRef(null);
  const inputRef = useRef(null);
  const fabRef = useRef(null);

  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [messages, open, loading]);

  // Focus the question box on open; Esc closes and returns focus to the button.
  useEffect(() => {
    if (!open) return undefined;
    inputRef.current?.focus();
    const onKey = (e) => {
      if (e.key === 'Escape') { setOpen(false); fabRef.current?.focus(); }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  const send = async (preset) => {
    const text = (preset ?? input).trim();
    if (!text || loading) return;
    const history = [...messages, { role: 'user', content: text }];
    setMessages(history);
    setInput('');
    setLoading(true);
    try {
      const res = await authFetch('/api/ai-assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: history }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || 'שגיאה בקבלת תשובה');
      setMessages((prev) => [...prev, { role: 'assistant', content: data.reply || '' }]);
    } catch (err) {
      setMessages((prev) => [...prev, { role: 'error', content: err.message }]);
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  };

  return (
    <>
      {open && (
        <section className={styles.panel} aria-label="עוזר AI">
          <div className={styles.header}>
            <span className={styles.headerTitle}>
              <span className={styles.headerIcon}><Icon name="sparkles" size={15} strokeWidth={2} /></span>
              עוזר AI
            </span>
            <div className={styles.headerActions}>
              {messages.length > 0 && (
                <IconButton size="sm" icon="refresh" label="שיחה חדשה" onClick={() => setMessages([])} disabled={loading} />
              )}
              <IconButton size="sm" icon="x" label="סגירה" onClick={() => setOpen(false)} />
            </div>
          </div>

          <div className={styles.messages} ref={listRef} aria-live="polite">
            {messages.length === 0 && (
              <div className={styles.empty}>
                <p>אפשר לשאול על תורמים, תרומות, קבלות והעברות במערכת. למשל:</p>
                <div className={styles.examples}>
                  {EXAMPLES.map((q) => (
                    <button key={q} type="button" className={styles.example} onClick={() => send(q)}>{q}</button>
                  ))}
                </div>
              </div>
            )}
            {messages.map((m, i) => (
              <div
                key={i}
                className={`${styles.bubble} ${
                  m.role === 'user' ? styles.bubbleUser : m.role === 'error' ? styles.bubbleError : styles.bubbleAssistant
                }`}
              >
                {m.content}
              </div>
            ))}
            {loading && (
              <div className={`${styles.bubble} ${styles.bubbleAssistant} ${styles.typing}`} aria-label="העוזר כותב">
                <span /><span /><span />
              </div>
            )}
          </div>

          <form className={styles.inputBar} onSubmit={(e) => { e.preventDefault(); send(); }}>
            <input
              ref={inputRef}
              className={styles.input}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="מה תרצה לדעת?"
              aria-label="שאלה לעוזר"
              disabled={loading}
            />
            <button type="submit" className={styles.sendBtn} disabled={loading || !input.trim()} aria-label="שליחה" title="שליחה">
              <Icon name="send" size={16} />
            </button>
          </form>
        </section>
      )}

      <button
        ref={fabRef}
        type="button"
        className={styles.fab}
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label={open ? 'סגירת עוזר ה-AI' : 'פתיחת עוזר ה-AI'}
        title="עוזר AI"
      >
        <Icon name={open ? 'x' : 'sparkles'} size={open ? 20 : 22} strokeWidth={2} />
      </button>
    </>
  );
}
