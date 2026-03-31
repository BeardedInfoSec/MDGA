const fetch = require('node-fetch');

let cachedToken = null;
let tokenExpiresAt = 0;

async function getAccessToken() {
  if (cachedToken && Date.now() < tokenExpiresAt) return cachedToken;

  const clientId = process.env.BLIZZARD_CLIENT_ID;
  const clientSecret = process.env.BLIZZARD_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error('BLIZZARD_CLIENT_ID and BLIZZARD_CLIENT_SECRET must be set in .env');
  }

  const res = await fetch('https://oauth.battle.net/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });

  if (!res.ok) throw new Error(`Blizzard token request failed: ${res.status}`);
  const data = await res.json();
  cachedToken = data.access_token;
  tokenExpiresAt = Date.now() + (data.expires_in - 60) * 1000;
  return cachedToken;
}

// Helper: fetch from Blizzard API with Bearer auth header
async function blizzFetch(url) {
  const token = await getAccessToken();
  return fetch(url, { headers: { Authorization: `Bearer ${token}` } });
}

async function fetchPvpStats(realmSlug, characterName) {
  const charSlug = characterName.toLowerCase();
  const url = `https://us.api.blizzard.com/profile/wow/character/${realmSlug}/${charSlug}/pvp-summary?namespace=profile-us&locale=en_US`;

  const res = await blizzFetch(url);
  if (!res.ok) return null;

  const data = await res.json();
  const stats = {
    arena_2v2: 0,
    arena_3v3: 0,
    solo_shuffle: 0,
    rbg_rating: 0,
    honorable_kills: data.honorable_kills || 0,
  };

  // The summary only has bracket links — we need to fetch each one for the actual rating
  if (data.brackets) {
    const bracketFetches = data.brackets.map(async (bracket) => {
      const href = (bracket.href || '').toLowerCase();
      try {
        const bracketRes = await blizzFetch(bracket.href);
        if (!bracketRes.ok) return;
        const bd = await bracketRes.json();
        const rating = bd.rating || 0;

        if (href.includes('shuffle') && rating > stats.solo_shuffle) stats.solo_shuffle = rating;
        else if (href.includes('3v3')) stats.arena_3v3 = rating;
        else if (href.includes('2v2')) stats.arena_2v2 = rating;
        else if (href.includes('rbg')) stats.rbg_rating = rating;
      } catch (err) { /* skip failed bracket */ }
    });
    await Promise.all(bracketFetches);
  }

  return stats;
}

