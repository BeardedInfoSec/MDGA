import { Link } from 'react-router-dom';
import { useEffect, useState, useRef } from 'react';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import styles from './Story.module.css';

// Canonical lore — keep `<MAKE DUROTAR GREAT AGAIN>` and other guild tags
// in plain strings (they render fine in React without escaping).
const CHAPTERS = [
  {
    number: 'I',
    title: 'The Founding',
    paragraphs: [
      '<MAKE DUROTAR GREAT AGAIN> was founded on January 1st, 2025 by Blood Death Knight Cawkadoodle and his newly acquainted best pal, Druzak.',
      'In the very beginning, Cawkadoodle had just returned to the game since Dragonflight and was confused as to why Durotar was always empty — and full of Alliance. A place he once enjoyed dueling, hanging out, and waiting in queues was now lifeless and occupied by an Alliance guild known as <The Playas Club>.',
      'After several weeks of attempting to sit in Durotar peacefully, Cawkadoodle was fed up with the constant ganking, follower queue abuse, and various other exploits used by <The Playas Club>. Enough was enough.',
    ],
    pullQuote: 'Camped at the graveyard for 5 hours straight. Over 300 deaths. He refused to leave.',
    image: '/images/org_images/Part%201.png',
    imageAlt: 'Cawkadoodle camped at the Durotar graveyard',
  },
  {
    number: 'II',
    title: 'Meeting Druzak',
    paragraphs: [
      'The next day, he met a hunter named Druzak. He seemed to be the only other person in all of Durotar actually attempting to fight back. Cawkadoodle messaged Druzak and asked if he could join the guild he was in called <Laughing Coffins>.',
      'Once friends, now enemies — an invite was sent and accepted. A few days later, Druzak and Cawkadoodle asked <Laughing Coffins> for help in Durotar. They originally helped for a while, but they were a Moon Guard guild and soon had no continued interest in fighting for the sands.',
      'After some time of Druzak and Cawkadoodle once again being alone fighting back in Durotar, Cawkadoodle asked for invitation permissions in <Laughing Coffins>. They accepted.',
    ],
    image: '/images/org_images/Part%202.png',
    imageAlt: 'Cawkadoodle and Druzak meeting in Durotar',
  },
  {
    number: 'III',
    title: 'Forming MDGA',
    paragraphs: [
      'The following week, over one hundred people were recruited into <Laughing Coffins> from Tichondrius to fight back. This caused internal issues. There was now a sub-community from Tichondrius within <Laughing Coffins> that wanted to fight for Durotar, while the majority from Moon Guard did not.',
      'The Moon Guard members complained about anyone asking for World PvP in Durotar — which eventually led to <Laughing Coffins> stripping Cawkadoodle of his invitation permissions. The next day, he left.',
      'He went to Druzak and asked if he would be interested in starting a guild together. He said yes. That brings us to January 1st, 2025 — the creation of our community known as MDGA. Almost every single Tichondrius recruit followed them to this new community, and others would soon follow.',
    ],
    pullQuote: 'January 1st, 2025. The creation of MDGA.',
    image: '/images/org_images/Part%203.png',
    imageAlt: 'The founding of MDGA',
  },
  {
    number: 'IV',
    title: 'The First Month',
    paragraphs: [
      'The first month of MDGA was not easy. At the time, the Alliance and <The Playas Club> significantly outnumbered us. We went on to lose every major fight. But these were temporary losses — and they shaped us into the war machine we are today.',
      'New processes were introduced. Standards were put in place. The idea of "Durotar Defense" was created. Discord became a requirement — naturally filtering out non-social players. The community began growing at an unprecedented pace.',
      'Ranking systems were introduced. Events followed. A stronger sense of community formed around a common purpose.',
    ],
    pullQuote: 'Temporary losses shaped us into the war machine we are today.',
    image: '/images/org_images/Part%204.png',
    imageAlt: 'MDGA building its war machine in the first month',
  },
  {
    number: 'V',
    title: 'The Turning Point',
    paragraphs: [
      'As time went on, our numbers grew and we started to make a name for ourselves. Durotar began returning to life — and back to Horde control. The time of Alliance occupation was over. MDGA and the Horde had claimed their home.',
      'Our success led to the downfall of <The Playas Club>, leaving them as a scattered band of pests who still roam the sands from time to time. But before their fall, <The Playas Club> — often referred to as TPC — called in a new foe: the Ruthless Renegades.',
      'These enemies were far larger than what we were used to. They employed dishonorable tactics — raiding and leaving the shard as soon as we formed, asking for even-numbered fights then bringing more, and arriving early to scheduled fights.',
    ],
    image: '/images/org_images/Part%205.png',
    imageAlt: 'The turning point — Durotar back under Horde control',
  },
  {
    number: 'VI',
    title: 'MDGA Fights Back',
    paragraphs: [
      'MDGA had enough.',
      'We joined an organization known as the Horde Defense Network, which led to a decisive battle: 150+ Horde vs. 100+ Ruthless Renegades — resulting in Horde victory and proving we were capable of defeating them.',
      'Shortly after, MDGA chose its own path and left the Horde Defense Network due to social differences. And that was okay. <MAKE DUROTAR GREAT AGAIN> was ready to stand on its own two feet. And we did.',
      'For the following six months and beyond, Ruthless Renegades took defeat after defeat — with the occasional win — but we knew that if we rallied fully, they would fall.',
    ],
    pullQuote: '150+ Horde vs. 100+ Ruthless Renegades. Decisive Horde victory.',
    image: '/images/org_images/Part%206.png',
    imageAlt: 'The decisive 150 vs 100 battle in Durotar',
  },
  {
    number: 'VII',
    title: 'What Durotar Became',
    paragraphs: [
      'In the months following the creation of <MAKE DUROTAR GREAT AGAIN>, Durotar became a place where all Horde could gather — duel, hang out, try new specs, wait for queues, and have a place to call their own. The nostalgia returned. And it was here to stay.',
      'To this day, <MAKE DUROTAR GREAT AGAIN> continues to expand in every way. From manual audits that once took 4–5 hours to fully automated systems. From little to no rules to a standardized code of conduct. From forming one raid to forming three or more.',
      'MDGA is now known across the PvP realm. We hold a massive portion of the active PvP player base and continue to grow relentlessly. From casual players to gladiators — MDGA does not discriminate. We hold one common objective: to enjoy what we all love together. PvP.',
    ],
    image: '/images/org_images/Part%207.webp',
    imageAlt: 'What Durotar became — the largest Horde World PvP community',
  },
];

