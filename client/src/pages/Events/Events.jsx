import { useState, useEffect, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { formatEventDate, formatEventTimeOnly, getTimezoneAbbr, utcToDate } from '../../utils/timezone';
import PageHero from '../../components/common/PageHero';
import { Card } from '../../components/ui';
import styles from './Events.module.css';

const VALID_CATEGORIES = ['pvp', 'defense', 'social', 'raid'];
const CATEGORY_LABELS = { pvp: 'PvP', defense: 'Defense', social: 'Social', raid: 'Raid' };

const TAG_STYLES = {
  pvp: 'eventTagPvp',
  defense: 'eventTagDefense',
  social: 'eventTagSocial',
  raid: 'eventTagRaid',
};

const BAR_STYLES = {
  pvp: 'scheduleBarPvp',
  defense: 'scheduleBarDefense',
  social: 'scheduleBarSocial',
  raid: 'scheduleBarRaid',
};

function safeCategory(cat) {
  return VALID_CATEGORIES.includes(cat) ? cat : 'social';
}

function useCountdown(events) {
  const [countdown, setCountdown] = useState(null);

  useEffect(() => {
    if (!events || events.length === 0) return;

    function update() {
      const now = new Date();
      const upcoming = events
        .filter((e) => e.starts_at && utcToDate(e.starts_at) > now)
        .sort((a, b) => utcToDate(a.starts_at) - utcToDate(b.starts_at));

      if (upcoming.length === 0) {
        setCountdown(null);
        return;
      }

      const next = upcoming[0];
      const diff = utcToDate(next.starts_at) - now;
      if (diff <= 0) {
        setCountdown(null);
        return;
      }

      setCountdown({
        name: next.title,
        days: String(Math.floor(diff / (1000 * 60 * 60 * 24))).padStart(2, '0'),
        hours: String(Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))).padStart(2, '0'),
        mins: String(Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))).padStart(2, '0'),
        secs: String(Math.floor((diff % (1000 * 60)) / 1000)).padStart(2, '0'),
      });
    }

    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [events]);

  return countdown;
}

