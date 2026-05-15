import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { formatEventDate, formatEventTimeOnly, getTimezoneAbbr, utcToDate } from '../../utils/timezone';
import styles from './Events.module.css';

const VALID_CATEGORIES = ['pvp', 'defense', 'social', 'raid'];
const CATEGORY_LABELS = { pvp: 'PvP', defense: 'Defense', social: 'Social', raid: 'Raid' };
const TAG_STYLES = {
  pvp: 'eventTagPvp',
  defense: 'eventTagDefense',
  social: 'eventTagSocial',
  raid: 'eventTagRaid',
};

function safeCategory(cat) {
  return VALID_CATEGORIES.includes(cat) ? cat : 'social';
}

// Compose a stable day key (e.g. "2026-05-14") from a UTC string + tz so
// agenda grouping respects the viewer's timezone.
function dayKey(utcStr, tz) {
  const d = utcToDate(utcStr);
  if (!d || isNaN(d.getTime())) return '';
  const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' });
  return fmt.format(d);
}

function formatDayHeader(utcStr, tz) {
  return formatEventDate(utcStr, tz);
}

// Live countdown to the next upcoming event.
function useCountdown(events) {
  const [countdown, setCountdown] = useState(null);
  useEffect(() => {
    if (!events || events.length === 0) return undefined;
    function update() {
      const now = new Date();
      const upcoming = events
        .filter((e) => e.starts_at && utcToDate(e.starts_at) > now)
        .sort((a, b) => utcToDate(a.starts_at) - utcToDate(b.starts_at));
      if (upcoming.length === 0) { setCountdown(null); return; }
      const next = upcoming[0];
      const diff = utcToDate(next.starts_at) - now;
      if (diff <= 0) { setCountdown(null); return; }
      setCountdown({
        event: next,
        days: String(Math.floor(diff / (1000 * 60 * 60 * 24))).padStart(2, '0'),
        hours: String(Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))).padStart(2, '0'),
        mins: String(Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))).padStart(2, '0'),
      });
    }
    update();
    const id = setInterval(update, 30000); // every 30s is enough for a "in 2d 14h 7m" display
    return () => clearInterval(id);
  }, [events]);
  return countdown;
}

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

// ── Avatar stack ─────────────────────────────────────────────────────
function AvatarStack({ users = [], totalGoing = 0, max = 6 }) {
  if (users.length === 0 && totalGoing === 0) return null;
  const visible = users.slice(0, max);
  const remaining = Math.max(0, totalGoing - visible.length);
  return (
    <div className={styles.avatarStack} aria-label={`${totalGoing} going`}>
      {visible.map((u) => (
        <span
          key={u.id}
          className={styles.avatarStackItem}
          title={u.display_name || u.username}
        >
          {u.avatar_url ? (
            <img src={u.avatar_url} alt="" loading="lazy" />
          ) : (
            <span className={styles.avatarStackFallback}>
              {(u.display_name || u.username || '?').slice(0, 1).toUpperCase()}
            </span>
          )}
        </span>
      ))}
      {remaining > 0 && (
        <span className={`${styles.avatarStackItem} ${styles.avatarStackMore}`}>
          +{remaining}
        </span>
      )}
    </div>
  );
}

// ── Lightbox with carousel (used by past-event screenshot strips) ────
function Lightbox({ open, items, index, onClose, onPrev, onNext }) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowLeft') onPrev();
      else if (e.key === 'ArrowRight') onNext();
    };
    window.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose, onPrev, onNext]);

  if (!open || !items || items.length === 0) return null;
  const current = items[index] || items[0];
  return (
    <div className={styles.lightbox} onClick={onClose} role="dialog" aria-modal="true">
      <button type="button" className={styles.lightboxClose} onClick={onClose} aria-label="Close">×</button>
      {items.length > 1 && (
        <>
          <button
            type="button"
            className={`${styles.lightboxNav} ${styles.lightboxPrev}`}
            onClick={(e) => { e.stopPropagation(); onPrev(); }}
            aria-label="Previous"
          >‹</button>
          <button
            type="button"
            className={`${styles.lightboxNav} ${styles.lightboxNext}`}
            onClick={(e) => { e.stopPropagation(); onNext(); }}
            aria-label="Next"
          >›</button>
        </>
      )}
      <figure className={styles.lightboxFigure} onClick={(e) => e.stopPropagation()}>
        <img src={current.url} alt={current.caption || ''} className={styles.lightboxImage} />
        {current.caption && <figcaption className={styles.lightboxCaption}>{current.caption}</figcaption>}
        {items.length > 1 && (
          <div className={styles.lightboxIndex}>{index + 1} / {items.length}</div>
        )}
      </figure>
    </div>
  );
}