const STATS = [
  { value: 'Jan 1, 2025', label: 'Founded' },
  { value: '2,500+', label: 'Members' },
  { value: '11', label: 'Federation guilds' },
  { value: '#1', label: 'NA PvP rating' },
];

// Drop cap on the first character if it's a letter or digit. If the
// paragraph opens with punctuation (e.g., the `<` of a guild tag like
// `<MAKE DUROTAR GREAT AGAIN>`), skip the drop cap entirely — otherwise
// the leading `<` renders as a stray glyph next to the floated drop cap.
function renderWithDropCap(text) {
  if (!/^[A-Za-z0-9]/.test(text)) return text;
  const [letter, ...rest] = text;
  return (
    <>
      <span className={styles.dropCap}>{letter}</span>
      {rest.join('')}
    </>
  );
}

// IntersectionObserver-driven active chapter highlight for the sidebar.
// Marks whichever chapter is currently nearest the top of the viewport.
function useActiveChapter(chapterIds) {
  const [active, setActive] = useState(chapterIds[0]);
  const observerRef = useRef(null);

  useEffect(() => {
    const elements = chapterIds
      .map((id) => document.getElementById(id))
      .filter(Boolean);
    if (elements.length === 0) return undefined;

    const seen = new Map();
    observerRef.current = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          seen.set(entry.target.id, entry.intersectionRatio);
        }
        let bestId = chapterIds[0];
        let bestRatio = -1;
        for (const [id, ratio] of seen.entries()) {
          if (ratio > bestRatio) {
            bestRatio = ratio;
            bestId = id;
          }
        }
        if (bestRatio > 0) setActive(bestId);
      },
      { rootMargin: '-30% 0px -55% 0px', threshold: [0, 0.25, 0.5, 0.75, 1] }
    );
    elements.forEach((el) => observerRef.current.observe(el));
    return () => observerRef.current?.disconnect();
  }, [chapterIds]);

  return active;
}

// Click-to-enlarge lightbox. ESC or backdrop click closes.
function Lightbox({ open, src, alt, onClose }) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    // Prevent body scroll while open
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className={styles.lightbox} onClick={onClose} role="dialog" aria-modal="true" aria-label={alt}>
      <button
        type="button"
        className={styles.lightboxClose}
        onClick={onClose}
        aria-label="Close preview"
      >
        ×
      </button>
      <img
        src={src}
        alt={alt}
        className={styles.lightboxImage}
        onClick={(e) => e.stopPropagation()}
      />
    </div>
  );
}

