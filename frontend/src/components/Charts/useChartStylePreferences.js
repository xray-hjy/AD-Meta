import { useMemo, useState } from 'react';

const PREFIX = 'admeta.chart-style.v1.';
function read(key) {
  if (!key) return {};
  try {
    const value = JSON.parse(localStorage.getItem(PREFIX + key) || '{}');
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  } catch { return {}; }
}

export default function useChartStylePreferences(key) {
  const saved = useMemo(() => read(key), [key]);
  const [edits, setEdits] = useState({});
  const values = edits[key] || saved;
  function update(field, value) {
    const next = { ...values, [field]: value };
    setEdits(current => ({ ...current, [key]: next }));
    try { if (key) localStorage.setItem(PREFIX + key, JSON.stringify(next)); } catch { /* Optional preference storage. */ }
  }
  function reset() {
    setEdits(current => ({ ...current, [key]: {} }));
    try { if (key) localStorage.removeItem(PREFIX + key); } catch { /* Works without storage. */ }
  }
  return { values, update, reset };
}
