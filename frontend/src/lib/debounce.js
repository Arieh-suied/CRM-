// Delays calling fn until `delay` ms have passed since the last call —
// each call cancels the previous pending one, so only the final call in a
// burst (e.g. fast typing) actually runs.
export function debounce(fn, delay) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

// Same idea, but keeps a separate timer per key — for a list of independent
// inputs (e.g. one per row in a table) where typing in one shouldn't cancel
// a pending call for another. `getKey` derives the key from the call args.
export function debounceByKey(fn, delay, getKey) {
  const timers = new Map();
  return (...args) => {
    const key = getKey(...args);
    clearTimeout(timers.get(key));
    timers.set(key, setTimeout(() => fn(...args), delay));
  };
}
