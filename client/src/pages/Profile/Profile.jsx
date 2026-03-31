import { useState, useEffect, useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { timeAgo, armoryUrl, formatNumber } from '../../utils/helpers';
import { getTimezoneOptions } from '../../utils/timezone';
import styles from './Profile.module.css';

const WOW_CLASS_COLORS = {
  'Death Knight': '#C41E3A',
  'Demon Hunter': '#A330C9',
  Druid: '#FF7C0A',
  Evoker: '#33937F',
  Hunter: '#AAD372',
  Mage: '#3FC7EB',
  Monk: '#00FF98',
  Paladin: '#F48CBA',
  Priest: '#FFFFFF',
  Rogue: '#FFF468',
  Shaman: '#0070DD',
  Warlock: '#8788EE',
  Warrior: '#C69B6D',
};

function toNum(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeName(value) {
  return String(value || '').trim().toLowerCase();
}

function normalizeRealm(value) {
  return String(value || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
}

export default function Profile() {
  const { user, apiFetch, userTimezone, updateTimezone } = useAuth();
  const [tzEditing, setTzEditing] = useState(false);
  const [searchParams] = useSearchParams();

  const userId = searchParams.get('id') ? parseInt(searchParams.get('id'), 10) : user?.id;
  const isOwnProfile = userId === user?.id;

  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [flippedCardId, setFlippedCardId] = useState(null);

  const [overlayOpen, setOverlayOpen] = useState(false);
  const [overlayName, setOverlayName] = useState('');
  const [overlayRealm, setOverlayRealm] = useState('');
  const [overlayIsMain, setOverlayIsMain] = useState(false);
  const [overlayValidatedCharacter, setOverlayValidatedCharacter] = useState(null);
  const [overlayStatusType, setOverlayStatusType] = useState('');
  const [overlayStatusText, setOverlayStatusText] = useState('');
  const [overlaySearching, setOverlaySearching] = useState(false);
  const [overlaySaving, setOverlaySaving] = useState(false);
  const [allowedRealms, setAllowedRealms] = useState([]);

  useEffect(() => {
    fetch('/api/config/realms')
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data.realms)) {
          setAllowedRealms([...data.realms].sort((a, b) => a.localeCompare(b)));
        }
      })
      .catch(() => {});
  }, []);

  const displayName = profile?.user?.display_name || profile?.user?.username || 'Profile';
  useDocumentTitle(`${displayName} | MDGA`);

  const setOverlayStatus = (type, text) => {
    setOverlayStatusType(type || '');
    setOverlayStatusText(text || '');
  };

  const clearOverlayValidation = useCallback(() => {
    setOverlayValidatedCharacter(null);
  }, []);

  const loadProfile = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const res = await apiFetch(`/profile/${userId}`);
      if (!res.ok) {
        setProfile(null);
        return;
      }
      const data = await res.json();
      setProfile(data);
    } catch {
      setProfile(null);
    } finally {
      setLoading(false);
    }
  }, [userId, apiFetch]);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  useEffect(() => {
    if (overlayOpen) {
      document.body.classList.add('profile-overlay-open');
    } else {
      document.body.classList.remove('profile-overlay-open');
    }
    return () => {
      document.body.classList.remove('profile-overlay-open');
    };
  }, [overlayOpen]);

  useEffect(() => {
    if (!overlayOpen) return undefined;
    const onEsc = (event) => {
      if (event.key === 'Escape') {
        setOverlayOpen(false);
      }
    };
    document.addEventListener('keydown', onEsc);
    return () => {
      document.removeEventListener('keydown', onEsc);
    };
  }, [overlayOpen]);

  const openAddCharacterOverlay = () => {
    if (!isOwnProfile) return;
    setOverlayOpen(true);
    setOverlayName('');
    setOverlayRealm('');
    setOverlayIsMain(false);
    setOverlayValidatedCharacter(null);
    setOverlayStatus('', '');
  };

  const closeAddCharacterOverlay = () => {
    setOverlayOpen(false);
    setOverlaySearching(false);
    setOverlaySaving(false);
  };

  const handleOverlayNameChange = (value) => {
    setOverlayName(value);
    if (overlayValidatedCharacter) clearOverlayValidation();
    setOverlayStatus('', '');
  };

  const handleOverlayRealmChange = (value) => {
    setOverlayRealm(value);
    if (overlayValidatedCharacter) clearOverlayValidation();
    setOverlayStatus('', '');
  };

  const searchOverlayCharacter = async () => {
    const characterName = overlayName.trim();
    const realm = overlayRealm.trim();

    if (!characterName || !realm) {
      setOverlayStatus('error', 'Character name and realm are required.');
      return;
    }

    setOverlaySearching(true);
    setOverlayStatus('', '');
    setOverlayValidatedCharacter(null);

    try {
      const res = await apiFetch('/characters/lookup', {
        method: 'POST',
        body: JSON.stringify({ characterName, realm }),
      });

      const data = await res.json();
      if (!res.ok) {
        setOverlayStatus('error', data.error || 'Character validation failed.');
        return;
      }

      setOverlayValidatedCharacter(data.character || null);
      if (data.character?.characterName) {
        setOverlayName(data.character.characterName);
      }
      if (data.character?.realm) {
        setOverlayRealm(data.character.realm);
      }
      setOverlayStatus('success', 'Character validated. Review details and save.');
    } catch {
      setOverlayStatus('error', 'Failed to validate character.');
    } finally {
      setOverlaySearching(false);
    }
  };

  const submitOverlayAddCharacter = async (event) => {
    event.preventDefault();

    if (!overlayValidatedCharacter) {
      setOverlayStatus('error', 'Search and validate the character before saving.');
      return;
    }

    const sameName =
      normalizeName(overlayName) === normalizeName(overlayValidatedCharacter.characterName);
    const sameRealm =
      normalizeRealm(overlayRealm) === normalizeRealm(overlayValidatedCharacter.realm);

    if (!sameName || !sameRealm) {
      clearOverlayValidation();
      setOverlayStatus('error', 'Character details changed. Search again before saving.');
      return;
    }

    setOverlaySaving(true);
    setOverlayStatus('', '');

    try {
      const res = await apiFetch('/characters', {
        method: 'POST',
        body: JSON.stringify({
          characterName: overlayValidatedCharacter.characterName,
          realm: overlayValidatedCharacter.realm,
          realmSlug: overlayValidatedCharacter.realmSlug || undefined,
          class: overlayValidatedCharacter.class || undefined,
          spec: overlayValidatedCharacter.spec || undefined,
          level: overlayValidatedCharacter.level || undefined,
          race: overlayValidatedCharacter.race || undefined,
          itemLevel: overlayValidatedCharacter.itemLevel || undefined,
          mediaUrl: overlayValidatedCharacter.mediaUrl || undefined,
          isMain: overlayIsMain,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setOverlayStatus('error', data.error || 'Failed to add character.');
        return;
      }

      closeAddCharacterOverlay();
      setFlippedCardId(null);
      await loadProfile();
    } catch {
      setOverlayStatus('error', 'Failed to add character.');
    } finally {
      setOverlaySaving(false);
    }
  };

  const setMainCharacter = async (charId) => {
    try {
      const res = await apiFetch(`/characters/${charId}/main`, { method: 'PUT' });
      if (res.ok) {
        await loadProfile();
      }
    } catch {
      // no-op
    }
  };

  const deleteCharacter = async (charId) => {
    if (!window.confirm('Delete this character?')) return;
    try {
      const res = await apiFetch(`/characters/${charId}`, { method: 'DELETE' });
      if (res.ok) {
        if (flippedCardId === charId) setFlippedCardId(null);
        await loadProfile();
      }
    } catch {
      // no-op
    }
  };

  const refreshPvpStats = async () => {
    setRefreshing(true);
    try {
      const res = await apiFetch('/leaderboard/refresh', { method: 'POST' });
      if (res.ok) {
        await loadProfile();
      }
    } catch {
      // no-op
    } finally {
      setRefreshing(false);
    }
  };

  const onCardClick = (event, charId) => {
    if (event.target.closest('a, button, input, select, textarea, label, [data-no-flip="true"]')) {
      return;
    }
    setFlippedCardId((current) => (current === charId ? null : charId));
  };

  const onCardKeyDown = (event, charId) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    setFlippedCardId((current) => (current === charId ? null : charId));
  };

  if (loading) {
    return (
      <div className="container section">
        <p className={styles.empty}>Loading profile...</p>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="container section">
        <p className={styles.empty}>User not found.</p>
      </div>
    );
  }

  const characters = profile?.characters || [];
  const profileUser = profile?.user || {};
  const activity = profile?.activity || {};
  const avatarSrc = profileUser.avatar_url || '/images/default-avatar.svg';
  const mainChar = characters.find((c) => c.is_main) || characters[0];
  const faction = (mainChar?.faction || '').toLowerCase();

  return (
    <>
      <section className={`${styles.hero} ${faction === 'alliance' ? styles.heroAlliance : ''}`}>
        <div className={`${styles.heroInner} container`}>
          <div className={styles.heroContent}>
            <img
              src={avatarSrc}
              alt={profileUser.display_name || profileUser.username || 'Profile avatar'}
              className={styles.avatar}
            />
            <div className={styles.heroInfo}>
              <h1 className={styles.heroName}>{profileUser.display_name || profileUser.username}</h1>
              <div className={styles.heroMeta}>
                <span className={`rank-badge rank-badge--${profileUser.rank}`}>{profileUser.rank}</span>
                {profileUser.discord_username && <span>Discord: {profileUser.discord_username}</span>}
                <span>Joined {new Date(profileUser.created_at).toLocaleDateString()}</span>
                {isOwnProfile && (
                  tzEditing ? (
                    <select
                      className={styles.tzSelect}
                      value={userTimezone}
                      autoFocus
                      onChange={(e) => {
                        updateTimezone(e.target.value);
                        setTzEditing(false);
                      }}
                      onBlur={() => setTzEditing(false)}
                    >
                      {getTimezoneOptions().map((t) => (
                        <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>
                      ))}
                    </select>
                  ) : (
                    <button
                      type="button"
                      className={styles.tzButton}
                      onClick={() => setTzEditing(true)}
                      title="Click to change timezone"
                    >
                      {userTimezone.replace(/_/g, ' ')}
                    </button>
                  )
                )}
              </div>
              <div className={styles.forumStats}>
                <span className={styles.forumStat}>
                  <strong>{formatNumber(activity.posts)}</strong> posts
                </span>
                <span className={styles.forumStat}>
                  <strong>{formatNumber(activity.views)}</strong> views
                </span>
                <span className={styles.forumStat}>
                  <strong>{formatNumber(activity.comments)}</strong> comments
                </span>
              </div>
            </div>
          </div>

          {isOwnProfile && (
            <div className={styles.heroActions}>
              <button
                type="button"
                className={`btn btn--sm ${styles.heroAddButton}`}
                onClick={openAddCharacterOverlay}
              >
                Add Character
              </button>
            </div>
          )}
        </div>
      </section>

      <section className="section section--dark">
        <div className="container">
          <div className={styles.sectionHead}>
            <div>
              <h2 className={styles.sectionHeadTitle}>Characters</h2>
              <p className={styles.sectionHeadDesc}>
                Click a card to view full stat card details.
              </p>
            </div>
            {isOwnProfile && characters.length > 0 && (
              <div className={styles.sectionHeadActions}>
                <button
                  className="btn btn--secondary btn--sm"
                  onClick={refreshPvpStats}
                  disabled={refreshing}
                  type="button"
                >
                  {refreshing ? 'Refreshing...' : 'Refresh Stats'}
                </button>
              </div>
            )}
          </div>

          {characters.length === 0 ? (
            <div className={styles.empty}>
              {isOwnProfile
                ? 'No characters added yet. Use Add Character in the hero to search and save your first character.'
                : 'No characters added yet.'}
            </div>
          ) : (
            <div className={styles.charactersGrid}>
              {characters.map((char) => {
                const accent = WOW_CLASS_COLORS[char.class] || '#D4A017';
                const classSpec = [char.class, char.spec].filter(Boolean).join(' - ');
                const quickPills = [];
                if (toNum(char.solo_shuffle) > 0) {
                  quickPills.push(
                    <span key="shuffle" className={styles.charPvpItem}>
                      <strong>{formatNumber(char.solo_shuffle)}</strong> Shuffle
                    </span>
                  );
                }
                if (toNum(char.arena_3v3) > 0) {
                  quickPills.push(
                    <span key="3v3" className={styles.charPvpItem}>
                      <strong>{formatNumber(char.arena_3v3)}</strong> 3v3
                    </span>
                  );
                }
                if (toNum(char.arena_2v2) > 0) {
                  quickPills.push(
                    <span key="2v2" className={styles.charPvpItem}>
                      <strong>{formatNumber(char.arena_2v2)}</strong> 2v2
                    </span>
                  );
                }
                if (toNum(char.rbg_rating) > 0) {
                  quickPills.push(
                    <span key="rbg" className={styles.charPvpItem}>
                      <strong>{formatNumber(char.rbg_rating)}</strong> RBG
                    </span>
                  );
                }
                if (toNum(char.honorable_kills) > 0) {
                  quickPills.push(
                    <span key="hk" className={styles.charPvpItem}>
                      <strong>{formatNumber(char.honorable_kills)}</strong> HKs
                    </span>
                  );
                }
                if (toNum(char.killing_blows) > 0) {
                  quickPills.push(
                    <span key="kb" className={styles.charPvpItem}>
                      <strong>{formatNumber(char.killing_blows)}</strong> KBs
                    </span>
                  );
                }

                const details = [];
                if (char.race) details.push(char.race);
                if (char.level) details.push(`Level ${char.level}`);
                if (char.item_level) details.push(`${char.item_level} ilvl`);

                const arenaPlayed = toNum(char.arenas_played);
                const arenaWon = toNum(char.arenas_won);
                const arenaLost = toNum(char.arenas_lost);
                const bgPlayed = toNum(char.bgs_played);
                const bgWon = toNum(char.bgs_won);
                const bgLost = Math.max(bgPlayed - bgWon, 0);
                const arenaWinRate = arenaPlayed > 0 ? `${Math.round((arenaWon / arenaPlayed) * 100)}%` : '0%';
                const bgWinRate = bgPlayed > 0 ? `${Math.round((bgWon / bgPlayed) * 100)}%` : '0%';

                const flipped = flippedCardId === char.id;
                const mainCardClass = char.is_main ? styles.charCardMain : '';
                const flippedClass = flipped ? styles.charCardFlipped : '';

                return (
                  <article
                    key={char.id}
                    className={`${styles.charCard} ${mainCardClass} ${flippedClass}`.trim()}
                    style={{ '--class-accent': accent }}
                    tabIndex={0}
                    role="button"
                    aria-expanded={flipped ? 'true' : 'false'}
                    aria-label={`Toggle detailed stats for ${char.character_name}`}
                    onClick={(event) => onCardClick(event, char.id)}
                    onKeyDown={(event) => onCardKeyDown(event, char.id)}
                  >
                    <div className={`${styles.charFace} ${styles.charFaceFront}`}>
                      <div className={styles.charMedia}>
                        {char.media_url ? (
                          <img src={char.media_url} alt={char.character_name} className={styles.charRender} />
                        ) : (
                          <div className={styles.charMediaPlaceholder}>Character render unavailable</div>
                        )}
                      </div>

                      <div className={styles.charBody}>
                        <div className={styles.charTop}>
                          <div className={styles.charName}>{char.character_name}</div>
                          {char.is_main ? <span className={styles.charMainBadge}>MAIN</span> : <span className={styles.charAltBadge}>ALT</span>}
                        </div>
                        <div className={styles.charRealm}>
                          {char.realm}
                          {char.guild_name && <span className={styles.charGuild}> &lt;{char.guild_name}&gt;</span>}
                        </div>
                        {classSpec && <div className={styles.charClass}>{classSpec}</div>}
                        {details.length > 0 && <div className={styles.charDetails}>{details.join(' - ')}</div>}

                        <div className={`${styles.charPvp} ${quickPills.length === 0 ? styles.charPvpEmpty : ''}`}>
                          {quickPills.length > 0 ? quickPills : (
                            <span className={styles.charPvpItem}>No stat snapshot yet</span>
                          )}
                        </div>

                        <div className={styles.charFooter}>
                          <a
                            href={armoryUrl(char.realm_slug, char.character_name)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={styles.armoryLink}
                            data-no-flip="true"
                            onClick={(event) => event.stopPropagation()}
                          >
                            &#9876; Armory
                          </a>
                          {isOwnProfile && (
                            <div className={styles.charActions} data-no-flip="true">
                              {!char.is_main && (
                                <button
                                  type="button"
                                  className={`btn btn--secondary btn--sm ${styles.charActionBtn}`}
                                  data-no-flip="true"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    setMainCharacter(char.id);
                                  }}
                                >
                                  Set Main
                                </button>
                              )}
                              <button
                                type="button"
                                className={`btn btn--danger btn--sm ${styles.charActionBtn}`}
                                data-no-flip="true"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  deleteCharacter(char.id);
                                }}
                              >
                                Delete
                              </button>
                            </div>
                          )}
                        </div>

                        <div className={styles.charFlipHint}>Click to view full stat card</div>
                      </div>
                    </div>

                    <div className={`${styles.charFace} ${styles.charFaceBack}`}>
                      <div className={styles.charBody}>
                        <div className={styles.charTop}>
                          <div className={styles.charName}>{char.character_name} Stats</div>
                          {char.is_main ? <span className={styles.charMainBadge}>MAIN</span> : <span className={styles.charAltBadge}>ALT</span>}
                        </div>
                        <div className={styles.charRealm}>{char.realm}</div>
                        {classSpec && <div className={styles.charClass}>{classSpec}</div>}
                        {details.length > 0 && <div className={styles.charDetails}>{details.join(' - ')}</div>}

                        {char.fetched_at ? (
                          <>
                            <div className={styles.charStatsGrid}>
                              <div className={styles.charStat}><span className={styles.charStatLabel}>Solo Shuffle</span><span className={styles.charStatValue}>{formatNumber(char.solo_shuffle)}</span></div>
                              <div className={styles.charStat}><span className={styles.charStatLabel}>3v3</span><span className={styles.charStatValue}>{formatNumber(char.arena_3v3)}</span></div>
                              <div className={styles.charStat}><span className={styles.charStatLabel}>2v2</span><span className={styles.charStatValue}>{formatNumber(char.arena_2v2)}</span></div>
                              <div className={styles.charStat}><span className={styles.charStatLabel}>RBG</span><span className={styles.charStatValue}>{formatNumber(char.rbg_rating)}</span></div>
                              <div className={styles.charStat}><span className={styles.charStatLabel}>Arena Record</span><span className={styles.charStatValue}>{formatNumber(arenaWon)}-{formatNumber(arenaLost)} ({arenaWinRate})</span></div>
                              <div className={styles.charStat}><span className={styles.charStatLabel}>BG Record</span><span className={styles.charStatValue}>{formatNumber(bgWon)}-{formatNumber(bgLost)} ({bgWinRate})</span></div>
                              <div className={styles.charStat}><span className={styles.charStatLabel}>Honorable Kills</span><span className={styles.charStatValue}>{formatNumber(char.honorable_kills)}</span></div>
                              <div className={styles.charStat}><span className={styles.charStatLabel}>Killing Blows</span><span className={styles.charStatValue}>{formatNumber(char.killing_blows)}</span></div>
                              <div className={styles.charStat}><span className={styles.charStatLabel}>Dungeons</span><span className={styles.charStatValue}>{formatNumber(char.dungeons_entered)}</span></div>
                              <div className={styles.charStat}><span className={styles.charStatLabel}>Raids</span><span className={styles.charStatValue}>{formatNumber(char.raids_entered)}</span></div>
                              <div className={styles.charStat}><span className={styles.charStatLabel}>Quests</span><span className={styles.charStatValue}>{formatNumber(char.quests_completed)}</span></div>
                              <div className={styles.charStat}><span className={styles.charStatLabel}>Achievement Pts</span><span className={styles.charStatValue}>{formatNumber(char.achievement_points)}</span></div>
                            </div>
                            <p className={styles.charUpdated}>Updated {timeAgo(char.fetched_at)}</p>
                          </>
                        ) : (
                          <p className={styles.charNoStats}>No synced stats yet. Save or refresh to populate this card.</p>
                        )}

                        <div className={styles.charFooter}>
                          <a
                            href={armoryUrl(char.realm_slug, char.character_name)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={styles.armoryLink}
                            data-no-flip="true"
                            onClick={(event) => event.stopPropagation()}
                          >
                            &#9876; Armory
                          </a>
                        </div>

                        <div className={`${styles.charFlipHint} ${styles.charFlipHintBack}`}>
                          Click to return to summary
                        </div>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {overlayOpen && (
        <div className={styles.overlay}>
          <button
            className={styles.overlayBackdrop}
            onClick={closeAddCharacterOverlay}
            aria-label="Close add character dialog"
            type="button"
          />
          <div className={styles.overlayDialog} role="dialog" aria-modal="true" aria-labelledby="add-char-title">
            <button
              type="button"
              className={styles.overlayClose}
              onClick={closeAddCharacterOverlay}
              aria-label="Close"
            >
              x
            </button>

            <h3 id="add-char-title" className={styles.overlayTitle}>Add Character</h3>
            <p className={styles.overlaySubtitle}>
              Search by name and realm to validate from Blizzard before saving.
            </p>

            <form onSubmit={submitOverlayAddCharacter}>
              <div className={styles.overlaySearchRow}>
                <div className={styles.field}>
                  <label htmlFor="overlay-char-name">Character Name *</label>
                  <input
                    id="overlay-char-name"
                    type="text"
                    value={overlayName}
                    maxLength={100}
                    onChange={(event) => handleOverlayNameChange(event.target.value)}
                    placeholder="e.g. Thrall"
                    required
                  />
                </div>
                <div className={styles.field}>
                  <label htmlFor="overlay-char-realm">Realm *</label>
                  <select
                    id="overlay-char-realm"
                    value={overlayRealm}
                    onChange={(event) => handleOverlayRealmChange(event.target.value)}
                    required
                  >
                    <option value="">Select realm...</option>
                    {allowedRealms.map((realm) => (
                      <option key={realm} value={realm}>{realm}</option>
                    ))}
                  </select>
                </div>
                <button
                  type="button"
                  className="btn btn--secondary btn--sm"
                  onClick={searchOverlayCharacter}
                  disabled={overlaySearching}
                >
                  {overlaySearching ? 'Searching...' : 'Search'}
                </button>
              </div>

              <div className={`${styles.field} ${styles.checkboxField}`}>
                <input
                  id="overlay-char-main"
                  type="checkbox"
                  checked={overlayIsMain}
                  onChange={(event) => setOverlayIsMain(event.target.checked)}
                />
                <label htmlFor="overlay-char-main">Set as main character</label>
              </div>

              {(overlayStatusText || overlayValidatedCharacter) && (
                <p className={`${styles.status} ${overlayStatusType === 'error' ? styles.statusError : ''} ${overlayStatusType === 'success' ? styles.statusSuccess : ''}`}>
                  {overlayStatusText}
                </p>
              )}

              {overlayValidatedCharacter && (
                <div className={styles.result}>
                  <div className={styles.resultHead}>
                    {overlayValidatedCharacter.mediaUrl ? (
                      <img
                        src={overlayValidatedCharacter.mediaUrl}
                        alt={overlayValidatedCharacter.characterName}
                        className={styles.resultMedia}
                      />
                    ) : (
                      <div className={styles.resultMedia} />
                    )}
                    <div>
                      <div className={styles.resultName}>{overlayValidatedCharacter.characterName}</div>
                      <div className={styles.resultMeta}>{overlayValidatedCharacter.realm}</div>
                    </div>
                  </div>

                  <div className={styles.resultPills}>
                    <span className={styles.pill}>
                      {[overlayValidatedCharacter.class, overlayValidatedCharacter.spec].filter(Boolean).join(' - ') || 'Class/spec unavailable'}
                    </span>
                    {overlayValidatedCharacter.race && <span className={styles.pill}>{overlayValidatedCharacter.race}</span>}
                    {overlayValidatedCharacter.level && <span className={styles.pill}>Level {overlayValidatedCharacter.level}</span>}
                    {overlayValidatedCharacter.itemLevel && <span className={styles.pill}>{overlayValidatedCharacter.itemLevel} ilvl</span>}
                    {overlayValidatedCharacter.guildName && <span className={styles.pill}>&lt;{overlayValidatedCharacter.guildName}&gt;</span>}
                  </div>
                </div>
              )}

              <div className={styles.overlayActions}>
                <button type="button" className="btn btn--secondary btn--sm" onClick={closeAddCharacterOverlay}>
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn--primary btn--sm"
                  disabled={!overlayValidatedCharacter || overlaySaving}
                >
                  {overlaySaving ? 'Saving...' : 'Save Character'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
