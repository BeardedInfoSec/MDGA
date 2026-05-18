import { useEffect, useState, useRef } from 'react';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import styles from './Leadership.module.css';

const LEADERS = [
  {
    id: 'cawkadoodle',
    name: 'Cawkadoodle',
    rank: 'Warchief',
    classKey: 'dk',
    classLabel: 'Blood Death Knight',
    image: '/images/Screenshot_2026-02-06_at_8.22.19_PM.png',
    imageAlt: 'GM Cawkadoodle and MDGA members',
    paragraphs: [
      "Co-founder of MDGA and its commanding presence on the battlefield. Cawkadoodle envisioned a guild where the Horde didn't just survive in Durotar — it dominated. As a Blood Death Knight, he leads from the front line, an unkillable wall of crimson steel that rallies the warband behind him.",
      "When he returned to the game and found Durotar empty and camped by the Alliance, he didn't run. He died 300 times in one night. Then he built an army. Under his leadership, MDGA grew from a handful of recruits into the #1 PvP force in North America.",
    ],
    achievements: [
      'Founded MDGA — January 1, 2025',
      'Organized the 100v100 Battle of Tichondrius',
      'Led the guild to #1 NA PvP rating',
      'Established the Discord command structure',
      'Survived 300 deaths in one night at the graveyard',
    ],
  },
  {
    id: 'druzak',
    name: 'Druzak',
    rank: 'Warlord',
    classKey: 'hunter',
    classLabel: 'Hunter',
    image: '/images/Screenshot_2026-02-06_at_8.28.02_PM.png',
    imageAlt: 'Warlord Druzak and MDGA forces',
    paragraphs: [
      "Co-founder and MDGA's Chieftain. Druzak's sharp tactical mind complements Cawkadoodle's front-line leadership. Where the GM holds the line, Druzak coordinates the flanks.",
      "Originally from <Laughing Coffins> on Moon Guard, Druzak was the only person in Durotar fighting back when Cawkadoodle found him. Together they built the recruitment pipeline that fueled MDGA's explosive growth across multiple server shards, and his tactical planning was key to the guild's victories against numerically superior forces.",
    ],
    achievements: [
      'Co-founded MDGA alongside Cawkadoodle',
      'Recruited the founding members from Laughing Coffins',
      "Spearheaded expansion to Area 52, Illidan, Zul'jin",
      'Designed the guild ranking system',
      'Master tactician of Durotar defense operations',
    ],
  },
  {
    id: 'nemy',
    name: 'Nemy',
    rank: 'Warlord',
    classKey: 'priest',
    classLabel: 'Discipline Priest',
    image: '/images/nemy.png',
    imageAlt: 'Warlord Nemy',
    paragraphs: [
      'Warlord and the hidden architect of MDGA. Nemy is the bridge between the chaos of the battlefield and the precision of the high command. While the Chieftain plans the flanks and the GM holds the line, Nemy ensures the entire war machine never skips a beat.',
      'Originally a veteran of the elite <Schism PvP>, Nemy joined the fray during the legendary 100v100 Battle of Durotar. Seeing a spark of true Horde dominance, Nemy brought a level of technical sophistication that transformed MDGA from a street-fighting warband into a highly automated superpower. Whether weaving shields in the heat of a graveyard camp or masterminding the backend infrastructure that tracks every victory, Nemy is the digital and spiritual spine of the guild.',
    ],
    achievements: [
      'Joined the front line — February 10, 2025',
      'Rapid ascension — appointed to the War Council within 30 days',
      "Tech mastermind — engineered the guild's automation, record-keeping, and backend logistics",
      "Field commander — frequently assumes command of Durotar's defense during high-stakes incursions",
      'Council enforcer — known for an eccentric approach to guild culture and morale',
    ],
  },
  {
    id: 'polychange',
    name: 'Polychange',
    rank: 'The Architect',
    classKey: 'druid',
    classLabel: 'Resto / Guardian Druid',
    image: '/images/polychange.png',
    imageAlt: 'Polychange — The Architect of MDGA',
    paragraphs: [
      "Polychange is the Architect — the Tauren druid who built the digital ground every MDGA member walks on. Twenty years deep in Azeroth, north of 400,000 confirmed kills logged across the account, and a lifelong instinct for taking things apart and reassembling them better. The website, the forum, the roster pipeline, the tooling that keeps the warband coordinated across server shards — all of it was forged by him.",
      "He joined MDGA in July of 2025 and immediately set about wiring the guild for scale. Cawkadoodle holds the line. Druzak coordinates the flanks. Nemy keeps the machinery moving. Polychange makes sure the warband has a memory — and a place to live when the fighting's done.",
    ],
    achievements: [
      'Architect of mdga.gg — built the site, forum, and roster system from scratch',
      '20+ years in World of Warcraft',
      '400,000+ confirmed kills account-wide',
      'Joined MDGA — July 2025',
      'Cawkadoodle strokes his noodle',
    ],
  },
];