export default function Events() {
  useDocumentTitle('Events | MDGA');
  const { isLoggedIn, apiFetch, userTimezone } = useAuth();
  const location = useLocation();
  const [events, setEvents] = useState([]);
  const [filter, setFilter] = useState('all');
  const [rsvpState, setRsvpState] = useState({});
  const [highlightedEventId, setHighlightedEventId] = useState(null);
  const countdown = useCountdown(events);

  // Effective timezone: user preference or browser default
  const tz = userTimezone || Intl.DateTimeFormat().resolvedOptions().timeZone;

  useEffect(() => {
    (async () => {
      try {
        const res = await apiFetch('/events');
        const data = await res.json();
        const eventList = data.events || [];
        setEvents(eventList);

        // Populate RSVP state from server response (if user was authenticated)
        const initialRsvp = {};
        for (const evt of eventList) {
          if (evt.user_rsvp_status) {
            initialRsvp[evt.id] = evt.user_rsvp_status;
          }
        }
        if (Object.keys(initialRsvp).length > 0) {
          setRsvpState(initialRsvp);
        }
      } catch (err) {
        console.error('Failed to load events:', err);
      }
    })();
  }, [apiFetch]);

  useEffect(() => {
    if (!location.hash || events.length === 0) return undefined;
    if (!location.hash.startsWith('#event-')) return undefined;

    const targetId = Number(location.hash.replace('#event-', ''));
    if (!Number.isFinite(targetId)) return undefined;
    if (!events.some((event) => event.id === targetId)) return undefined;

    setFilter('all');

    const timeoutId = window.setTimeout(() => {
      const target = document.getElementById(`event-${targetId}`);
      if (!target) return;
      target.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setHighlightedEventId(targetId);
      window.setTimeout(() => {
        setHighlightedEventId((current) => (current === targetId ? null : current));
      }, 2200);
    }, 80);

    return () => window.clearTimeout(timeoutId);
  }, [location.hash, events]);

  const handleRsvp = useCallback(async (eventId, status) => {
    if (!isLoggedIn) return;

    const previousStatus = rsvpState[eventId] || null;

    setRsvpState((prev) => ({
      ...prev,
      [eventId]: status,
    }));

    try {
      const res = await apiFetch(`/events/${eventId}/rsvp`, {
        method: 'POST',
        body: JSON.stringify({ status }),
      });

      if (res.ok) {
        const data = await res.json();
        setEvents((prev) =>
          prev.map((e) =>
            e.id === eventId ? { ...e, rsvp_going: data.rsvp_going, rsvp_maybe: data.rsvp_maybe } : e
          )
        );
      } else {
        setRsvpState((prev) => ({
          ...prev,
          [eventId]: previousStatus,
        }));
      }
    } catch (err) {
      console.error('RSVP error:', err);
      setRsvpState((prev) => ({
        ...prev,
        [eventId]: previousStatus,
      }));
    }
  }, [isLoggedIn, apiFetch, rsvpState]);

  const filteredEvents = filter === 'all'
    ? events
    : events.filter((e) => safeCategory(e.category) === filter);

  // Upcoming events for "At a Glance"
  const now = new Date();
  const upcomingEvents = events
    .filter((e) => e.starts_at && utcToDate(e.starts_at) > now)
    .sort((a, b) => utcToDate(a.starts_at) - utcToDate(b.starts_at))
    .slice(0, 7);

  const tabs = [
    { key: 'all', label: 'All Events' },
    { key: 'pvp', label: 'PvP' },
    { key: 'defense', label: 'Defense' },
    { key: 'social', label: 'Social' },
    { key: 'raid', label: 'Raid' },
  ];

  return (
    <>
      <PageHero title="Guild Events" subtitle="Fight together, feast together" />

      {/* Countdown */}
      <section className="section section--dark">
        <div className="container">
          <h2 className="section-title">Next Event</h2>
          {countdown ? (
            <>
              <div className={styles.countdownEventName}>{countdown.name}</div>
              <div className={styles.countdown}>
                <div className={styles.countdownSegment}>
                  <span className={styles.countdownNumber}>{countdown.days}</span>
                  <span className={styles.countdownLabel}>Days</span>
                </div>
                <div className={styles.countdownSegment}>
                  <span className={styles.countdownNumber}>{countdown.hours}</span>
                  <span className={styles.countdownLabel}>Hours</span>
                </div>
                <div className={styles.countdownSegment}>
                  <span className={styles.countdownNumber}>{countdown.mins}</span>
                  <span className={styles.countdownLabel}>Minutes</span>
                </div>
                <div className={styles.countdownSegment}>
                  <span className={styles.countdownNumber}>{countdown.secs}</span>
                  <span className={styles.countdownLabel}>Seconds</span>
                </div>
              </div>
            </>
          ) : (
            <p className={styles.emptyNotice}>No upcoming events</p>
          )}
        </div>
      </section>

      {/* Event Cards */}
      <section className="section">
        <div className="container">
          <h2 className="section-title">Upcoming Events</h2>

          {/* Tabs */}
          <div className={styles.tabs}>
            {tabs.map((t) => (
              <button
                key={t.key}
                className={filter === t.key ? styles.tabActive : styles.tab}
                onClick={() => setFilter(t.key)}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* Cards */}
          {filteredEvents.length === 0 ? (
            <p className={styles.emptyNotice}>No events scheduled.</p>
          ) : (
            <div className="grid grid--3">
              {filteredEvents.map((event) => {
                const cat = safeCategory(event.category);
                const goingCount = event.rsvp_going || 0;
                const maybeCount = event.rsvp_maybe || 0;
                const myRsvp = rsvpState[event.id];

                return (
                  <Card
                    key={event.id}
                    id={`event-${event.id}`}
                    className={`${styles.eventCard} ${highlightedEventId === event.id ? styles.eventCardHighlighted : ''}`}
                  >
                    <div className={styles.eventDay}>
                      {formatEventDate(event.starts_at, tz)}
                    </div>
                    <h3 className={styles.eventTitle}>{event.title}</h3>
                    <p className={styles.eventTime}>
                      {formatEventTimeOnly(event.starts_at, tz)}
                      {event.ends_at && ` – ${formatEventTimeOnly(event.ends_at, tz)}`}
                      {' '}{getTimezoneAbbr(event.starts_at, tz)}
                    </p>
                    {event.description && (
                      <p className={styles.eventDesc}>{event.description}</p>
                    )}

                    {(goingCount > 0 || maybeCount > 0) && (
                      <div className={styles.rsvpInfo}>
                        {goingCount > 0 && <span className={styles.rsvpCountGoing}>{goingCount} going</span>}
                        {maybeCount > 0 && <span className={styles.rsvpCountMaybe}>{maybeCount} interested</span>}
                      </div>
                    )}

                    {isLoggedIn && (
                      <div className={styles.rsvpBtns}>
                        <button
                          className={myRsvp === 'going' ? styles.rsvpBtnGoingActive : styles.rsvpBtn}
                          onClick={() => handleRsvp(event.id, 'going')}
                        >
                          Going
                        </button>
                        <button
                          className={myRsvp === 'maybe' ? styles.rsvpBtnMaybeActive : styles.rsvpBtn}
                          onClick={() => handleRsvp(event.id, 'maybe')}
                        >
                          Interested
                        </button>
                        <button
                          className={myRsvp === 'not_going' ? styles.rsvpBtnNotGoingActive : styles.rsvpBtn}
                          onClick={() => handleRsvp(event.id, 'not_going')}
                        >
                          Not Going
                        </button>
                      </div>
                    )}

                    <div className={styles.eventFooter}>
                      <span className={styles[TAG_STYLES[cat]]}>{CATEGORY_LABELS[cat] || event.category}</span>
                      {event.series_id && (
                        <span className={styles.recurringBadge}>Recurring &middot; {event.series_index} of {event.series_total}</span>
                      )}
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {/* Schedule Bar */}
      {upcomingEvents.length > 0 && (
        <section className="section section--dark">
          <div className="container">
            <h2 className="section-title">At a Glance</h2>
            <div className={styles.scheduleCompact}>
              {upcomingEvents.map((e) => {
                const cat = safeCategory(e.category);
                return (
                  <div key={e.id} className={styles.scheduleRow}>
                    <span className={styles.scheduleDay}>
                      {formatEventDate(e.starts_at, tz).split(',')[0]}
                    </span>
                    <span className={styles[BAR_STYLES[cat]]} />
                    <span className={styles.scheduleInfo}>
                      <strong>{e.title}</strong>
                      <span>
                        {formatEventTimeOnly(e.starts_at, tz)}
                        {e.ends_at && ` – ${formatEventTimeOnly(e.ends_at, tz)}`}
                        {' '}{getTimezoneAbbr(e.starts_at, tz)}
                      </span>
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      )}

      {/* Action Shots */}
      <section className="section">
        <div className="container">
          <h2 className="section-title">Action Shots</h2>
          <div className="grid grid--2">
            <div className={styles.imageFrame}>
              <img src="/images/image-140.png" alt="PvP battle" />
              <div className={styles.imageCaption}>Warsong Gulch — Horde dominance</div>
            </div>
            <div className={styles.imageFrame}>
              <img src="/images/Screenshot_2026-02-06_18-22-48.png" alt="Guild raid" />
              <div className={styles.imageCaption}>Molten Core clear night</div>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