async function fetchCharacterProfile(realmSlug, characterName) {
  const charSlug = characterName.toLowerCase();
  const base = `https://us.api.blizzard.com/profile/wow/character/${realmSlug}/${charSlug}`;
  const ns = 'namespace=profile-us&locale=en_US';

  // Fetch profile summary, equipment, and media in parallel
  const [profileRes, equipRes, mediaRes] = await Promise.all([
    blizzFetch(`${base}?${ns}`),
    blizzFetch(`${base}/equipment?${ns}`),
    blizzFetch(`${base}/character-media?${ns}`),
  ]);

  if (!profileRes.ok) return null;

  const profile = await profileRes.json();

  const profileRealmName = profile.realm?.name || null;
  const profileRealmSlug = profile.realm?.slug || (profileRealmName
    ? profileRealmName.toLowerCase().replace(/[' ]/g, '-').replace(/[^a-z0-9-]/g, '')
    : realmSlug);

  const result = {
    character_name: profile.name || characterName,
    realm_name: profileRealmName,
    realm_slug: profileRealmSlug,
    level: profile.level || null,
    race: profile.race?.name || null,
    class: profile.character_class?.name || null,
    spec: profile.active_spec?.name || null,
    item_level: profile.equipped_item_level || null,
    media_url: null,
    last_login: profile.last_login_timestamp ? new Date(profile.last_login_timestamp) : null,
    guild_name: profile.guild?.name || null,
    faction: profile.faction?.name || null,
  };

  // Equipment → equipped item level (fallback if not on profile summary)
  if (!result.item_level && equipRes.ok) {
    const equip = await equipRes.json();
    if (equip.equipped_item_level) {
      result.item_level = equip.equipped_item_level;
    } else if (equip.equipped_items) {
      const ilvls = equip.equipped_items.map(i => i.level?.value).filter(Boolean);
      if (ilvls.length > 0) result.item_level = Math.round(ilvls.reduce((a, b) => a + b, 0) / ilvls.length);
    }
  }

  // Character media → render URL
  if (mediaRes.ok) {
    const media = await mediaRes.json();
    const render = media.assets?.find(a => a.key === 'main-raw' || a.key === 'main');
    if (render) result.media_url = render.value;
  }

  // Achievement points from profile
  result.achievement_points = profile.achievement_points || 0;

  return result;
}

// Fetch fun stats from the achievements/statistics endpoint
async function fetchCharacterStats(realmSlug, characterName) {
  const charSlug = characterName.toLowerCase();
  const url = `https://us.api.blizzard.com/profile/wow/character/${realmSlug}/${charSlug}/achievements/statistics?namespace=profile-us&locale=en_US`;

  const res = await blizzFetch(url);
  if (!res.ok) return null;

  const data = await res.json();
  const stats = {
    killing_blows: 0,
    arenas_played: 0,
    arenas_won: 0,
    arenas_lost: 0,
    bgs_played: 0,
    bgs_won: 0,
    total_deaths: 0,
    creatures_killed: 0,
    dungeons_entered: 0,
    raids_entered: 0,
    quests_completed: 0,
  };

  if (!data.categories) return stats;

  // Walk all categories and sub-categories to find stats by name
  const statMap = {};
  for (const cat of data.categories) {
    const collect = (category) => {
      if (category.statistics) {
        for (const s of category.statistics) {
          statMap[s.name] = s.quantity || 0;
        }
      }
      if (category.sub_categories) {
        for (const sub of category.sub_categories) collect(sub);
      }
    };
    collect(cat);
  }

  stats.killing_blows = statMap['Total Killing Blows'] || 0;
  stats.arenas_played = statMap['Arenas played'] || 0;
  stats.arenas_won = statMap['Arenas won'] || 0;
  stats.arenas_lost = Math.max(0, stats.arenas_played - stats.arenas_won);
  stats.bgs_played = statMap['Battlegrounds played'] || 0;
  stats.bgs_won = statMap['Battlegrounds won'] || 0;
  stats.total_deaths = statMap['Total deaths'] || 0;
  stats.creatures_killed = statMap['Creatures killed'] || 0;
  stats.dungeons_entered = statMap['Total 5-player dungeons entered'] || 0;
  stats.raids_entered = (statMap['Total 10-player raids entered'] || 0) + (statMap['Total 25-player raids entered'] || 0);
  stats.quests_completed = statMap['Quests completed'] || 0;

  return stats;
}

async function fetchCharacterTalents(realmSlug, characterName) {
  const charSlug = characterName.toLowerCase();
  const url = `https://us.api.blizzard.com/profile/wow/character/${realmSlug}/${charSlug}/specializations?namespace=profile-us&locale=en_US`;

  const res = await blizzFetch(url);
  if (!res.ok) return null;

  const data = await res.json();
  if (!data.specializations || data.specializations.length === 0) return null;

  // Find the active spec
  const activeName = data.active_specialization?.name || null;
  const activeSpec = data.specializations.find(s => s.specialization?.name === activeName) || data.specializations[0];

  const result = {
    specName: activeSpec.specialization?.name || null,
    loadoutName: null,
    talents: [],
  };

  // Get active loadout
  if (activeSpec.loadouts) {
    const activeLoadout = activeSpec.loadouts.find(l => l.is_active) || activeSpec.loadouts[0];
    if (activeLoadout) {
      result.loadoutName = activeLoadout.name || 'Default';
      if (activeLoadout.selected_class_talents) {
        for (const t of activeLoadout.selected_class_talents) {
          result.talents.push({
            id: t.id,
            name: t.tooltip?.talent?.name || 'Unknown',
            spellId: t.tooltip?.spell_tooltip?.spell?.id || null,
            type: 'class',
          });
        }
      }
      if (activeLoadout.selected_spec_talents) {
        for (const t of activeLoadout.selected_spec_talents) {
          result.talents.push({
            id: t.id,
            name: t.tooltip?.talent?.name || 'Unknown',
            spellId: t.tooltip?.spell_tooltip?.spell?.id || null,
            type: 'spec',
          });
        }
      }
    }
  }

  return result;
}

async function fetchMythicKeystoneProfile(realmSlug, characterName) {
  const charSlug = characterName.toLowerCase();
  const url = `https://us.api.blizzard.com/profile/wow/character/${realmSlug}/${charSlug}/mythic-keystone-profile?namespace=profile-us&locale=en_US`;

  const res = await blizzFetch(url);
  if (!res.ok) return null;

  const data = await res.json();
  const result = {
    mythic_plus_rating: Math.round(data.current_mythic_rating?.rating || 0),
    highest_mplus_key: 0,
  };

  // Fetch the current season's best runs for highest key
  if (data.seasons && data.seasons.length > 0) {
    const latestSeason = data.seasons[data.seasons.length - 1];
    const seasonHref = latestSeason.key?.href;
    if (seasonHref) {
      try {
        const seasonRes = await blizzFetch(seasonHref);
        if (seasonRes.ok) {
          const seasonData = await seasonRes.json();
          if (seasonData.best_runs) {
            for (const run of seasonData.best_runs) {
              if (run.keystone_level > result.highest_mplus_key) {
                result.highest_mplus_key = run.keystone_level;
              }
            }
          }
        }
      } catch (_) { /* skip if season fetch fails */ }
    }
  }

  return result;
}

async function fetchRaidProgression(realmSlug, characterName) {
  const charSlug = characterName.toLowerCase();
  const url = `https://us.api.blizzard.com/profile/wow/character/${realmSlug}/${charSlug}/encounters/raids?namespace=profile-us&locale=en_US`;

  const res = await blizzFetch(url);
  if (!res.ok) return null;

  const data = await res.json();
  if (!data.expansions || data.expansions.length === 0) return { mythic_bosses_killed: 0 };

  // Get the latest expansion's latest raid instance
  const latestExpansion = data.expansions[data.expansions.length - 1];
  if (!latestExpansion.instances || latestExpansion.instances.length === 0) return { mythic_bosses_killed: 0 };

  const latestRaid = latestExpansion.instances[latestExpansion.instances.length - 1];
  let mythicKills = 0;

  if (latestRaid.modes) {
    const mythicMode = latestRaid.modes.find(m => m.difficulty?.type === 'MYTHIC');
    if (mythicMode && mythicMode.progress) {
      mythicKills = mythicMode.progress.completed_count || 0;
    }
  }

  return { mythic_bosses_killed: mythicKills };
}

// ── Guild API Functions ──

const GUILD_NS = 'namespace=profile-us&locale=en_US';

async function fetchGuildProfile(realmSlug, nameSlug) {
  const url = `https://us.api.blizzard.com/data/wow/guild/${realmSlug}/${nameSlug}?${GUILD_NS}`;
  const res = await blizzFetch(url);
  if (!res.ok) return null;
  const data = await res.json();
  return {
    name: data.name,
    faction: data.faction?.type || data.faction?.name || null,
    member_count: data.member_count || 0,
    achievement_points: data.achievement_points || 0,
    created_timestamp: data.created_timestamp ? new Date(data.created_timestamp) : null,
  };
}

const CLASS_NAMES = {
  1: 'Warrior', 2: 'Paladin', 3: 'Hunter', 4: 'Rogue', 5: 'Priest',
  6: 'Death Knight', 7: 'Shaman', 8: 'Mage', 9: 'Warlock', 10: 'Monk',
  11: 'Druid', 12: 'Demon Hunter', 13: 'Evoker',
};

const RACE_NAMES = {
  1: 'Human', 2: 'Orc', 3: 'Dwarf', 4: 'Night Elf', 5: 'Undead',
  6: 'Tauren', 7: 'Gnome', 8: 'Troll', 9: 'Goblin', 10: 'Blood Elf',
  11: 'Draenei', 22: 'Worgen', 24: 'Pandaren', 25: 'Pandaren', 26: 'Pandaren',
  27: 'Nightborne', 28: 'Highmountain Tauren', 29: 'Void Elf',
  30: 'Lightforged Draenei', 31: 'Zandalari Troll', 32: 'Kul Tiran',
  34: 'Dark Iron Dwarf', 35: 'Vulpera', 36: "Mag'har Orc", 37: 'Mechagnome',
  52: 'Dracthyr', 70: 'Dracthyr', 84: 'Earthen', 85: 'Earthen',
};

async function fetchGuildRoster(realmSlug, nameSlug) {
  const url = `https://us.api.blizzard.com/data/wow/guild/${realmSlug}/${nameSlug}/roster?${GUILD_NS}`;
  const res = await blizzFetch(url);
  if (!res.ok) return null;
  const data = await res.json();
  if (!data.members) return [];
  return data.members.map(m => ({
    character_name: m.character?.name || 'Unknown',
    realm_slug: m.character?.realm?.slug || realmSlug,
    realm_name: m.character?.realm?.name || null,
    level: m.character?.level || null,
    class: m.character?.playable_class?.name || CLASS_NAMES[m.character?.playable_class?.id] || null,
    race: m.character?.playable_race?.name || RACE_NAMES[m.character?.playable_race?.id] || null,
    rank: m.rank ?? 0,
  }));
}

async function fetchGuildAchievements(realmSlug, nameSlug) {
  const url = `https://us.api.blizzard.com/data/wow/guild/${realmSlug}/${nameSlug}/achievements?${GUILD_NS}`;
  const res = await blizzFetch(url);
  if (!res.ok) return null;
  const data = await res.json();
  if (!data.achievements) return [];
  return data.achievements
    .filter(a => a.completed_timestamp)
    .map(a => ({
      achievement_id: a.id,
      achievement_name: a.achievement?.name || 'Unknown',
      description: a.achievement?.description || null,
      completed_at: a.completed_timestamp ? new Date(a.completed_timestamp) : null,
      criteria_amount: a.criteria?.amount || null,
    }));
}

async function fetchGuildActivity(realmSlug, nameSlug) {
  const url = `https://us.api.blizzard.com/data/wow/guild/${realmSlug}/${nameSlug}/activity?${GUILD_NS}`;
  const res = await blizzFetch(url);
  if (!res.ok) return null;
  const data = await res.json();
  if (!data.activities) return [];
  return data.activities.map(a => {
    let type = 'unknown';
    let description = '';
    let characterName = null;
    const occurredAt = a.timestamp ? new Date(a.timestamp) : null;

    if (a.encounter_completed) {
      type = 'encounter';
      description = `${a.encounter_completed.encounter?.name || 'Boss'} defeated (${a.encounter_completed.mode?.name || 'Normal'})`;
    } else if (a.character_achievement) {
      type = 'achievement';
      characterName = a.character_achievement.character?.name || null;
      description = `${characterName || 'Guild'} earned ${a.character_achievement.achievement?.name || 'an achievement'}`;
    }
    return { type, character_name: characterName, description, occurred_at: occurredAt, raw: a };
  });
}

module.exports = {
  getAccessToken, fetchPvpStats, fetchCharacterProfile, fetchCharacterStats,
  fetchCharacterTalents, fetchMythicKeystoneProfile, fetchRaidProgression,
  fetchGuildProfile, fetchGuildRoster, fetchGuildAchievements, fetchGuildActivity,
};