const RANKS = [
  { horde: 'Warchief',       alliance: 'Grand Marshal', desc: 'Leads guild & strategy, coordinates officers.' },
  { horde: 'Warlord',        alliance: 'Marshal',       desc: 'Co-GM. Leads War Council & Jr War Council.' },
  { horde: 'War Council',    alliance: 'War Council',   desc: 'Core officers, runs operations.' },
  { horde: 'Jr War Council', alliance: 'Jr War Council', desc: 'Officer support, maintains operations. 2,000g repairs.' },
  { horde: 'Honorbound',     alliance: 'Guardian',      desc: 'Valued member. 1,400g repairs.' },
  { horde: 'Champion',       alliance: 'Knight',        desc: 'Active & participating. 700g repairs.' },
  { horde: 'Durotarian',     alliance: 'Elwynnian',     desc: 'Entry-level member. No repairs.' },
];

const STATS = [
  { value: '3', label: 'Council members' },
  { value: 'Jan 1, 2025', label: 'Founded' },
  { value: '7', label: 'Rank tiers' },
  { value: '#1', label: 'NA PvP rating' },
];

// IntersectionObserver-driven active section highlight for the sidebar.
function useActiveSection(sectionIds) {
  const [active, setActive] = useState(sectionIds[0]);
  const observerRef = useRef(null);

  useEffect(() => {
    const elements = sectionIds.map((id) => document.getElementById(id)).filter(Boolean);
    if (elements.length === 0) return undefined;

    const seen = new Map();
    observerRef.current = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) seen.set(entry.target.id, entry.intersectionRatio);
        let bestId = sectionIds[0];
        let bestRatio = -1;
        for (const [id, ratio] of seen.entries()) {
          if (ratio > bestRatio) { bestRatio = ratio; bestId = id; }
        }
        if (bestRatio > 0) setActive(bestId);
      },
      { rootMargin: '-30% 0px -55% 0px', threshold: [0, 0.25, 0.5, 0.75, 1] }
    );
    elements.forEach((el) => observerRef.current.observe(el));
    return () => observerRef.current?.disconnect();
  }, [sectionIds]);

  return active;
}

// Reusable click-to-enlarge lightbox (same pattern used on Story page).
function Lightbox({ open, src, alt, onClose }) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
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
      <button type="button" className={styles.lightboxClose} onClick={onClose} aria-label="Close preview">×</button>
      <img src={src} alt={alt} className={styles.lightboxImage} onClick={(e) => e.stopPropagation()} />
    </div>
  );
}