export default function Events() {
  useDocumentTitle('Events | MDGA');
  const { isLoggedIn, apiFetch, userTimezone } = useAuth();
  const location = useLocation();
  const [events, setEvents] = useState([]);
  const [filter, setFilter] = useState('all');
  const [view, setView] = useState('upcoming'); // 'upcoming' | 'past'
  const [rsvpState, setRsvpState] = useState({});
  const [highlightedEventId, setHighlightedEventId] = useState(null);

  // Past events + screenshots state
  const [pastScreenshots, setPastScreenshots] = useState({}); // event_id → array
  const [lightbox, setLightbox] = useState(null); // { items, index } | null
  const countdown = useCountdown(events);

  const tz = userTimezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
  const sectionIds = ['agenda'];
  const activeId = useActiveSection(sectionIds);

  useEffect(() => {
    (async () => {
      try {
        const res = await apiFetch('/events');
        const data = await res.json();
        const eventList = data.events || [];
        setEvents(eventList);
        const initialRsvp = {};
        for (const evt of eventList) {
          if (evt.user_rsvp_status) initialRsvp[evt.id] = evt.user_rsvp_status;
        }
        if (Object.keys(initialRsvp).length > 0) setRsvpState(initialRsvp);
      } catch (err) {
        console.error('Failed to load events:', err);
      }
    })();
  }, [apiFetch]);

  // Lazy-fetch screenshots for past events that have them.
  useEffect(() => {
    const pastWithShots = events.filter((e) => {
      const ends = e.ends_at ? utcToDate(e.ends_at) : utcToDate(e.starts_at);
      return ends && ends < new Date() && (e.screenshot_count || 0) > 0;
    });
    if (pastWithShots.length === 0) return;
    let cancelled = false;
    (async () => {
      const results = await Promise.all(
        pastWithShots.map(async (e) => {
          try {
            const res = await apiFetch(`/events/${e.id}/screenshots`);
            const data = await res.json();
            return [e.id, data.screenshots || []];
          } catch {
            return [e.id, []];
          }
        })
      );
      if (cancelled) return;
      setPastScreenshots(Object.fromEntries(results));
    })();
    return () => { cancelled = true; };
  }, [events, apiFetch]);

  // Deep link to a specific event card
  useEffect(() => {
    if (!location.hash || events.length === 0) return undefined;
    if (!location.hash.startsWith('#event-')) return undefined;
    const targetId = Number(location.hash.replace('#event-', ''));
    if (!Number.isFinite(targetId)) return undefined;
    setFilter('all');
    const t = window.setTimeout(() => {
      const target = document.getElementById(`event-${targetId}`);
      if (!target) return;
      target.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setHighlightedEventId(targetId);
      window.setTimeout(() => {
        setHighlightedEventId((current) => (current === targetId ? null : current));
      }, 2200);
    }, 80);
    return () => window.clearTimeout(t);
  }, [location.hash, events]);

  const handleRsvp = useCallback(async (eventId, status) => {
    if (!isLoggedIn) return;
    const previousStatus = rsvpState[eventId] || null;
    setRsvpState((prev) => ({ ...prev, [eventId]: status }));
    try {
      const res = await apiFetch(`/events/${eventId}/rsvp`, {
        method: 'POST',
        body: JSON.stringify({ status }),
      });
      if (res.ok) {
        const data = await res.json();
        setEvents((prev) =>
          prev.map((e) => e.id === eventId
            ? { ...e, rsvp_going: data.rsvp_going, rsvp_maybe: data.rsvp_maybe, going_users: data.going_users || e.going_users }
            : e
          )
        );
      } else {
        setRsvpState((prev) => ({ ...prev, [eventId]: previousStatus }));
      }
    } catch (err) {
      console.error('RSVP error:', err);
      setRsvpState((prev) => ({ ...prev, [eventId]: previousStatus }));
    }
  }, [isLoggedIn, apiFetch, rsvpState]);

  const now = new Date();
  const upcomingEvents = useMemo(() => events
    .filter((e) => {
      const start = e.starts_at ? utcToDate(e.starts_at) : null;
      const end = e.ends_at ? utcToDate(e.ends_at) : start;
      return start && end >= now;
    })
    .sort((a, b) => utcToDate(a.starts_at) - utcToDate(b.starts_at)),
    [events, now]);

  const pastEvents = useMemo(() => events
    .filter((e) => {
      const end = e.ends_at ? utcToDate(e.ends_at) : utcToDate(e.starts_at);
      return end && end < now;
    })
    .sort((a, b) => utcToDate(b.starts_at) - utcToDate(a.starts_at))
    .slice(0, 25),
    [events, now]);

  // Source list depends on which tab is active
  const sourceEvents = view === 'past' ? pastEvents : upcomingEvents;
  const filteredEvents = filter === 'all'
    ? sourceEvents
    : sourceEvents.filter((e) => safeCategory(e.category) === filter);

  // Group by day. Order = chronological for upcoming, reverse-chronological
  // for past (most recent first), so the day groups still read top-to-bottom
  // in the natural order for each tab.
  const eventsByDay = useMemo(() => {
    const groups = new Map();
    for (const e of filteredEvents) {
      const k = dayKey(e.starts_at, tz);
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(e);
    }
    return Array.from(groups.entries());
  }, [filteredEvents, tz]);

  // Aggregate "RSVPs this week" stat
  const weekFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const rsvpsThisWeek = upcomingEvents
    .filter((e) => utcToDate(e.starts_at) <= weekFromNow)
    .reduce((sum, e) => sum + (e.rsvp_going || 0), 0);

  const myAttendingCount = isLoggedIn
    ? Object.values(rsvpState).filter((s) => s === 'going').length
    : null;

  const STATS = [
    { value: String(upcomingEvents.length), label: 'Upcoming' },
    { value: countdown ? `${parseInt(countdown.days)}d ${parseInt(countdown.hours)}h` : '—', label: 'Next event in' },
    { value: String(rsvpsThisWeek), label: 'RSVPs this week' },
    isLoggedIn
      ? { value: String(myAttendingCount), label: 'You\'re going to' }
      : { value: 'Login', label: 'To RSVP' },
  ];

  const tabs = [
    { key: 'all', label: 'All' },
    { key: 'pvp', label: 'PvP' },
    { key: 'defense', label: 'Defense' },
    { key: 'social', label: 'Social' },
    { key: 'raid', label: 'Raid' },
  ];

  // Lightbox helpers
  function openLightbox(items, index = 0) { setLightbox({ items, index }); }
  function closeLightbox() { setLightbox(null); }
  function lightboxPrev() {
    setLightbox((lb) => lb ? ({ ...lb, index: (lb.index - 1 + lb.items.length) % lb.items.length }) : null);
  }
  function lightboxNext() {
    setLightbox((lb) => lb ? ({ ...lb, index: (lb.index + 1) % lb.items.length }) : null);
  }

  return (
    <div className={styles.page}>
      {/* Title band */}
      <header className={styles.titleBand}>
        <div className={styles.titleBandInner}>
          <span className={styles.eyebrow}>Guild Calendar</span>
          <h1 className={styles.pageTitle}>Events</h1>
          <p className={styles.pageSubtitle}>
            Fight together, feast together. RSVP, get reminded, show up — and check the past-events recap when it's done.
          </p>
          {countdown && countdown.event && (
            <a href={`#event-${countdown.event.id}`} className={styles.nextUpCallout}>
              <span className={styles.nextUpEyebrow}>Next up</span>
              <span className={styles.nextUpTitle}>{countdown.event.title}</span>
              <span className={styles.nextUpClock}>
                in {parseInt(countdown.days)}<small>d</small>{' '}
                {parseInt(countdown.hours)}<small>h</small>{' '}
                {parseInt(countdown.mins)}<small>m</small>{' '}
                {parseInt(countdown.secs)}<small>s</small>
              </span>
            </a>
          )}
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
        <aside className={styles.sidebar} aria-label="Events sections">
          <div className={styles.sidebarSticky}>
            <span className={styles.sidebarLabel}>View</span>
            <nav className={styles.sidebarNav}>
              <button
                type="button"
                className={`${styles.sidebarItem} ${view === 'upcoming' ? styles.sidebarItemActive : ''}`}
                onClick={() => setView('upcoming')}
              >
                <span className={styles.sidebarItemNum}>{upcomingEvents.length}</span>
                <span className={styles.sidebarItemTitle}>Upcoming</span>
              </button>
              <button
                type="button"
                className={`${styles.sidebarItem} ${view === 'past' ? styles.sidebarItemActive : ''}`}
                onClick={() => setView('past')}
              >
                <span className={styles.sidebarItemNum}>{pastEvents.length}</span>
                <span className={styles.sidebarItemTitle}>Past</span>
              </button>
            </nav>
          </div>
        </aside>

        <main className={styles.content}>
          {/* Agenda — toggle between Upcoming and Past at the top.
              In Upcoming view, the first chronologically-soonest row gets
              the "NEXT" featured treatment. In Past view, rows show
              attendance + screenshot strips instead of RSVP buttons. */}
          <section id="agenda" className={styles.agenda}>
            <header className={styles.sectionHeader}>
              <span className={styles.sectionEyebrow}>
                {view === 'past' ? 'Recap' : 'The Roster'}
              </span>
              <h2 className={styles.sectionTitle}>
                {view === 'past' ? 'Past Events' : 'Agenda'}
              </h2>
            </header>

            {/* View toggle: Upcoming | Past */}
            <div className={styles.viewToggle} role="tablist" aria-label="Event view">
              <button
                type="button"
                role="tab"
                aria-selected={view === 'upcoming'}
                className={view === 'upcoming' ? styles.viewToggleActive : styles.viewToggleBtn}
                onClick={() => setView('upcoming')}
              >
                Upcoming <span className={styles.viewToggleCount}>{upcomingEvents.length}</span>
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={view === 'past'}
                className={view === 'past' ? styles.viewToggleActive : styles.viewToggleBtn}
                onClick={() => setView('past')}
              >
                Past <span className={styles.viewToggleCount}>{pastEvents.length}</span>
              </button>
            </div>

            <div className={styles.filterPills}>
              {tabs.map((t) => (
                <button
                  key={t.key}
                  type="button"
                  className={filter === t.key ? styles.pillActive : styles.pill}
                  onClick={() => setFilter(t.key)}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {eventsByDay.length === 0 ? (
              <p className={styles.emptyNotice}>
                {view === 'past' ? 'No past events to show yet.' : 'No events match this filter.'}
              </p>
            ) : (
              <div className={styles.agendaList}>
                {eventsByDay.map(([key, dayEvents]) => (
                  <div key={key} className={styles.agendaDay}>
                    <div className={styles.agendaDayHeader}>
                      {formatDayHeader(dayEvents[0].starts_at, tz)}
                    </div>
                    <ul className={styles.agendaDayList}>
                      {dayEvents.map((event) => {
                        const cat = safeCategory(event.category);
                        const goingCount = event.rsvp_going || 0;
                        const maybeCount = event.rsvp_maybe || 0;
                        const myRsvp = rsvpState[event.id];
                        const isPast = view === 'past';
                        // NEXT treatment only applies in Upcoming view
                        const isNext = !isPast && countdown && event.id === countdown.event.id;
                        const screenshots = pastScreenshots[event.id] || [];
                        return (
                          <li
                            key={event.id}
                            id={`event-${event.id}`}
                            className={`${styles.agendaItem} ${isNext ? styles.agendaItemNext : ''} ${isPast ? styles.agendaItemPast : ''} ${highlightedEventId === event.id ? styles.agendaItemHighlighted : ''}`}
                          >
                            {isNext && (
                              <div className={styles.nextBadge}>
                                <span className={styles.nextBadgeLabel}>Next</span>
                                <span className={styles.nextBadgeCountdown}>
                                  Starts in {parseInt(countdown.days)}<span>d</span>{' '}
                                  {parseInt(countdown.hours)}<span>h</span>{' '}
                                  {parseInt(countdown.mins)}<span>m</span>
                                </span>
                              </div>
                            )}

                            <div className={styles.agendaItemTime}>
                              <span className={styles.agendaItemHour}>
                                {formatEventTimeOnly(event.starts_at, tz)}
                              </span>
                              <span className={styles.agendaItemTz}>
                                {getTimezoneAbbr(event.starts_at, tz)}
                              </span>
                            </div>

                            <div className={`${styles.agendaItemBar} ${styles[`agendaBar_${cat}`]}`} aria-hidden="true" />

                            <div className={styles.agendaItemBody}>
                              <div className={styles.agendaItemHead}>
                                <h3 className={styles.agendaItemTitle}>{event.title}</h3>
                                <span className={styles[TAG_STYLES[cat]]}>{CATEGORY_LABELS[cat]}</span>
                                {event.series_id && (
                                  <span className={styles.recurringBadge}>
                                    {event.series_index}/{event.series_total}
                                  </span>
                                )}
                              </div>
                              {event.description && (
                                <p className={styles.agendaItemDesc}>{event.description}</p>
                              )}
                              <div className={styles.agendaItemFooter}>
                                {!isPast && (
                                  <AvatarStack users={event.going_users || []} totalGoing={goingCount} />
                                )}
                                <span className={styles.agendaItemCounts}>
                                  {isPast ? (
                                    <span className={styles.countGoing}>{goingCount} attended</span>
                                  ) : goingCount > 0 || maybeCount > 0 ? (
                                    <>
                                      {goingCount > 0 && <span className={styles.countGoing}>{goingCount} going</span>}
                                      {maybeCount > 0 && <span className={styles.countMaybe}>{maybeCount} interested</span>}
                                    </>
                                  ) : (
                                    <span className={styles.countEmpty}>Be the first to RSVP</span>
                                  )}
                                </span>
                              </div>

                              {/* Past events: screenshot thumb strip */}
                              {isPast && screenshots.length > 0 && (
                                <div className={styles.thumbStrip}>
                                  {screenshots.slice(0, 6).map((s, i) => (
                                    <button
                                      key={s.id}
                                      type="button"
                                      className={styles.thumb}
                                      onClick={() => openLightbox(screenshots, i)}
                                      aria-label={`Open screenshot ${i + 1}`}
                                    >
                                      <img src={s.url} alt={s.caption || ''} loading="lazy" />
                                    </button>
                                  ))}
                                  {screenshots.length > 6 && (
                                    <button
                                      type="button"
                                      className={styles.thumbMore}
                                      onClick={() => openLightbox(screenshots, 6)}
                                    >
                                      +{screenshots.length - 6}
                                    </button>
                                  )}
                                </div>
                              )}
                              {isPast && screenshots.length === 0 && (event.screenshot_count || 0) === 0 && (
                                <p className={styles.thumbEmpty}>No screenshots yet.</p>
                              )}
                            </div>

                            {!isPast && isLoggedIn && (
                              <div className={styles.agendaItemActions}>
                                <button
                                  type="button"
                                  className={myRsvp === 'going' ? styles.rsvpBtnGoingActive : styles.rsvpBtn}
                                  onClick={() => handleRsvp(event.id, 'going')}
                                >Going</button>
                                <button
                                  type="button"
                                  className={myRsvp === 'maybe' ? styles.rsvpBtnMaybeActive : styles.rsvpBtn}
                                  onClick={() => handleRsvp(event.id, 'maybe')}
                                >Maybe</button>
                                <button
                                  type="button"
                                  className={myRsvp === 'not_going' ? styles.rsvpBtnNotGoingActive : styles.rsvpBtn}
                                  onClick={() => handleRsvp(event.id, 'not_going')}
                                >Skip</button>
                              </div>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </section>

        </main>
      </div>

      <Lightbox
        open={!!lightbox}
        items={lightbox?.items || []}
        index={lightbox?.index || 0}
        onClose={closeLightbox}
        onPrev={lightboxPrev}
        onNext={lightboxNext}
      />
    </div>
  );
}
