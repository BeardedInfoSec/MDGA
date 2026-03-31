import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { timeAgo } from '../../utils/helpers';
import { formatEventTime } from '../../utils/timezone';
import styles from './Home.module.css';

const EVENT_TAG_CLASS = {
  pvp: styles.dashEventTagPvp,
  defense: styles.dashEventTagDefense,
  social: styles.dashEventTagSocial,
  raid: styles.dashEventTagRaid,
};
const DEFAULT_HOME_BACKGROUND_IMAGE = '/images/Screenshot_2026-02-06_18-21-39.png';

export default function Home() {
  useDocumentTitle('Make Durotar Great Again | #1 PvP Guild NA');
  const { isLoggedIn, user, apiFetch, userTimezone } = useAuth();
  const [dashboard, setDashboard] = useState(null);
  const [dashboardRsvpState, setDashboardRsvpState] = useState({});
  const [dashboardLoading, setDashboardLoading] = useState(false);
  const [dashboardError, setDashboardError] = useState('');
  const [carouselImages, setCarouselImages] = useState([]);
  const [homeBackgroundUrl, setHomeBackgroundUrl] = useState(DEFAULT_HOME_BACKGROUND_IMAGE);
  const [slide, setSlide] = useState(0);

  // Fetch carousel images (public endpoint, no auth needed)
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/carousel');
        if (res.ok) {
          const data = await res.json();
          setCarouselImages(data.images || []);
          setHomeBackgroundUrl(data.backgroundImageUrl || DEFAULT_HOME_BACKGROUND_IMAGE);
        }
      } catch { /* silent */ }
    })();
  }, []);

  useEffect(() => {
    const safeUrl = (homeBackgroundUrl || DEFAULT_HOME_BACKGROUND_IMAGE).replace(/"/g, '%22');
    document.documentElement.style.setProperty('--home-bg-image', `url("${safeUrl}")`);
  }, [homeBackgroundUrl]);

  const imageCount = carouselImages.length;
  const nextSlide = useCallback(() => {
    if (imageCount > 0) setSlide((s) => (s + 1) % imageCount);
  }, [imageCount]);
  const prevSlide = useCallback(() => {
    if (imageCount > 0) setSlide((s) => (s - 1 + imageCount) % imageCount);
  }, [imageCount]);

  // Auto-advance every 5s
  useEffect(() => {
    if (imageCount === 0) return;
    const timer = setInterval(nextSlide, 5000);
    return () => clearInterval(timer);
  }, [nextSlide, imageCount]);

  const loadDashboard = useCallback(async () => {
    if (!isLoggedIn) {
      setDashboard(null);
      return;
    }

    setDashboardLoading(true);
    setDashboardError('');

    try {
      const res = await apiFetch('/dashboard');
      if (!res.ok) throw new Error(`Dashboard request failed with status ${res.status}`);
      const data = await res.json();
      setDashboard(data);
    } catch (err) {
      console.error('Failed to load dashboard:', err);
      setDashboardError('Unable to load dashboard activity right now. Please try again.');
    } finally {
      setDashboardLoading(false);
    }
  }, [isLoggedIn, apiFetch]);

  useEffect(() => {
    if (!isLoggedIn) {
      setDashboard(null);
      setDashboardRsvpState({});
      setDashboardError('');
      setDashboardLoading(false);
      return;
    }
    loadDashboard();
  }, [isLoggedIn, loadDashboard]);

  useEffect(() => {
    const next = {};
    (dashboard?.events || []).forEach((event) => {
      if (event.user_rsvp_status) {
        next[event.id] = event.user_rsvp_status;
      }
    });
    setDashboardRsvpState(next);
  }, [dashboard?.events]);

  const stats = dashboard?.stats;
  const topRating = stats?.mainCharacter
    ? Math.max(
        stats.mainCharacter.solo_shuffle || 0,
        stats.mainCharacter.arena_3v3 || 0,
        stats.mainCharacter.arena_2v2 || 0,
        stats.mainCharacter.rbg_rating || 0,
      )
    : 0;
  const mythicPlusRating = stats?.mainCharacter?.mythic_plus_rating || 0;

  const handleDashboardRsvp = useCallback(async (eventId, status) => {
    if (!isLoggedIn) return;

    const previousStatus = dashboardRsvpState[eventId] || null;
    setDashboardRsvpState((prev) => ({ ...prev, [eventId]: status }));

    try {
      const res = await apiFetch(`/events/${eventId}/rsvp`, {
        method: 'POST',
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error(`RSVP request failed with status ${res.status}`);

      const data = await res.json();
      setDashboard((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          events: (prev.events || []).map((event) => (
            event.id === eventId
              ? {
                ...event,
                rsvp_going: data.rsvp_going || 0,
                rsvp_maybe: data.rsvp_maybe || 0,
                user_rsvp_status: data.userStatus || status,
              }
              : event
          )),
        };
      });
    } catch (err) {
      console.error('Dashboard RSVP error:', err);
      setDashboardRsvpState((prev) => ({ ...prev, [eventId]: previousStatus }));
    }
  }, [isLoggedIn, apiFetch, dashboardRsvpState]);

  return (
    <>
      {/* Hero â€” only for visitors */}
      {!isLoggedIn && (
        <section className={styles.hero}>
          <div className={styles.heroBg}>
            <img src={homeBackgroundUrl || DEFAULT_HOME_BACKGROUND_IMAGE} alt="MDGA guild assembled in Durotar" />
          </div>
          <div className={styles.heroOverlay} />
          <div className={styles.heroContent}>
            <h1 className={`${styles.heroTitle} text-shimmer`}>Make Durotar<br />Great Again</h1>
            <p className={styles.heroTagline}>"For the Horde. For Durotar. For Glory."</p>
            <p className={styles.heroSubtitle}>The #1 PvP Guild in North America &bull; Tichondrius-US</p>
            <div className={styles.heroCta}>
              <Link to="/join" className="btn btn--primary btn--lg">Join the Fight</Link>
              <Link to="/story" className="btn btn--gold btn--lg">Our Story</Link>
            </div>
          </div>
          <div className={styles.heroScroll} aria-hidden="true">&#8595;</div>
        </section>
      )}

      {/* Stats Bar â€” visitors only */}
      {!isLoggedIn && (
        <section className={styles.statsBar}>
          <div className="container">
            <div className="grid grid--4">
              {[
                { number: '#1', label: 'NA PvP Rating' },
                { number: '100v100', label: 'Largest Battle' },
                { number: '4+', label: 'Server Shards' },
                { number: 'Jan 2025', label: 'Founded' },
              ].map((s) => (
                <div key={s.label} className="stat">
                  <span className="stat__number">{s.number}</span>
                  <span className="stat__label">{s.label}</span>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Guild Photo â€” visitors only */}
      {!isLoggedIn && (
        <section className="section section--dark">
          <div className="container">
            <h2 className="section-title">The Warband Assembled</h2>
            <div className={styles.guildPhoto}>
              <img src="/images/Screenshot_2025-05-27_214251.png" alt="MDGA guild members gathered in the red sands of Durotar" />
              <p className={styles.guildPhotoCaption}>Our warriors assembled in the red sands of Durotar</p>
            </div>
          </div>
        </section>
      )}

      {/* About Brief â€” visitors only */}
      {!isLoggedIn && (
        <section className="section section--darker">
          <div className="container container--narrow">
            <h2 className="section-title">Forged in Blood and Dust</h2>
            <p className={styles.aboutBrief}>
              Born on Tichondrius server on January 1st, 2025, <strong>Make Durotar Great Again</strong>{' '}
              rose from a small band of warriors to the <strong>#1 PvP guild in North America</strong>.
              Founded by GM Cawkadoodle and Chieftain Druzak, MDGA was built on one
              principle: <em>Durotar belongs to the Horde.</em>
            </p>
            <div className="text-center mt-8">
              <Link to="/story" className="btn btn--gold">Read Our Full Story</Link>
            </div>
          </div>
        </section>
      )}

      {/* Member Dashboard */}
      {isLoggedIn && (
        <div className={styles.authBackdrop}>
          <section className={`section ${styles.dashSection}`}>
          <div className={`container ${styles.dashContent}`}>
            <div className={styles.dashHeader}>
              <div className={styles.dashWelcome}>
                <span className={styles.dashEyebrow}>Home Command</span>
                <h2 className={styles.dashWelcomeTitle}>
                  Welcome back, {user?.displayName || user?.username}
                </h2>
                <div className={styles.dashWelcomeMeta}>
                  <span className={`rank-badge rank-badge--${user?.rank}`}>{user?.rank}</span>
                  <span className={styles.dashWelcomeText}>Track events, forum posts, and guild updates in one place.</span>
                </div>
              </div>
            </div>

            {dashboardLoading && (
              <div className={styles.dashStateCard}>
                <p className={styles.dashStateTitle}>Loading your latest guild activity...</p>
                <p className={styles.dashStateHint}>Please wait while we pull forum, events, and character data.</p>
              </div>
            )}

            {!dashboardLoading && dashboardError && (
              <div className={styles.dashStateCard}>
                <p className={styles.dashStateTitle}>{dashboardError}</p>
                <button type="button" className="btn btn--secondary btn--sm" onClick={loadDashboard}>
                  Retry
                </button>
              </div>
            )}

            {!dashboardLoading && !dashboardError && dashboard && (
              <>
                <div className={styles.dashStats}>
                  <div className={styles.dashStat}>
                    <span className={styles.dashStatValue}>{stats?.posts ?? 0}</span>
                    <span className={styles.dashStatLabel}>Forum Posts</span>
                  </div>
                  <div className={styles.dashStat}>
                    <span className={styles.dashStatValue}>{stats?.comments ?? 0}</span>
                    <span className={styles.dashStatLabel}>Replies</span>
                  </div>
                  <div className={styles.dashStat}>
                    <span className={styles.dashStatValue}>{stats?.characters ?? 0}</span>
                    <span className={styles.dashStatLabel}>Characters</span>
                  </div>
                  <div className={styles.dashStat}>
                    <span className={styles.dashStatValue}>{topRating}</span>
                    <span className={styles.dashStatLabel}>Top PvP Rating</span>
                  </div>
                  <div className={styles.dashStat}>
                    <span className={styles.dashStatValue}>{mythicPlusRating}</span>
                    <span className={styles.dashStatLabel}>M+ Rating</span>
                  </div>
                </div>

                <div className={styles.dashPanels}>
                  <div className={styles.dashPanel}>
                    <h3 className={styles.dashPanelTitle}>Recent Forum Activity</h3>
                    <div>
                      {(dashboard.recentPosts || []).length > 0
                        ? dashboard.recentPosts.map((p) => (
                            <Link key={p.id} to={`/forum/post/${p.id}`} className={styles.dashActivityItem}>
                              <span className={styles.dashActivityTitle}>{p.title}</span>
                              <span className={styles.dashActivityMeta}>
                                {p.category_name} &bull; {p.comment_count} replies &bull; {timeAgo(p.created_at)}
                              </span>
                            </Link>
                          ))
                        : <p className={styles.dashEmpty}>No recent posts.</p>
                      }
                    </div>
                    <Link to="/forum" className={styles.dashPanelLink}>View Forum &rarr;</Link>
                  </div>

                  <div className={styles.dashPanel}>
                    <h3 className={styles.dashPanelTitle}>Upcoming Events</h3>
                    <div>
                      {(dashboard.events || []).length > 0
                        ? dashboard.events.map((e) => {
                            const currentRsvp = dashboardRsvpState[e.id] || e.user_rsvp_status || null;
                            return (
                              <div key={e.id} className={styles.dashEventItem}>
                                <Link to={`/events#event-${e.id}`} className={`${styles.dashEvent} ${styles.dashEventLink}`}>
                                  <span className={`${styles.dashEventTag} ${EVENT_TAG_CLASS[e.category] || ''}`}>{e.category}</span>
                                  <strong>{e.title}</strong>
                                  <span className={styles.dashEventTime}>{e.starts_at ? formatEventTime(e.starts_at, userTimezone) : 'Unscheduled'}</span>
                                  {(e.rsvp_going > 0 || e.rsvp_maybe > 0) && (
                                    <span className={styles.dashEventRsvp}>
                                      {e.rsvp_going || 0} going{e.rsvp_maybe > 0 ? ` \u2022 ${e.rsvp_maybe} interested` : ''}
                                    </span>
                                  )}
                                </Link>
                                <div className={styles.dashEventActions}>
                                  <button
                                    type="button"
                                    className={currentRsvp === 'maybe' ? styles.dashRsvpBtnInterestedActive : styles.dashRsvpBtn}
                                    onClick={() => handleDashboardRsvp(e.id, 'maybe')}
                                  >
                                    Interested
                                  </button>
                                  <button
                                    type="button"
                                    className={currentRsvp === 'going' ? styles.dashRsvpBtnGoingActive : styles.dashRsvpBtn}
                                    onClick={() => handleDashboardRsvp(e.id, 'going')}
                                  >
                                    Going
                                  </button>
                                  <button
                                    type="button"
                                    className={currentRsvp === 'not_going' ? styles.dashRsvpBtnNotGoingActive : styles.dashRsvpBtn}
                                    onClick={() => handleDashboardRsvp(e.id, 'not_going')}
                                  >
                                    Not Going
                                  </button>
                                </div>
                              </div>
                            );
                          })
                        : <p className={styles.dashEmpty}>No upcoming events.</p>
                      }
                    </div>
                    <Link to="/events" className={styles.dashPanelLink}>View Events &rarr;</Link>
                  </div>
                </div>

                <div className={styles.dashPanels}>
                  <div className={styles.dashPanel}>
                    <h3 className={styles.dashPanelTitle}>Recent Guild Activity</h3>
                    <div>
                      {(dashboard.guildActivity || []).length > 0
                        ? dashboard.guildActivity.map((a, i) => (
                            <div key={i} className={styles.dashActivityItem}>
                              <span className={styles.dashActivityTitle}>{a.description}</span>
                              <span className={styles.dashActivityMeta}>
                                {a.activity_type}{a.character_name ? ` \u2022 ${a.character_name}` : ''} &bull; {timeAgo(a.occurred_at)}
                              </span>
                            </div>
                          ))
                        : <p className={styles.dashEmpty}>No recent guild activity.</p>
                      }
                    </div>
                  </div>

                  <div className={styles.dashPanel}>
                    <h3 className={styles.dashPanelTitle}>Guild Achievements</h3>
                    <div>
                      {(dashboard.guildAchievements || []).length > 0
                        ? dashboard.guildAchievements.map((a, i) => (
                            <div key={i} className={styles.dashActivityItem}>
                              <span className={styles.dashActivityTitle}>{a.achievement_name}</span>
                              <span className={styles.dashActivityMeta}>
                                {a.description ? `${a.description} \u2022 ` : ''}{timeAgo(a.completed_at)}
                              </span>
                            </div>
                          ))
                        : <p className={styles.dashEmpty}>No guild achievements yet.</p>
                      }
                    </div>
                  </div>
                </div>
              </>
            )}

            {!dashboardLoading && !dashboardError && !dashboard && (
              <div className={styles.dashStateCard}>
                <p className={styles.dashStateTitle}>No dashboard activity found yet.</p>
                <p className={styles.dashStateHint}>Jump into events or forum activity to populate your command center.</p>
              </div>
            )}
          </div>
          </section>

      {/* Guild Announcements Feed â€” auth only */}
      {dashboard && (dashboard.announcements || []).length > 0 && (
        <section className={`section ${styles.authUpdatesSection}`}>
          <div className="container">
            <h2 className="section-title">Latest Updates</h2>
            <div className={styles.updatesFeed}>
              {dashboard.announcements.map((post) => (
                <Link key={post.id} to={`/forum/post/${post.id}`} className={styles.updateCard}>
                  <div className={styles.updateAuthor}>
                    <img
                      src={post.avatar_url || '/images/default-avatar.svg'}
                      alt=""
                      className={styles.updateAvatar}
                    />
                    <div>
                      <span className={styles.updateName}>{post.display_name || post.username}</span>
                      <span className={`rank-badge rank-badge--${post.user_rank}`}>{post.user_rank}</span>
                    </div>
                    <span className={styles.updateTime}>{timeAgo(post.created_at)}</span>
                  </div>
                  <h3 className={styles.updateTitle}>{post.title}</h3>
                  <p className={styles.updatePreview}>
                    {(post.content || '').length > 200
                      ? post.content.substring(0, 200) + '...'
                      : post.content}
                  </p>
                  <div className={styles.updateMeta}>
                    <span>Guild Announcements</span>
                    <span>&#9650; {post.net_votes || 0}</span>
                    <span>&#128065; {post.view_count || 0}</span>
                    <span>&#128172; {post.comment_count || 0}</span>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}
      {carouselImages.length > 0 && (
        <section className={`section ${styles.authUpdatesSection}`}>
          <div className="container">
            <h2 className="section-title">Scenes from the Battlefield</h2>
            <div className={styles.carousel}>
              <button className={styles.carouselBtn} onClick={prevSlide} aria-label="Previous image">&#10094;</button>
              <div className={styles.carouselViewport}>
                <div
                  className={styles.carouselTrack}
                  style={{ transform: `translateX(-${slide * 100}%)` }}
                >
                  {carouselImages.map((img) => (
                    <div key={img.id} className={styles.carouselSlide}>
                      <img src={img.image_url} alt={img.alt_text} />
                    </div>
                  ))}
                </div>
              </div>
              <button className={styles.carouselBtn} onClick={nextSlide} aria-label="Next image">&#10095;</button>
            </div>
            <div className={styles.carouselDots}>
              {carouselImages.map((_, i) => (
                <button
                  key={i}
                  className={`${styles.carouselDot} ${i === slide ? styles.carouselDotActive : ''}`}
                  onClick={() => setSlide(i)}
                  aria-label={`Go to image ${i + 1}`}
                />
              ))}
            </div>
          </div>
        </section>
      )}
        </div>
      )}

      {/* Image Carousel â€” visitors only */}
      {!isLoggedIn && carouselImages.length > 0 && (
        <section className="section section--dark">
          <div className="container">
            <h2 className="section-title">Scenes from the Battlefield</h2>
            <div className={styles.carousel}>
              <button className={styles.carouselBtn} onClick={prevSlide} aria-label="Previous image">&#10094;</button>
              <div className={styles.carouselViewport}>
                <div
                  className={styles.carouselTrack}
                  style={{ transform: `translateX(-${slide * 100}%)` }}
                >
                  {carouselImages.map((img) => (
                    <div key={img.id} className={styles.carouselSlide}>
                      <img src={img.image_url} alt={img.alt_text} />
                    </div>
                  ))}
                </div>
              </div>
              <button className={styles.carouselBtn} onClick={nextSlide} aria-label="Next image">&#10095;</button>
            </div>
            <div className={styles.carouselDots}>
              {carouselImages.map((_, i) => (
                <button
                  key={i}
                  className={`${styles.carouselDot} ${i === slide ? styles.carouselDotActive : ''}`}
                  onClick={() => setSlide(i)}
                  aria-label={`Go to image ${i + 1}`}
                />
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Visitor-only: Leadership Preview */}
      {!isLoggedIn && (
        <section className="section section--darker">
          <div className="container">
            <h2 className="section-title">Our Leaders</h2>
            <div className="grid grid--2">
              {[
                { rank: 'Guild Master', name: 'Cawkadoodle', cls: 'Blood Death Knight', desc: 'Co-founder and commanding presence on the battlefield. Under his leadership, MDGA grew from a handful of recruits into the #1 PvP force in North America.' },
                { rank: 'Chieftain', name: 'Druzak', cls: 'Hunter', desc: "Co-founder and tactical mastermind. Druzak coordinates the flanks and built the recruitment pipeline that fueled MDGA's explosive growth across multiple server shards." },
              ].map((l) => (
                <div key={l.name} className={`card ${styles.leaderPreview}`}>
                  <span className={styles.leaderRank}>{l.rank}</span>
                  <h3 className={styles.leaderName}>{l.name}</h3>
                  <p className={styles.leaderClass}>{l.cls}</p>
                  <p className={styles.leaderDesc}>{l.desc}</p>
                </div>
              ))}
            </div>
            <div className="text-center mt-8">
              <Link to="/leadership" className="btn btn--gold">Meet the Full Leadership</Link>
            </div>
          </div>
        </section>
      )}

      {/* PvP Achievements â€” visitors only */}
      {!isLoggedIn && (
        <section className="section section--dark">
          <div className="container">
            <h2 className="section-title">PvP Dominance</h2>
            <div className="grid grid--2">
              <div className={styles.imageFrame}>
                <img src="/images/highest_shuff_ratig.png" alt="Solo Arena 3102 Rating" />
                <div className={styles.imageCaption}>Solo Shuffle - 3102 Rating</div>
              </div>
              <div className={styles.imageFrame}>
                <img src="/images/image3.png" alt="PvP Rating Overview" />
                <div className={styles.imageCaption}>PvP Season Ratings</div>
              </div>
            </div>
            <div className="text-center mt-8">
              <a href="https://www.pvpleaderboard.com/statistics#guild" target="_blank" rel="noopener noreferrer" className="btn btn--gold">PvP Leaderboard Stats</a>
              {' '}
              <a href="https://check-pvp.com/guild/us/tichondrius/MAKE%20DUROTAR%20GREAT%20AGAIN" target="_blank" rel="noopener noreferrer" className="btn btn--gold">Check-PvP Guild Page</a>
            </div>
          </div>
        </section>
      )}

      {/* CTA Banner â€” visitors only */}
      {!isLoggedIn && (
        <section className={`section ${styles.ctaBanner}`}>
          <div className="container text-center">
            <h2>Ready to Defend Durotar?</h2>
            <p>Join hundreds of Horde warriors. Discord required. Glory guaranteed.</p>
            <Link to="/join" className="btn btn--primary btn--lg">Enlist Now</Link>
          </div>
        </section>
      )}
    </>
  );
}
