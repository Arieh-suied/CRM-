import { useState, useEffect } from 'react';
import styles from './SearchBar.module.css';

export default function SearchBar({ onSearch }) {
  const [value, setValue] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => onSearch(value.trim()), 350);
    return () => clearTimeout(timer);
  }, [value, onSearch]);

  function handleClear() {
    setValue('');
  }

  return (
    <div className={styles.wrapper}>
      <svg className={styles.icon} viewBox="0 0 20 20" fill="none">
        <circle cx="9" cy="9" r="6" stroke="currentColor" strokeWidth="1.8" />
        <path d="M14 14l3 3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
      <input
        className={styles.input}
        type="text"
        placeholder="חיפוש לפי שם, טלפון, מייל או מזהה עסקה..."
        value={value}
        onChange={(e) => setValue(e.target.value)}
      />
      {value && (
        <button type="button" className={styles.clear} onClick={handleClear}>
          ✕
        </button>
      )}
    </div>
  );
}