export default function Story() {
  useDocumentTitle('Our Story | MDGA');
  const chapterIds = CHAPTERS.map((c) => `chapter-${c.number}`);
  const activeId = useActiveChapter(chapterIds);
  const [lightbox, setLightbox] = useState(null); // { src, alt } | null

  return (
    <div className={styles.page}>
      {/* ── Compact title band (replaces the full-bleed hero) ── */}
      <header className={styles.titleBand}>
        <div className={styles.titleBandInner}>
          <span className={styles.eyebrow}>The MDGA Chronicle</span>
          <h1 className={styles.pageTitle}>Our Story</h1>
          <p className={styles.pageSubtitle}>
            How one stubborn Death Knight, three hundred graveyard deaths, and a refusal
            to leave Durotar built the largest Horde World PvP community in North America.
          </p>
          <div className={styles.statsInline}>
            {STATS.map((s) => (
              <div key={s.label} className={styles.statsItem}>
                <span className={styles.statsValue}>{s.value}</span>
                <span className={styles.statsLabel}>{s.label}</span>
              </div>
            ))}
          </div>
        </div>
      </header>

      {/* ── Two-column body: sticky chapter nav + chapters ── */}
      <div className={styles.layout}>
        <aside className={styles.sidebar} aria-label="Story chapters">
          <div className={styles.sidebarSticky}>
            <span className={styles.sidebarLabel}>Chapters</span>
            <nav className={styles.sidebarNav}>
              {CHAPTERS.map((chapter) => {
                const id = `chapter-${chapter.number}`;
                const isActive = activeId === id;
                return (
                  <a
                    key={chapter.number}
                    href={`#${id}`}
                    className={`${styles.sidebarItem} ${isActive ? styles.sidebarItemActive : ''}`}
                  >
                    <span className={styles.sidebarItemNum}>{chapter.number}</span>
                    <span className={styles.sidebarItemTitle}>{chapter.title}</span>
                  </a>
                );
              })}
              <a
                href="#ending"
                className={`${styles.sidebarItem} ${activeId === 'ending' ? styles.sidebarItemActive : ''}`}
              >
                <span className={styles.sidebarItemNum}>—</span>
                <span className={styles.sidebarItemTitle}>Ending</span>
              </a>
            </nav>
          </div>
        </aside>

        <main className={styles.content}>
          {CHAPTERS.map((chapter, idx) => {
            const imageRight = idx % 2 === 1;
            return (
              <article
                key={chapter.number}
                id={`chapter-${chapter.number}`}
                className={`${styles.chapter} ${imageRight ? styles.chapterImageRight : ''}`}
              >
                <div className={styles.chapterMedia}>
                  <button
                    type="button"
                    className={styles.chapterImageWrap}
                    onClick={() => setLightbox({ src: chapter.image, alt: chapter.imageAlt })}
                    aria-label={`Enlarge: ${chapter.imageAlt}`}
                  >
                    <img
                      src={chapter.image}
                      alt={chapter.imageAlt}
                      className={styles.chapterImage}
                      loading="lazy"
                    />
                    <span className={styles.chapterImageZoom} aria-hidden="true">⤢</span>
                  </button>

                  {chapter.pullQuote && (
                    <blockquote className={styles.pullQuote}>
                      <span className={styles.pullQuoteMark} aria-hidden="true">&ldquo;</span>
                      <p>{chapter.pullQuote}</p>
                    </blockquote>
                  )}
                </div>

                <div className={styles.chapterText}>
                  <header className={styles.chapterHeader}>
                    <span className={styles.chapterPart}>Part {chapter.number}</span>
                    <h2 className={styles.chapterTitle}>{chapter.title}</h2>
                  </header>

                  {chapter.paragraphs.map((p, i) => (
                    <p key={i} className={styles.paragraph}>
                      {i === 0 ? renderWithDropCap(p) : p}
                    </p>
                  ))}
                </div>
              </article>
            );
          })}

          <section id="ending" className={styles.ending}>
            <button
              type="button"
              className={styles.endingFigure}
              onClick={() => setLightbox({
                src: '/images/org_images/Ending.png',
                alt: 'MDGA — the warband that took Durotar back',
              })}
              aria-label="Enlarge ending image"
            >
              <img
                src="/images/org_images/Ending.png"
                alt="MDGA — the warband that took Durotar back"
                loading="lazy"
              />
              <span className={styles.chapterImageZoom} aria-hidden="true">⤢</span>
            </button>

            <div className={styles.signature}>
              <p>Thank you for reading.</p>
              <p className={styles.signatureName}>— GM Cawkadoodle</p>
              <p className={styles.signatureTitle}>now known as &ldquo;Warchief&rdquo;</p>
            </div>

            <div className={styles.cta}>
              <h2 className={styles.ctaTitle}>The story continues.</h2>
              <p className={styles.ctaSub}>
                Durotar belongs to the Horde — and MDGA is here to make sure it stays that way.
              </p>
              <a
                href="https://guildsofwow.com/make-durotar-great-again"
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn--primary"
              >
                Join the Warband
              </a>
            </div>
          </section>
        </main>
      </div>

      <Lightbox
        open={!!lightbox}
        src={lightbox?.src}
        alt={lightbox?.alt}
        onClose={() => setLightbox(null)}
      />
    </div>
  );
}