export default function Leadership() {
  useDocumentTitle('Leadership | MDGA');
  const sectionIds = [...LEADERS.map((l) => l.id), 'ranks'];
  const activeId = useActiveSection(sectionIds);
  const [lightbox, setLightbox] = useState(null);

  return (
    <div className={styles.page}>
      {/* ── Compact title band (matches Story) ── */}
      <header className={styles.titleBand}>
        <div className={styles.titleBandInner}>
          <span className={styles.eyebrow}>The Command</span>
          <h1 className={styles.pageTitle}>Leadership</h1>
          <p className={styles.pageSubtitle}>
            The commanders who forged MDGA into a war machine — from a single Death Knight
            refusing to leave the graveyard to a federation of guilds across realms.
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

      <div className={styles.layout}>
        <aside className={styles.sidebar} aria-label="Leadership sections">
          <div className={styles.sidebarSticky}>
            <span className={styles.sidebarLabel}>Council</span>
            <nav className={styles.sidebarNav}>
              {LEADERS.map((leader) => {
                const isActive = activeId === leader.id;
                return (
                  <a
                    key={leader.id}
                    href={`#${leader.id}`}
                    className={`${styles.sidebarItem} ${isActive ? styles.sidebarItemActive : ''}`}
                  >
                    <span className={styles.sidebarItemNum}>{leader.rank.charAt(0)}</span>
                    <span className={styles.sidebarItemTitle}>{leader.name}</span>
                  </a>
                );
              })}
              <a
                href="#ranks"
                className={`${styles.sidebarItem} ${activeId === 'ranks' ? styles.sidebarItemActive : ''}`}
              >
                <span className={styles.sidebarItemNum}>—</span>
                <span className={styles.sidebarItemTitle}>Rank Structure</span>
              </a>
            </nav>
          </div>
        </aside>

        <main className={styles.content}>
          {LEADERS.map((leader, idx) => {
            const imageRight = idx % 2 === 1;
            return (
              <article
                key={leader.id}
                id={leader.id}
                className={`${styles.leader} ${imageRight ? styles.leaderImageRight : ''}`}
              >
                <div className={styles.leaderMedia}>
                  <button
                    type="button"
                    className={styles.leaderImageWrap}
                    onClick={() => setLightbox({ src: leader.image, alt: leader.imageAlt })}
                    aria-label={`Enlarge: ${leader.imageAlt}`}
                  >
                    <img
                      src={leader.image}
                      alt={leader.imageAlt}
                      className={styles.leaderImage}
                      loading="lazy"
                    />
                    <span className={styles.leaderImageZoom} aria-hidden="true">⤢</span>
                  </button>
                </div>

                <div className={styles.leaderText}>
                  <header className={styles.leaderHeader}>
                    <span className={styles.leaderRank}>{leader.rank}</span>
                    <h2 className={styles.leaderName}>{leader.name}</h2>
                    <span className={`${styles.classChip} ${styles[`classChip_${leader.classKey}`]}`}>
                      {leader.classLabel}
                    </span>
                  </header>

                  {leader.paragraphs.map((p, i) => (
                    <p key={i} className={styles.paragraph}>{p}</p>
                  ))}

                  {/* Achievements live with the bio so the read flows
                      bio → "what they accomplished" without bouncing
                      back to the image column. */}
                  <div className={styles.achievements}>
                    <span className={styles.achievementsLabel}>Achievements</span>
                    <ul>
                      {leader.achievements.map((a) => <li key={a}>{a}</li>)}
                    </ul>
                  </div>
                </div>
              </article>
            );
          })}

          <section id="ranks" className={styles.ranks}>
            <header className={styles.sectionHeader}>
              <span className={styles.sectionEyebrow}>Hierarchy</span>
              <h2 className={styles.sectionTitle}>Rank Structure</h2>
              <p className={styles.sectionSubtitle}>
                Seven tiers of standing. Horde-side names on the left, Alliance-side
                equivalents on the right.
              </p>
            </header>

            <div className={styles.ranksLegend}>
              <span className={styles.legendItem}>
                <span className={`${styles.factionDot} ${styles.factionDotHorde}`} />
                Horde
              </span>
              <span className={styles.legendItem}>
                <span className={`${styles.factionDot} ${styles.factionDotAlliance}`} />
                Alliance
              </span>
            </div>

            <div className={styles.pillars}>
              <div className={styles.pillarHeader}>
                <span className={`${styles.pillarHeaderLabel} ${styles.pillarHeaderHorde}`}>Horde</span>
                <span className={styles.pillarHeaderTier}>Tier</span>
                <span className={`${styles.pillarHeaderLabel} ${styles.pillarHeaderAlliance}`}>Alliance</span>
              </div>

              {RANKS.map((r, i) => (
                <div key={i} className={styles.pillarRow}>
                  <div className={`${styles.pillarTile} ${styles.pillarTileHorde}`}>
                    <span className={`${styles.factionDot} ${styles.factionDotHorde}`} aria-hidden="true" />
                    <span className={styles.pillarTileName}>{r.horde}</span>
                  </div>

                  <div className={styles.pillarBridge} aria-hidden="true">
                    <span className={styles.pillarBridgeLine} />
                    <span className={styles.pillarBridgeBadge}>{i + 1}</span>
                    <span className={styles.pillarBridgeLine} />
                  </div>

                  <div className={`${styles.pillarTile} ${styles.pillarTileAlliance}`}>
                    <span className={styles.pillarTileName}>{r.alliance}</span>
                    <span className={`${styles.factionDot} ${styles.factionDotAlliance}`} aria-hidden="true" />
                  </div>

                  <p className={styles.pillarDesc}>{r.desc}</p>
                </div>
              ))}
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
