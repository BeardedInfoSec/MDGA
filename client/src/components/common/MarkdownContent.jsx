import { useEffect, useMemo, useRef, useState } from 'react';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import styles from './MarkdownContent.module.css';

// Configure marked once. GFM enabled for tables/strikethrough/autolinks,
// breaks: true so single newlines render as <br/> (forum convention).
marked.setOptions({ gfm: true, breaks: true, headerIds: false, mangle: false });

// DOMPurify config: allow common formatting + links + images, deny scripts/iframes.
const PURIFY_CONFIG = {
  ALLOWED_TAGS: [
    'p', 'br', 'strong', 'em', 'u', 's', 'del', 'ins', 'sub', 'sup',
    'a', 'img', 'blockquote', 'code', 'pre', 'hr',
    'ul', 'ol', 'li', 'dl', 'dt', 'dd',
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'table', 'thead', 'tbody', 'tr', 'th', 'td',
    'span',
  ],
  ALLOWED_ATTR: ['href', 'src', 'alt', 'title', 'class'],
  ALLOWED_URI_REGEXP: /^(?:https?:|mailto:|\/|#)/i,
};

function isExternalHref(href) {
  if (!href) return false;
  if (href.startsWith('/') || href.startsWith('#')) return false;
  try {
    const u = new URL(href, window.location.origin);
    return u.host && u.host !== window.location.host;
  } catch {
    return false;
  }
}

export default function MarkdownContent({ source, className }) {
  const containerRef = useRef(null);
  const [pendingHref, setPendingHref] = useState(null);

  const html = useMemo(() => {
    if (!source) return '';
    const raw = marked.parse(String(source));
    return DOMPurify.sanitize(raw, PURIFY_CONFIG);
  }, [source]);

  // After render, mark external anchors so clicks open the warning modal
  // instead of navigating directly. Also force target=_blank + rel for safety.
  useEffect(() => {
    if (!containerRef.current) return;
    const anchors = containerRef.current.querySelectorAll('a[href]');
    anchors.forEach((a) => {
      const href = a.getAttribute('href');
      if (isExternalHref(href)) {
        a.setAttribute('target', '_blank');
        a.setAttribute('rel', 'noopener noreferrer');
        a.dataset.mdgaExternal = '1';
      }
    });
  }, [html]);

  function handleClick(e) {
    const a = e.target.closest('a[data-mdga-external="1"]');
    if (!a) return;
    e.preventDefault();
    setPendingHref(a.getAttribute('href'));
  }

  function confirmAndOpen() {
    if (pendingHref) window.open(pendingHref, '_blank', 'noopener,noreferrer');
    setPendingHref(null);
  }

  return (
    <>
      <div
        ref={containerRef}
        className={`${styles.markdown} ${className || ''}`}
        onClick={handleClick}
        // sanitized via DOMPurify above
        dangerouslySetInnerHTML={{ __html: html }}
      />

      {pendingHref && (
        <div className={styles.modalBackdrop} onClick={() => setPendingHref(null)} role="dialog" aria-modal="true">
          <div className={styles.modalCard} onClick={(e) => e.stopPropagation()}>
            <h3 className={styles.modalTitle}>Leaving MDGA</h3>
            <p className={styles.modalBody}>
              You&apos;re about to open an external link. MDGA hasn&apos;t verified
              its safety — proceed only if you trust the source.
            </p>
            <div className={styles.modalUrlWrap}>
              <code className={styles.modalUrl}>{pendingHref}</code>
            </div>
            <div className={styles.modalActions}>
              <button type="button" className="btn btn--secondary btn--sm" onClick={() => setPendingHref(null)}>
                Cancel
              </button>
              <button type="button" className="btn btn--primary btn--sm" onClick={confirmAndOpen}>
                Open in new tab
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
