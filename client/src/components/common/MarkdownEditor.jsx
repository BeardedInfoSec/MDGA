import { useRef, useState } from 'react';
import { Bold, Italic, Link as LinkIcon, List, ListOrdered, Quote, Code, Eye, Edit3 } from 'lucide-react';
import MarkdownContent from './MarkdownContent';
import styles from './MarkdownEditor.module.css';

// Lightweight markdown editor: write/preview tabs + a small toolbar that
// inserts wrapping syntax around the current selection. No live preview
// (separate tab) keeps the component cheap and the textarea behavior
// predictable for users who type fast.
export default function MarkdownEditor({
  value,
  onChange,
  placeholder = 'Write your post… Markdown supported (bold, italic, links, lists).',
  rows = 6,
  maxLength,
  disabled = false,
  id,
}) {
  const [tab, setTab] = useState('write');
  const textareaRef = useRef(null);

  function wrapSelection(prefix, suffix = prefix) {
    const ta = textareaRef.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const before = value.slice(0, start);
    const selected = value.slice(start, end);
    const after = value.slice(end);
    const next = `${before}${prefix}${selected || ''}${suffix}${after}`;
    onChange(next);
    // Restore selection inside the wrapper after React commits
    requestAnimationFrame(() => {
      ta.focus();
      const cursorStart = start + prefix.length;
      const cursorEnd = cursorStart + selected.length;
      ta.setSelectionRange(cursorStart, cursorEnd);
    });
  }

  function insertLinePrefix(prefix) {
    const ta = textareaRef.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const lineStart = value.lastIndexOf('\n', start - 1) + 1;
    const next = `${value.slice(0, lineStart)}${prefix}${value.slice(lineStart)}`;
    onChange(next);
    requestAnimationFrame(() => {
      ta.focus();
      ta.setSelectionRange(start + prefix.length, start + prefix.length);
    });
  }

  function insertLink() {
    const ta = textareaRef.current;
    if (!ta) return;
    const url = window.prompt('Link URL:');
    if (!url) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const selected = value.slice(start, end) || 'link text';
    const before = value.slice(0, start);
    const after = value.slice(end);
    onChange(`${before}[${selected}](${url})${after}`);
    requestAnimationFrame(() => ta.focus());
  }

  return (
    <div className={styles.editor}>
      <div className={styles.toolbar}>
        <div className={styles.tabs}>
          <button
            type="button"
            className={`${styles.tab} ${tab === 'write' ? styles.tabActive : ''}`}
            onClick={() => setTab('write')}
          ><Edit3 size={12} aria-hidden="true" /> Write</button>
          <button
            type="button"
            className={`${styles.tab} ${tab === 'preview' ? styles.tabActive : ''}`}
            onClick={() => setTab('preview')}
          ><Eye size={12} aria-hidden="true" /> Preview</button>
        </div>
        {tab === 'write' && (
          <div className={styles.toolbarBtns}>
            <button type="button" title="Bold (Ctrl+B)" onClick={() => wrapSelection('**')} className={styles.toolBtn}><Bold size={14} /></button>
            <button type="button" title="Italic (Ctrl+I)" onClick={() => wrapSelection('*')} className={styles.toolBtn}><Italic size={14} /></button>
            <button type="button" title="Link" onClick={insertLink} className={styles.toolBtn}><LinkIcon size={14} /></button>
            <button type="button" title="Quote" onClick={() => insertLinePrefix('> ')} className={styles.toolBtn}><Quote size={14} /></button>
            <button type="button" title="List" onClick={() => insertLinePrefix('- ')} className={styles.toolBtn}><List size={14} /></button>
            <button type="button" title="Numbered list" onClick={() => insertLinePrefix('1. ')} className={styles.toolBtn}><ListOrdered size={14} /></button>
            <button type="button" title="Inline code" onClick={() => wrapSelection('`')} className={styles.toolBtn}><Code size={14} /></button>
          </div>
        )}
      </div>

      {tab === 'write' ? (
        <textarea
          ref={textareaRef}
          id={id}
          className={styles.textarea}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.ctrlKey || e.metaKey) {
              if (e.key === 'b') { e.preventDefault(); wrapSelection('**'); }
              if (e.key === 'i') { e.preventDefault(); wrapSelection('*'); }
            }
          }}
          placeholder={placeholder}
          rows={rows}
          maxLength={maxLength}
          disabled={disabled}
        />
      ) : (
        <div className={styles.preview}>
          {value.trim() ? (
            <MarkdownContent source={value} />
          ) : (
            <p className={styles.previewEmpty}>Nothing to preview yet.</p>
          )}
        </div>
      )}
    </div>
  );
}
