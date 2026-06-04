import { useState, useEffect, useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { timeAgo, armoryUrl, formatNumber } from '../../utils/helpers';
import { getTimezoneOptions } from '../../utils/timezone';
import { primaryName, secondaryName } from '../../utils/userDisplay';
import GuildFlag from '../../components/common/GuildFlag';
import NotificationPrefs from '../../components/common/NotificationPrefs';
import AFKNotice from '../../components/common/AFKNotice';
import settingsStyles from '../../components/common/NotificationPrefs.module.css';
import { CLASS_SPECS } from '../../data/wowClassSpecs';
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
  const { user, apiFetch, userTimezone, updateTimezone, isOfficer } = useAuth();
  const [tzEditing, setTzEditing] = useState(false);
  const [searchParams] = useSearchParams();

  const userId = searchParams.get('id') ? parseInt(searchParams.get('id'), 10) : user?.id;
  const isOwnProfile = userId === user?.id;

  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [flippedCardId, setFlippedCardId] = useState(null);
  // Inline spec-edit state — which character's spec form is open + drafts
  // for the two dropdowns. Save calls PATCH /api/characters/:id/specs.
  const [editingSpecsId, setEditingSpecsId] = useState(null);
  const [draftMainSpec, setDraftMainSpec] = useState('');
  const [draftOffSpec, setDraftOffSpec] = useState('');
  const [savingSpecs, setSavingSpecs] = useState(false);

  const [overlayOpen, setOverlayOpen] = useState(false);
  const [overlayName, setOverlayName] = useState('');
  const [overlayRealm, setOverlayRealm] = useState('');
  const [overlayIsMain, setOverlayIsMain] = useState(false);
  const [overlayValidatedCharacter, setOverlayValidatedCharacter] = useState(null);
  const [overlayValidatedViaRoster, setOverlayValidatedViaRoster] = useState(false);
  const [overlayStatusType, setOverlayStatusType] = useState('');
  const [overlayStatusText, setOverlayStatusText] = useState('');
  const [overlaySearching, setOverlaySearching] = useState(false);
  const [overlaySaving, setOverlaySaving] = useState(false);
  const [overlayCandidates, setOverlayCandidates] = useState([]);
  const [allowedRealms, setAllowedRealms] = useState([]);

  // Roster picker (for alt-coded character names users can't type)
  const [rosterPickerOpen, setRosterPickerOpen] = useState(false);
  const [rosterQuery, setRosterQuery] = useState('');
  const [rosterResults, setRosterResults] = useState([]);
  const [rosterLoading, setRosterLoading] = useState(false);
  const [rosterError, setRosterError] = useState('');
  // Companion-token / audit tool moved to Admin → Guild → Audit Tool.

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

  const displayName = primaryName(profile?.user) || 'Profile';
  useDocumentTitle(`${displayName} | MDGA`);

  const setOverlayStatus = (type, text) => {
    setOverlayStatusType(type || '');
    setOverlayStatusText(text || '');
  };

  const clearOverlayValidation = useCallback(() => {
    setOverlayValidatedCharacter(null);
    setOverlayValidatedViaRoster(false);
    setOverlayCandidates([]);
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
    setOverlayCandidates([]);
    setOverlayStatus('', '');
  };

  // Deep-link from the first-time onboarding modal: ?addCharacter=1 auto-
  // opens the add-character overlay so the user lands directly in the flow.
  useEffect(() => {
    if (!isOwnProfile) return;
    if (searchParams.get('addCharacter') !== '1') return;
    openAddCharacterOverlay();
    // Strip the query so a refresh doesn't re-open the overlay
    if (window.history?.replaceState) {
      window.history.replaceState({}, '', '/profile');
    }
  }, [isOwnProfile, searchParams]);

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

  const searchOverlayCharacter = async (overrides = {}) => {
    const characterName = (overrides.characterName ?? overlayName).trim();
    const realm = (overrides.realm ?? overlayRealm).trim();

    if (!characterName || !realm) {
      setOverlayStatus('error', 'Character name and realm are required.');
      return;
    }

    setOverlaySearching(true);
    setOverlayStatus('', '');
    setOverlayValidatedCharacter(null);
    setOverlayCandidates([]);

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

      // Alt-coded fallback: backend returned multiple federation members
      // whose names fold to the same ASCII as the user's input. Show a
      // picker so they can choose the right one.
      if (Array.isArray(data.candidates) && data.candidates.length > 0) {
        setOverlayCandidates(data.candidates);
        setOverlayStatus('', 'Multiple characters match that name. Pick yours below.');
        return;
      }

      setOverlayValidatedCharacter(data.character || null);
      setOverlayValidatedViaRoster(!!data.viaRoster);
      if (data.character?.characterName) {
        setOverlayName(data.character.characterName);
      }
      if (data.character?.realm) {
        setOverlayRealm(data.character.realm);
      }
      setOverlayStatus(
        'success',
        data.viaRoster
          ? 'Found in our guild roster. Live armory snapshot unavailable for this character — name, class, race, level, and guild will be saved.'
          : 'Character validated. Review details and save.'
      );
    } catch {
      setOverlayStatus('error', 'Failed to validate character.');
    } finally {
      setOverlaySearching(false);
    }
  };

  // Pick a candidate from the roster browser or the alt-code fuzzy
  // fallback. We already have the row cached in guild_members, so save
  // directly via /characters/from-roster — that skips Blizzard's profile
  // endpoint, which 404s for some Classic-tier members even though the
  // roster API lists them. Falls back to the regular lookup flow if the
  // candidate didn't come from the roster picker (no realmSlug present).
  const selectCharacterCandidate = async (candidate) => {
    if (!candidate) return;
    setOverlayName(candidate.characterName);
    setOverlayRealm(candidate.realm);
    setOverlayCandidates([]);
    setRosterPickerOpen(false);

    if (!candidate.realmSlug) {
      // Legacy path: alt-code fuzzy fallback row without an explicit slug.
      searchOverlayCharacter({ characterName: candidate.characterName, realm: candidate.realm });
      return;
    }

    setOverlaySaving(true);
    setOverlayStatus('', '');
    try {
      const res = await apiFetch('/characters/from-roster', {
        method: 'POST',
        body: JSON.stringify({
          characterName: candidate.characterName,
          realmSlug: candidate.realmSlug,
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

  const openRosterPicker = () => {
    setRosterPickerOpen(true);
    setRosterQuery(overlayName);
    setRosterResults([]);
    setRosterError('');
  };

  const closeRosterPicker = () => {
    setRosterPickerOpen(false);
  };

  // Debounced roster search — fires whenever the picker is open and the
  // query has at least 2 chars. Hits /api/characters/roster-search which
  // ASCII-folds both sides, so "Norne" finds "Nornë".
  useEffect(() => {
    if (!rosterPickerOpen) return undefined;
    const q = rosterQuery.trim();
    if (q.length < 2) {
      setRosterResults([]);
      setRosterError('');
      return undefined;
    }
    let cancelled = false;
    const t = setTimeout(async () => {
      setRosterLoading(true);
      setRosterError('');
      try {
        const res = await apiFetch(`/characters/roster-search?q=${encodeURIComponent(q)}`);
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setRosterError(data.error || 'Roster search failed.');
          setRosterResults([]);
        } else {
          setRosterResults(Array.isArray(data.results) ? data.results : []);
        }
      } catch {
        if (!cancelled) {
          setRosterError('Roster search failed.');
          setRosterResults([]);
        }
      } finally {
        if (!cancelled) setRosterLoading(false);
      }
    }, 200);
    return () => { cancelled = true; clearTimeout(t); };
  }, [rosterQuery, rosterPickerOpen, apiFetch]);

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
      // If /lookup found this character only via the guild roster fallback
      // (Blizzard's profile API 404'd), POST /api/characters would 404 too.
      // Route to /from-roster, which trusts our cached roster row.
      const endpoint = overlayValidatedViaRoster ? '/characters/from-roster' : '/characters';
      const body = overlayValidatedViaRoster
        ? {
            characterName: overlayValidatedCharacter.characterName,
            realmSlug: overlayValidatedCharacter.realmSlug,
            isMain: overlayIsMain,
          }
        : {
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
          };
      const res = await apiFetch(endpoint, {
        method: 'POST',
        body: JSON.stringify(body),
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

  // Open the inline spec editor for a given character, seeded with the
  // current values. Falls back to Blizzard's last-active spec if the
  // member hasn't set a main override yet.
  const openSpecEditor = (char) => {
    setEditingSpecsId(char.id);
    setDraftMainSpec(char.user_main_spec || char.spec || '');
    setDraftOffSpec(char.user_off_spec || '');
  };

  const closeSpecEditor = () => {
    setEditingSpecsId(null);
    setDraftMainSpec('');
    setDraftOffSpec('');
  };

  const saveSpecs = async (charId) => {
    setSavingSpecs(true);
    try {
      const res = await apiFetch(`/characters/${charId}/specs`, {
        method: 'PATCH',
        body: JSON.stringify({
          mainSpec: draftMainSpec || null,
          offSpec: draftOffSpec || null,
        }),
      });
      if (res.ok) {
        closeSpecEditor();
        await loadProfile();
      }
    } catch {
      // no-op
    } finally {
      setSavingSpecs(false);
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
    <div className={styles.page}>
      <header className={`${styles.titleBand} ${faction === 'alliance' ? styles.titleBandAlliance : ''}`}>
        <div className={styles.titleBandInner}>
          <img
            src={avatarSrc}
            alt={primaryName(profileUser) || 'Profile avatar'}
            className={styles.titleAvatar}
          />
          <div className={styles.titleInfo}>
            <span className={styles.titleEyebrow}>
              {isOwnProfile ? 'Your profile' : 'Member profile'}
            </span>
            <h1 className={styles.titleName}>
              {primaryName(profileUser)}
              {secondaryName(profileUser) && (
                <span className={styles.titleNameAlt}> ({secondaryName(profileUser)})</span>
              )}
            </h1>
            <div className={styles.titleMeta}>
              <span className={`rank-badge rank-badge--${profileUser.rank}`}>{profileUser.display_rank || profileUser.rank}</span>
              {/* Discord identity now appears in the title's parens line — skip
                  the duplicate Discord chip when secondaryName already rendered. */}
              {profileUser.discord_username && !secondaryName(profileUser) ? (
                <span className={styles.titleMetaItem}>Discord: {profileUser.discord_username}</span>
              ) : null}
              <span className={styles.titleMetaItem}>
                Joined {new Date(profileUser.created_at).toLocaleDateString()}
              </span>
              {isOwnProfile ? (
                tzEditing ? (
                  <select
                    className={styles.tzSelect}
                    value={userTimezone}
                    autoFocus
                    onChange={(e) => { updateTimezone(e.target.value); setTzEditing(false); }}
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
              ) : null}
            </div>
            <div className={styles.titleStatsInline}>
              <span className={styles.titleStat}>
                <span className={styles.titleStatValue}>{formatNumber(activity.posts)}</span>
                <span className={styles.titleStatLabel}>Posts</span>
              </span>
              <span className={styles.titleStat}>
                <span className={styles.titleStatValue}>{formatNumber(activity.comments)}</span>
                <span className={styles.titleStatLabel}>Comments</span>
              </span>
              <span className={styles.titleStat}>
                <span className={styles.titleStatValue}>{formatNumber(activity.views)}</span>
                <span className={styles.titleStatLabel}>Views</span>
              </span>
              <span className={styles.titleStat}>
                <span className={styles.titleStatValue}>{characters.length}</span>
                <span className={styles.titleStatLabel}>{characters.length === 1 ? 'Character' : 'Characters'}</span>
              </span>
            </div>
          </div>

          {isOwnProfile ? (
            <div className={styles.titleActions}>
              <button
                type="button"
                className="btn btn--primary btn--sm"
                onClick={openAddCharacterOverlay}
              >
                Add Character
              </button>
            </div>
          ) : null}
        </div>
      </header>

      <div className={styles.body}>
        <section>
          <div className={styles.bodySectionHeader}>
            <div>
              <span className={styles.bodySectionEyebrow}>Roster</span>
              <h2 className={styles.bodySectionTitle}>Characters</h2>
              <p className={styles.bodySectionDesc}>Click a card to flip and view the full stat sheet.</p>
            </div>
            {isOwnProfile && characters.length > 0 ? (
              <div>
                <button
                  className="btn btn--secondary btn--sm"
                  onClick={refreshPvpStats}
                  disabled={refreshing}
                  type="button"
                >
                  {refreshing ? 'Refreshing…' : 'Refresh Stats'}
                </button>
              </div>
            ) : null}
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
                // Prefer the user-set main spec over Blizzard's last-active
                // spec — migration 072 added these so a sync can't wipe
                // member-curated values. If neither is set, fall back to
                // Blizzard's `spec` (which is what we used to show).
                const effectiveMain = char.user_main_spec || char.spec;
                const classSpec = [char.class, effectiveMain].filter(Boolean).join(' - ');
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
                if (toNum(char.blitz_rating) > 0) {
                  quickPills.push(
                    <span key="blitz" className={styles.charPvpItem}>
                      <strong>{formatNumber(char.blitz_rating)}</strong> Blitz
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
                          <GuildFlag row={char} />
                          {char.is_main ? <span className={styles.charMainBadge}>MAIN</span> : <span className={styles.charAltBadge}>ALT</span>}
                        </div>
                        <div className={styles.charRealm}>
                          {char.realm}
                          {char.guild_name && <span className={styles.charGuild}> &lt;{char.guild_name}&gt;</span>}
                        </div>
                        {classSpec && <div className={styles.charClass}>{classSpec}</div>}
                        {char.user_off_spec && (
                          <div className={styles.charClass} style={{ opacity: 0.75, fontSize: '0.85em' }}>
                            Off-spec: {char.user_off_spec}
                          </div>
                        )}
                        {details.length > 0 && <div className={styles.charDetails}>{details.join(' - ')}</div>}

                        {isOwnProfile && editingSpecsId === char.id && (
                          <div
                            data-no-flip="true"
                            onClick={(e) => e.stopPropagation()}
                            style={{ marginTop: 'var(--space-3)', padding: 'var(--space-3)', background: 'var(--color-black, #0a0a0a)', border: '1px solid var(--color-gray-700)', borderRadius: 'var(--border-radius-sm)', display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}
                          >
                            <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                              <span style={{ fontSize: 'var(--font-size-xs)', textTransform: 'uppercase', letterSpacing: 1, color: 'var(--color-text-secondary)' }}>Main spec</span>
                              <select
                                value={draftMainSpec}
                                onChange={(e) => setDraftMainSpec(e.target.value)}
                                onClick={(e) => e.stopPropagation()}
                                style={{ padding: '6px 8px', background: 'var(--color-gray-900)', color: 'var(--color-text-primary)', border: '1px solid var(--color-gray-700)', borderRadius: 'var(--border-radius-sm)' }}
                              >
                                <option value="">— none —</option>
                                {(CLASS_SPECS[char.class] || []).map((s) => (
                                  <option key={s} value={s}>{s}</option>
                                ))}
                              </select>
                            </label>
                            <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                              <span style={{ fontSize: 'var(--font-size-xs)', textTransform: 'uppercase', letterSpacing: 1, color: 'var(--color-text-secondary)' }}>Off spec (optional)</span>
                              <select
                                value={draftOffSpec}
                                onChange={(e) => setDraftOffSpec(e.target.value)}
                                onClick={(e) => e.stopPropagation()}
                                style={{ padding: '6px 8px', background: 'var(--color-gray-900)', color: 'var(--color-text-primary)', border: '1px solid var(--color-gray-700)', borderRadius: 'var(--border-radius-sm)' }}
                              >
                                <option value="">— none —</option>
                                {(CLASS_SPECS[char.class] || []).filter((s) => s !== draftMainSpec).map((s) => (
                                  <option key={s} value={s}>{s}</option>
                                ))}
                              </select>
                            </label>
                            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
                              <button
                                type="button"
                                className="btn btn--secondary btn--sm"
                                onClick={(e) => { e.stopPropagation(); closeSpecEditor(); }}
                                disabled={savingSpecs}
                              >
                                Cancel
                              </button>
                              <button
                                type="button"
                                className="btn btn--secondary btn--sm"
                                onClick={(e) => { e.stopPropagation(); saveSpecs(char.id); }}
                                disabled={savingSpecs}
                              >
                                {savingSpecs ? 'Saving…' : 'Save specs'}
                              </button>
                            </div>
                          </div>
                        )}

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
                                className={`btn btn--secondary btn--sm ${styles.charActionBtn}`}
                                data-no-flip="true"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  if (editingSpecsId === char.id) closeSpecEditor();
                                  else openSpecEditor(char);
                                }}
                              >
                                {editingSpecsId === char.id ? 'Close' : 'Edit Specs'}
                              </button>
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
                              <div className={styles.charStat}><span className={styles.charStatLabel}>BG Blitz</span><span className={styles.charStatValue}>{formatNumber(char.blitz_rating)}</span></div>
                              <div className={styles.charStat}><span className={styles.charStatLabel}>Arena Record</span><span className={styles.charStatValue}>{formatNumber(arenaWon)}-{formatNumber(arenaLost)} ({arenaWinRate})</span></div>
                              <div className={styles.charStat}><span className={styles.charStatLabel}>BG Record</span><span className={styles.charStatValue}>{formatNumber(bgWon)}-{formatNumber(bgLost)} ({bgWinRate})</span></div>
                              <div className={styles.charStat}><span className={styles.charStatLabel}>Honorable Kills</span><span className={styles.charStatValue}>{formatNumber(char.honorable_kills)}</span></div>
                              <div className={styles.charStat}><span className={styles.charStatLabel}>Killing Blows</span><span className={styles.charStatValue}>{formatNumber(char.killing_blows)}</span></div>
                              <div className={styles.charStat}><span className={styles.charStatLabel}>Dungeons</span><span className={styles.charStatValue}>{formatNumber(char.dungeons_entered)}</span></div>
                              <div className={styles.charStat}><span className={styles.charStatLabel}>Raids</span><span className={styles.charStatValue}>{formatNumber(char.raids_entered)}</span></div>
                              <div className={styles.charStat}><span className={styles.charStatLabel}>Quests</span><span className={styles.charStatValue}>{formatNumber(char.quests_completed)}</span></div>
                              <div className={styles.charStat}><span className={styles.charStatLabel}>Achievement Pts</span><span className={styles.charStatValue}>{formatNumber(char.achievement_points)}</span></div>
                            </div>
                            {char.stats_source === 'scrape' && (
                              <details
                                className={styles.charStatsNotice}
                                onClick={(e) => e.stopPropagation()}
                                data-no-flip="true"
                              >
                                <summary>
                                  <strong>Some stats hidden by Blizzard privacy settings.</strong>{' '}
                                  How to fix
                                </summary>
                                <p>
                                  Blizzard&apos;s Game Data API doesn&apos;t return lifetime stats
                                  (Killing Blows, Dungeons, Raids, Quests, Arena&nbsp;Record, BG&nbsp;Record)
                                  for this character. The owner has &ldquo;Community Sites and Apps&rdquo;
                                  disabled in their Battle.net privacy settings — we&apos;re pulling
                                  everything we can from the public armory page instead.
                                </p>
                                <p><strong>To unlock the full stats</strong> (character owner only):</p>
                                <ol>
                                  <li>
                                    Sign in at{' '}
                                    <a
                                      href="https://account.battle.net/privacy#communication-preferences"
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      onClick={(e) => e.stopPropagation()}
                                    >
                                      account.battle.net/privacy
                                    </a>
                                  </li>
                                  <li>Under <em>Game Data And Profile Privacy</em>, enable <em>Community Sites and Apps</em></li>
                                  <li>Wait a few minutes for the change to propagate</li>
                                  <li>Come back here and click <em>Refresh Stats</em></li>
                                </ol>
                              </details>
                            )}
                            {Array.isArray(char.achievement_breakdown) && char.achievement_breakdown.length > 0 && (
                              <>
                                <div className={styles.charSectionLabel}>Achievement Breakdown</div>
                                <div className={styles.charStatsGrid}>
                                  {char.achievement_breakdown
                                    .filter((cat) => (cat.points || 0) > 0)
                                    .sort((a, b) => (b.points || 0) - (a.points || 0))
                                    .map((cat) => {
                                      const pct = cat.total > 0
                                        ? Math.round((cat.count / cat.total) * 100)
                                        : null;
                                      return (
                                        <div key={cat.slug || cat.name} className={styles.charStat}>
                                          <span className={styles.charStatLabel}>{cat.name}{pct !== null ? ` (${pct}%)` : ''}</span>
                                          <span className={styles.charStatValue}>{formatNumber(cat.points)}</span>
                                        </div>
                                      );
                                    })}
                                </div>
                              </>
                            )}
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
        </section>

        {isOwnProfile && (
          <div className={settingsStyles.settingsGrid}>
            <AFKNotice
              initialUntil={profile?.user?.afk_until || null}
              initialReason={profile?.user?.afk_reason || ''}
            />
            <NotificationPrefs />
          </div>
        )}

      </div>{/* /.body */}

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
                  onClick={() => searchOverlayCharacter()}
                  disabled={overlaySearching}
                >
                  {overlaySearching ? 'Searching...' : 'Search'}
                </button>
              </div>

              <p className={styles.overlayHint}>
                Special characters in your name?{' '}
                <button
                  type="button"
                  className={styles.overlayHintLink}
                  onClick={openRosterPicker}
                >
                  Browse the guild roster
                </button>
                .
              </p>

              {overlayCandidates.length > 0 && (
                <div className={styles.candidates}>
                  <p className={styles.candidatesHead}>Did you mean one of these?</p>
                  <ul className={styles.candidatesList}>
                    {overlayCandidates.map((c) => (
                      <li key={`${c.realmSlug}:${c.characterName}`}>
                        <button
                          type="button"
                          className={styles.candidateRow}
                          onClick={() => selectCharacterCandidate(c)}
                        >
                          <span className={styles.candidateName}>{c.characterName}</span>
                          <span className={styles.candidateMeta}>
                            {[c.realm, c.race, c.class, c.level ? `Lv ${c.level}` : null]
                              .filter(Boolean).join(' · ')}
                          </span>
                          {c.guildName && (
                            <span className={styles.candidateGuild}>&lt;{c.guildName}&gt;</span>
                          )}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

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

      {rosterPickerOpen && (
        <div className={styles.overlay}>
          <button
            className={styles.overlayBackdrop}
            onClick={closeRosterPicker}
            aria-label="Close roster picker"
            type="button"
          />
          <div className={styles.overlayDialog} role="dialog" aria-modal="true" aria-labelledby="roster-picker-title">
            <button
              type="button"
              className={styles.overlayClose}
              onClick={closeRosterPicker}
              aria-label="Close"
            >
              x
            </button>

            <h3 id="roster-picker-title" className={styles.overlayTitle}>Browse Guild Roster</h3>
            <p className={styles.overlaySubtitle}>
              Type your character&apos;s name without worrying about special
              characters &mdash; we&apos;ll match the closest names from our federation guild rosters.
            </p>

            <div className={styles.field}>
              <label htmlFor="roster-picker-q">Search</label>
              <input
                id="roster-picker-q"
                type="text"
                value={rosterQuery}
                onChange={(e) => setRosterQuery(e.target.value)}
                placeholder="Start typing a character name..."
                autoFocus
              />
            </div>

            {rosterError && (
              <p className={`${styles.status} ${styles.statusError}`}>{rosterError}</p>
            )}

            <div className={styles.rosterList}>
              {rosterLoading && (
                <p className={styles.rosterEmpty}>Searching...</p>
              )}
              {!rosterLoading && rosterQuery.trim().length < 2 && (
                <p className={styles.rosterEmpty}>Type at least 2 characters to search.</p>
              )}
              {!rosterLoading && rosterQuery.trim().length >= 2 && rosterResults.length === 0 && !rosterError && (
                <p className={styles.rosterEmpty}>No matching characters in our federation rosters.</p>
              )}
              {!rosterLoading && rosterResults.map((c) => {
                const disabled = c.claimedByOther;
                return (
                  <button
                    key={`${c.realmSlug}:${c.characterName}`}
                    type="button"
                    className={styles.candidateRow}
                    onClick={() => !disabled && selectCharacterCandidate(c)}
                    disabled={disabled}
                    title={disabled ? 'Already claimed by another user' : ''}
                  >
                    <span className={styles.candidateName}>{c.characterName}</span>
                    <span className={styles.candidateMeta}>
                      {[c.realm, c.race, c.class, c.level ? `Lv ${c.level}` : null]
                        .filter(Boolean).join(' · ')}
                    </span>
                    {c.guildName && (
                      <span className={styles.candidateGuild}>&lt;{c.guildName}&gt;</span>
                    )}
                    {c.claimedByOther && (
                      <span className={styles.candidateBadge}>claimed</span>
                    )}
                    {c.claimedByMe && (
                      <span className={styles.candidateBadge}>yours</span>
                    )}
                  </button>
                );
              })}
            </div>

            <div className={styles.overlayActions}>
              <button type="button" className="btn btn--secondary btn--sm" onClick={closeRosterPicker}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
