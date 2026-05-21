import { useEffect, useRef, useState } from 'react';
import styles from './MentionSuggest.module.css';

// Lightweight @mention autocomplete that attaches to any existing textarea
// via document.getElementById(textareaId). Renders a dropdown of matching
// users near the caret on `@<letters>`; selecting one splices a markdown
// profile link into the textarea value (replacing the `@<letters>` token).
//
// Why string-based attachment rather than a ref prop: the existing
// MarkdownEditor doesn't forward a ref, and several call sites already
// pass an id to render the textarea. Keeps the integration to two lines.

const TRIGGER_RE = /(?:^|\s)@(\w{1,30})$/;

export default function MentionSuggest({ textareaId, value, onChange, apiFetch }) {
  const [results, setResults] = useState([]);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const [tokenRange, setTokenRange] = useState(null); // [start, end] of the @token in `value`
  const [activeIdx, setActiveIdx] = useState(0);
  const fetchSeq = useRef(0);

  useEffect(() => {
    const ta = document.getElementById(textareaId);
    if (!ta) return undefined;

    const handler = async () => {
      // Read directly from the DOM, not from React state — the native
      // `input` event fires BEFORE React commits the onChange update,
      // so the closure's `value` lags by one character. Using ta.value
      // ensures the trigger detection works on the very first @ keystroke.
      const currentValue = ta.value;
      const caret = ta.selectionStart;
      const before = currentValue.slice(0, caret);
      const m = before.match(TRIGGER_RE);
      if (!m) {
        setOpen(false);
        return;
      }
      const query = m[1];
      const tokenStart = caret - query.length - 1; // includes the @
      setTokenRange([tokenStart, caret]);
      // Position the dropdown roughly under the textarea — fine-grained
      // caret positioning is overkill for an MVP; placing it at the start
      // of the line below the textarea is clear enough.
      const rect = ta.getBoundingClientRect();
      setPosition({ top: rect.bottom + window.scrollY + 4, left: rect.left + window.scrollX });

      const seq = ++fetchSeq.current;
      try {
        const res = await apiFetch(`/users/mention-search?q=${encodeURIComponent(query)}`);
        if (seq !== fetchSeq.current) return; // a newer request superseded us
        if (!res.ok) { setOpen(false); return; }
        const data = await res.json();
        setResults(data.results || []);
        setActiveIdx(0);
        setOpen((data.results || []).length > 0);
      } catch {
        setOpen(false);
      }
    };

    const keyHandler = (e) => {
      if (!open) return;
      if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIdx((i) => Math.min(i + 1, results.length - 1)); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIdx((i) => Math.max(i - 1, 0)); }
      else if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); insertMention(results[activeIdx]); }
      else if (e.key === 'Escape') { setOpen(false); }
    };

    ta.addEventListener('input', handler);
    ta.addEventListener('keyup', handler);
    ta.addEventListener('keydown', keyHandler);
    return () => {
      ta.removeEventListener('input', handler);
      ta.removeEventListener('keyup', handler);
      ta.removeEventListener('keydown', keyHandler);
    };
  }, [textareaId, value, apiFetch, open, results, activeIdx]);

  function insertMention(user) {
    if (!user || !tokenRange) return;
    // Use the live DOM value for the splice base, not the closure's
    // `value`. The user may have typed additional chars between when
    // the dropdown opened and when they clicked; React state may lag
    // by a keystroke. ta.value is always current.
    const ta = document.getElementById(textareaId);
    const base = ta ? ta.value : value;
    const [start, end] = tokenRange;
    const label = user.main_character_name || user.display_name || user.username;
    const inserted = `[@${label}](/profile?id=${user.id}) `;
    const next = base.slice(0, start) + inserted + base.slice(end);
    onChange(next);
    setOpen(false);
    // Restore caret after the inserted markdown so the user can keep typing.
    setTimeout(() => {
      const ta2 = document.getElementById(textareaId);
      if (ta2) {
        const pos = start + inserted.length;
        ta2.focus();
        ta2.setSelectionRange(pos, pos);
      }
    }, 0);
  }

  if (!open || results.length === 0) return null;
  return (
    <ul className={styles.dropdown} style={{ top: position.top, left: position.left }} role="listbox">
      {results.map((u, i) => (
        <li
          key={u.id}
          className={`${styles.item} ${i === activeIdx ? styles.itemActive : ''}`}
          onMouseDown={(e) => { e.preventDefault(); insertMention(u); }}
          onMouseEnter={() => setActiveIdx(i)}
          role="option"
          aria-selected={i === activeIdx}
        >
          {u.avatar_url ? (
            <img src={u.avatar_url} alt="" className={styles.avatar} />
          ) : (
            <span className={styles.avatarFallback}>{(u.main_character_name || u.display_name || u.username || '?')[0].toUpperCase()}</span>
          )}
          <span className={styles.primary}>{u.main_character_name || u.display_name || u.username}</span>
          {u.discord_username && u.discord_username !== (u.main_character_name || u.display_name) && (
            <span className={styles.secondary}>({u.discord_username})</span>
          )}
          <span className={`rank-badge rank-badge--${u.rank}`}>{u.rank}</span>
        </li>
      ))}
    </ul>
  );
}
