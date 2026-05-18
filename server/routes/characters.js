const express = require('express');
const pool = require('../db');
const { requireAuth } = require('../middleware/auth');
const { fetchCharacterProfile } = require('../blizzard');
const { refreshCharacter } = require('../services/character-sync');
const { setMemberNickname } = require('../bot');
const guildRegistry = require('../services/guild-registry');

const router = express.Router();

// Names of guilds we accept, displayed in error messages. Derived from the
// registry so adding a child guild auto-updates user-facing copy.
async function acceptedGuildNamesLabel() {
  const guilds = await guildRegistry.getGuilds();
  const unique = [...new Set(guilds.map((g) => g.name))];
  if (unique.length === 0) return 'our federation';
  if (unique.length === 1) return `<${unique[0]}>`;
  return unique.map((n) => `<${n}>`).join(' / ');
}

function realmSlug(realmName) {
  const normalized = String(realmName || '')
    .toLowerCase()
    .replace(/[' ]/g, '-')
    .replace(/[^a-z0-9-]/g, '');

  const aliases = {
    tich: 'tichondrius',
    tichondrius: 'tichondrius',
    area52: 'area-52',
    'area-52': 'area-52',
    malganis: 'malganis',
    'mal-ganis': 'malganis',
    zuljin: 'zuljin',
    "zul-jin": 'zuljin',
    moknathal: 'moknathal',
    'mok-nathal': 'moknathal',
    quelthalas: 'quelthalas',
    'quel-thalas': 'quelthalas',
    queldorei: 'queldorei',
    'quel-dorei': 'queldorei',
    drakthul: 'drakthul',
    'drak-thul': 'drakthul',
    draktharon: 'draktharon',
    'drak-tharon': 'draktharon',
    chogall: 'chogall',
    'cho-gall': 'chogall',
    dathremar: 'dathremar',
    "dath-remar": 'dathremar',
    gnerzhul: 'nerzhul',
    nerzhul: 'nerzhul',
    'ner-zhul': 'nerzhul',
    khaztgoroth: 'khazgoroth',
    khazgoroth: 'khazgoroth',
    'khaz-goroth': 'khazgoroth',
    keljaeden: 'kiljaeden',
    kiljaeden: 'kiljaeden',
    'kil-jaeden': 'kiljaeden',
    kelthuzad: 'kelthuzad',
    'kel-thuzad': 'kelthuzad',
    amanthul: 'amanthul',
    'aman-thul': 'amanthul',
    senjin: 'senjin',
    'sen-jin': 'senjin',
    veknilash: 'veknilash',
    'vek-nilash': 'veknilash',
    shuhalo: 'shuhalo',
    "shu-halo": 'shuhalo',
    eldrethalas: 'eldrethalas',
    "eldre-thalas": 'eldrethalas',
    makaru: 'makaru',
    "mak-aru": 'makaru',
    anubarak: 'anubarak',
    "anub-arak": 'anubarak',
    juebithos: 'jubeithos',
    jubeithos: 'jubeithos',
    "jubei-thos": 'jubeithos',
    kaelthas: 'kaelthas',
    "kael-thas": 'kaelthas',
    guldan: 'guldan',
    "gul-dan": 'guldan',
  };

  return aliases[normalized] || normalized;
}

// POST /api/characters/lookup
router.post('/lookup', requireAuth, async (req, res) => {
  try {
    const characterName = (req.body.characterName || '').trim();
    const realm = (req.body.realm || '').trim();

    if (!characterName || !realm) {
      return res.status(400).json({ error: 'characterName and realm are required' });
    }

    // Realm is not pre-restricted — any realm is fair game; the gate is the
    // guild check below (character must be in an MDGA or MEGA federation
    // guild, regardless of which realm they play on).

    const slug = realmSlug(realm);
    console.log(`[Character lookup] Searching for ${characterName} on ${slug}`);
    const profile = await fetchCharacterProfile(slug, characterName);
    if (!profile) {
      return res.status(404).json({ error: 'Character not found on World of Warcraft Armory' });
    }

    // Guild verification — accept any character whose guild NAME matches one
    // of our federation guilds, regardless of realm. Members are spread
    // across every WoW server, so realm matching would block legitimate
    // members on realms with no registered branch.
    const matchedGuild = await guildRegistry.findGuildByName(profile.guild_name);
    if (!matchedGuild) {
      const accepted = await acceptedGuildNamesLabel();
      console.log(`[Character lookup] Guild check failed: "${profile.guild_name}" on "${profile.realm_slug || slug}" not a federation guild`);
      return res.status(403).json({
        error: profile.guild_name
          ? `This character is in <${profile.guild_name}>, not in any of our federation guilds (${accepted}).`
          : `This character is not in a guild. Only members of ${accepted} can be added.`,
      });
    }
    console.log(`[Character lookup] Guild verified by name: ${profile.guild_name} (matched guild_id=${matchedGuild.id})`);

    const resolvedRealm = profile.realm_name || realm;
    const resolvedRealmSlug = profile.realm_slug || realmSlug(resolvedRealm);

    return res.json({
      character: {
        characterName: profile.character_name || characterName,
        realm: resolvedRealm,
        realmSlug: resolvedRealmSlug,
        class: profile.class || null,
        spec: profile.spec || null,
        level: profile.level || null,
        race: profile.race || null,
        itemLevel: profile.item_level || null,
        mediaUrl: profile.media_url || null,
        guildName: profile.guild_name || null,
        faction: profile.faction || null,
      },
    });
  } catch (err) {
    console.error('Character lookup error:', err);
    return res.status(500).json({ error: 'Failed to validate character' });
  }
});

// GET /api/characters/:userId
router.get('/:userId', requireAuth, async (req, res) => {
  try {
    const targetUserId = parseInt(req.params.userId, 10);
    if (Number.isNaN(targetUserId)) {
      return res.status(400).json({ error: 'Invalid user id' });
    }

    const isOwner = targetUserId === Number(req.user.id);
    const canViewAny = ['officer', 'guildmaster'].includes(req.user.rank) ||
      (req.user.permissions && req.user.permissions.includes('admin.manage_users'));
    if (!isOwner && !canViewAny) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    const [characters] = await pool.execute(
      `SELECT id, user_id, character_name, realm, realm_slug, class, spec, is_main,
              level, race, item_level, media_url, talents_json, talents_updated_at, created_at, updated_at
       FROM user_characters
       WHERE user_id = ?
       ORDER BY is_main DESC, character_name ASC`,
      [targetUserId]
    );
    res.json({ characters });
  } catch (err) {
    console.error('Get characters error:', err);
    res.status(500).json({ error: 'Failed to fetch characters' });
  }
});

// POST /api/characters
router.post('/', requireAuth, async (req, res) => {
  try {
    const {
      characterName,
      realm,
      class: charClass,
      spec,
      isMain,
      realmSlug: providedRealmSlug,
      level,
      race,
      itemLevel,
      mediaUrl,
      lastLogin,
    } = req.body;
    if (!characterName || !realm) {
      return res.status(400).json({ error: 'characterName and realm are required' });
    }

    // Realm is not pre-restricted — gate is the guild membership check below.

    const requestedName = String(characterName).trim();
    const requestedRealm = String(realm).trim();
    const requestedSlug = realmSlug(requestedRealm);

    console.log(`[Character add] Fetching profile for ${requestedName} on ${requestedSlug}`);
    let profile = null;
    try {
      profile = await fetchCharacterProfile(requestedSlug, requestedName);
    } catch (err) {
      console.warn('[Character add] Armory fetch failed:', err.message);
    }

    if (!profile) {
      return res.status(404).json({ error: 'Character not found on World of Warcraft Armory.' });
    }

    // Guild verification — accept any character whose guild NAME matches one
    // of our federation guilds, regardless of realm.
    const matchedGuild = await guildRegistry.findGuildByName(profile.guild_name);
    if (!matchedGuild) {
      const accepted = await acceptedGuildNamesLabel();
      console.log(`[Character add] Guild check failed: "${profile.guild_name}" on "${profile.realm_slug || requestedSlug}" not a federation guild`);
      return res.status(403).json({
        error: profile.guild_name
          ? `This character is in <${profile.guild_name}>, not in any of our federation guilds (${accepted}).`
          : `This character is not in a guild. Only members of ${accepted} can be added.`,
      });
    }
    console.log(`[Character add] Guild verified by name: ${profile.guild_name} (matched guild_id=${matchedGuild.id})`);

    const safeInt = (value) => {
      if (value === null || value === undefined || value === '') return null;
      const n = Number(value);
      return Number.isFinite(n) ? Math.trunc(n) : null;
    };

    const resolvedCharacterName = profile.character_name || requestedName;
    const resolvedRealm = profile.realm_name || requestedRealm;
    const resolvedRealmSlug = profile.realm_slug || providedRealmSlug || requestedSlug;
    const resolvedClass = profile.class || charClass || null;
    const resolvedSpec = profile.spec || spec || null;
    const resolvedLevel = profile.level ?? safeInt(level);
    const resolvedRace = profile.race || race || null;
    const resolvedItemLevel = profile.item_level ?? safeInt(itemLevel);
    const resolvedMediaUrl = profile.media_url || mediaUrl || null;
    const resolvedLastLogin = profile.last_login || (lastLogin ? new Date(lastLogin) : null);
    const resolvedGuildName = profile.guild_name || null;
    const resolvedFaction = profile.faction || null;
    let insertedCharacterId = null;

    // Check for duplicate character (same user)
    const [existing] = await pool.execute(
      'SELECT id FROM user_characters WHERE user_id = ? AND LOWER(character_name) = LOWER(?) AND realm_slug = ?',
      [req.user.id, resolvedCharacterName, resolvedRealmSlug]
    );
    if (existing.length > 0) {
      return res.status(409).json({ error: 'This character is already on your profile.' });
    }

    // Check if another user already claimed this character
    const [claimedBy] = await pool.execute(
      `SELECT u.discord_username, u.display_name, u.username
       FROM user_characters uc
       JOIN users u ON uc.user_id = u.id
       WHERE LOWER(uc.character_name) = LOWER(?) AND uc.realm_slug = ? AND uc.user_id != ?`,
      [resolvedCharacterName, resolvedRealmSlug, req.user.id]
    );
    if (claimedBy.length > 0) {
      const owner = claimedBy[0].discord_username || claimedBy[0].display_name || claimedBy[0].username;
      return res.status(409).json({
        error: `This character is already claimed by ${owner}. If this is your character, please open a support ticket in our Discord server to have it reassigned.`,
        claimedBy: owner,
      });
    }

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      if (isMain) {
        await conn.execute('UPDATE user_characters SET is_main = FALSE WHERE user_id = ?', [req.user.id]);
      }

      const [result] = await conn.execute(
        `INSERT INTO user_characters
          (user_id, character_name, realm, realm_slug, class, spec, level, race, item_level, media_url, guild_name, faction, guild_id, last_login, is_main)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          req.user.id,
          resolvedCharacterName,
          resolvedRealm,
          resolvedRealmSlug,
          resolvedClass,
          resolvedSpec,
          resolvedLevel,
          resolvedRace,
          resolvedItemLevel,
          resolvedMediaUrl,
          resolvedGuildName,
          resolvedFaction,
          matchedGuild.id,
          resolvedLastLogin,
          isMain ? true : false,
        ]
      );
      insertedCharacterId = result.insertId;

      // Sync main character to users table for forum display + Discord nickname
      if (isMain) {
        await conn.execute('UPDATE users SET realm = ?, character_name = ? WHERE id = ?', [resolvedRealm, resolvedCharacterName, req.user.id]);
      }

      await conn.commit();

      // Sync Discord nickname when setting main character
      if (isMain) {
        const [userRow] = await pool.execute('SELECT discord_id FROM users WHERE id = ?', [req.user.id]);
        if (userRow.length > 0 && userRow[0].discord_id) {
          setMemberNickname(userRow[0].discord_id, resolvedCharacterName).catch((err) => {
            console.warn('[Nickname sync] Failed after add-character:', err.message);
          });
        }
      }
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }

    let sync = {
      updated: false,
      profileSynced: false,
      talentsSynced: false,
      statsSynced: false,
    };
    try {
      sync = await refreshCharacter(
        {
          id: insertedCharacterId,
          realm_slug: resolvedRealmSlug,
          character_name: resolvedCharacterName,
        },
        { profile }
      );
    } catch (syncErr) {
      console.error('Immediate character sync after add failed:', syncErr);
    }

    console.log(`[Character add] Success: ${resolvedCharacterName}-${resolvedRealmSlug} (id=${insertedCharacterId}), sync=${JSON.stringify(sync)}`);
    res.status(201).json({
      id: insertedCharacterId,
      message: sync.updated ? 'Character added and data synced' : 'Character added',
      character: {
        characterName: resolvedCharacterName,
        realm: resolvedRealm,
        realmSlug: resolvedRealmSlug,
        class: resolvedClass,
        spec: resolvedSpec,
        level: resolvedLevel,
        race: resolvedRace,
        itemLevel: resolvedItemLevel,
        mediaUrl: resolvedMediaUrl,
        guildName: resolvedGuildName,
        faction: resolvedFaction,
        lastLogin: resolvedLastLogin,
      },
      sync,
    });
  } catch (err) {
    console.error('Add character error:', err);
    res.status(500).json({ error: 'Failed to add character' });
  }
});

// PUT /api/characters/:id
router.put('/:id', requireAuth, async (req, res) => {
  try {
    const [rows] = await pool.execute('SELECT user_id FROM user_characters WHERE id = ?', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Character not found' });
    if (Number(rows[0].user_id) !== Number(req.user.id)) return res.status(403).json({ error: 'Not your character' });

    const { characterName, realm, class: charClass, spec } = req.body;
    const slug = realm ? realmSlug(realm) : undefined;

    await pool.execute(
      `UPDATE user_characters SET
        character_name = COALESCE(?, character_name),
        realm = COALESCE(?, realm),
        realm_slug = COALESCE(?, realm_slug),
        class = COALESCE(?, class),
        spec = COALESCE(?, spec)
      WHERE id = ?`,
      [characterName || null, realm || null, slug || null, charClass || null, spec || null, req.params.id]
    );
    res.json({ message: 'Character updated' });
  } catch (err) {
    console.error('Update character error:', err);
    res.status(500).json({ error: 'Failed to update character' });
  }
});

// PUT /api/characters/:id/main
router.put('/:id/main', requireAuth, async (req, res) => {
  try {
    const [rows] = await pool.execute('SELECT user_id, character_name, realm FROM user_characters WHERE id = ?', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Character not found' });
    if (Number(rows[0].user_id) !== Number(req.user.id)) return res.status(403).json({ error: 'Not your character' });

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      await conn.execute('UPDATE user_characters SET is_main = FALSE WHERE user_id = ?', [req.user.id]);
      await conn.execute('UPDATE user_characters SET is_main = TRUE WHERE id = ?', [req.params.id]);
      // Sync to users table for forum display
      await conn.execute('UPDATE users SET realm = ?, character_name = ? WHERE id = ?', [rows[0].realm, rows[0].character_name, req.user.id]);
      await conn.commit();

      // Sync Discord nickname to main character name
      const [userRow] = await pool.execute('SELECT discord_id FROM users WHERE id = ?', [req.user.id]);
      if (userRow.length > 0 && userRow[0].discord_id) {
        setMemberNickname(userRow[0].discord_id, rows[0].character_name).catch((err) => {
          console.warn('[Nickname sync] Failed after set-main:', err.message);
        });
      }

      res.json({ message: 'Main character updated' });
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  } catch (err) {
    console.error('Set main error:', err);
    res.status(500).json({ error: 'Failed to set main character' });
  }
});

// DELETE /api/characters/:id
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const [rows] = await pool.execute('SELECT user_id FROM user_characters WHERE id = ?', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Character not found' });

    const isOwner = Number(rows[0].user_id) === Number(req.user.id);
    const isOfficer = ['officer', 'guildmaster'].includes(req.user.rank);
    if (!isOwner && !isOfficer) return res.status(403).json({ error: 'Not authorized' });

    await pool.execute('DELETE FROM user_characters WHERE id = ?', [req.params.id]);
    res.json({ message: 'Character deleted' });
  } catch (err) {
    console.error('Delete character error:', err);
    res.status(500).json({ error: 'Failed to delete character' });
  }
});

module.exports = router;
