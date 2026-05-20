import { useState } from 'react';
import styles from './NumberChipsField.module.css';

// Tag-style input for arrays of integers. The giveaway config form uses
// it for target slot positions and drop-warning minutes — both were
// originally comma-separated text fields, which most members reported as
// fiddly. Each value becomes a removable chip; a small entry box adds
// more; optional presets overwrite the whole list in one click.
//
// Props:
//   value         number[]        — current list (controlled)
//   onChange      (next:number[]) — fires with the new list
//   max           number          — optional cap on chip count
//   min           number          — optional per-value lower bound (default 1)
//   maxValue      number          — optional per-value upper bound
//   placeholder   string          — placeholder for the add-input
//   presets       { label, values }[]  — quick-set buttons
//   unit          string          — small text appended to each chip (e.g. "min")

export default function NumberChipsField({
  value = [],
  onChange,
  max,
  min = 1,
  maxValue = 100000,
  placeholder = 'Add a number…',
  presets = [],
  unit,
}) {
  const [draft, setDraft] = useState('');

  function add(raw) {
    // Accept comma-separated paste too — useful when someone copies an
    // old config from elsewhere.
    const parts = String(raw)
      .split(',')
      .map((s) => parseInt(s.trim(), 10))
      .filter((n) => Number.isInteger(n) && n >= min && n <= maxValue);
    if (parts.length === 0) return;
    const merged = Array.from(new Set([...value, ...parts])).sort((a, b) => a - b);
    onChange(max ? merged.slice(0, max) : merged);
    setDraft('');
  }

  function remove(n) {
    onChange(value.filter((v) => v !== n));
  }

  return (
    <div className={styles.field}>
      {presets.length > 0 && (
        <div className={styles.presetRow}>
          {presets.map((p) => (
            <button
              key={p.label}
              type="button"
              className={styles.presetBtn}
              onClick={() => onChange(p.values)}
            >{p.label}</button>
          ))}
        </div>
      )}
      <div className={styles.chipRow}>
        {value.length === 0 && <span className={styles.emptyHint}>none yet</span>}
        {value.map((n) => (
          <span key={n} className={styles.chip}>
            {n}{unit ? <span className={styles.chipUnit}> {unit}</span> : null}
            <button
              type="button"
              className={styles.chipRemove}
              onClick={() => remove(n)}
              aria-label={`Remove ${n}`}
            >×</button>
          </span>
        ))}
      </div>
      <div className={styles.addRow}>
        <input
          type="number"
          min={min}
          max={maxValue}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ',') {
              e.preventDefault();
              add(draft);
            }
          }}
          onBlur={() => { if (draft.trim()) add(draft); }}
          placeholder={placeholder}
          className={styles.addInput}
        />
        <button
          type="button"
          className={styles.addBtn}
          onClick={() => add(draft)}
          disabled={!draft.trim()}
        >Add</button>
      </div>
    </div>
  );
}
