import { useState, useRef, useEffect } from 'react';
import styles from './AIAssistant.module.css';

function SparkleBubbleIcon({ size = 24 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M11.5 2.5c.45 4.6 1.9 6.55 6.5 7-4.6.45-6.05 2.4-6.5 7-.45-4.6-1.9-6.55-6.5-7 4.6-.45 6.05-2.4 6.5-7z"
        fill="white"
      />
      <path
        d="M18 14.5c.27 2.1.95 2.95 3 3.2-2.05.25-2.73 1.1-3 3.2-.27-2.1-.95-2.95-3-3.2 2.05-.25 2.73-1.1 3-3.2z"
        fill="white"
        opacity="0.85"
      />
    </svg>
  );
}

function CloseIcon({ size = 14 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M5 5l14 14M19 5L5 19" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  );
}

function SendIcon({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M3.5 12L20 4l-5.5 16-3.2-6.8L3.5 12z" fill="currentColor" />
    </svg>
  );
}

export default function AIAssistant() {
  const [open, setOpen]       = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput]     = useState('');
  const [loading, setLoading] = useState(false);
  const listRef = useRef(null);

  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [messages, open]);

  const send = async () => {
    const text = input.trim();
    if (!text || loading) return;
    const history = [...messages, { role: 'user', content: text }];
    setMessages(history);
    setInput('');
    setLoading(true);
    try {
      const res = await fetch('/api/ai-assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: history }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || 'שגיאה בקבלת תשובה');
      setMessages(prev => [...prev, { role: 'assistant', content: data.reply || '' }]);
    } catch (err) {
      setMessages(prev => [...prev, { role: 'error', content: err.message }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {open && (
        <div className={styles.panel}>
          <div className={styles.header}>
            <span className={styles.headerTitle}>
              <span className={styles.headerIcon}><SparkleBubbleIcon size={15} /></span>
              עוזר AI
            </span>
            <button className={styles.closeBtn} onClick={() => setOpen(false)}><CloseIcon size={13} /></button>
          </div>

          <div className={styles.messages} ref={listRef}>
            {messages.length === 0 && (
              <div className={styles.empty}>
                שאל אותי שאלה על תורמים, תרומות, קבלות או העברות במערכת —<br />
                לדוגמה: "מתי ישראל תרם בפעם האחרונה?"
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
            {loading && <div className={`${styles.bubble} ${styles.bubbleAssistant}`}>חושב...</div>}
          </div>

          <div className={styles.inputBar}>
            <input
              className={styles.input}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
              placeholder="שאל שאלה..."
              disabled={loading}
            />
            <button className={styles.sendBtn} onClick={send} disabled={loading || !input.trim()}><SendIcon /></button>
          </div>
        </div>
      )}

      <div className={styles.fabWrap}>
        {!open && <div className={styles.fabRing} />}
        <button className={styles.fab} onClick={() => setOpen(o => !o)} title="עוזר AI">
          {open ? <CloseIcon size={20} /> : <SparkleBubbleIcon size={26} />}
        </button>
      </div>
    </>
  );
}
