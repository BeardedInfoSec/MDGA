// Per-character flag badge: which federation guild a character belongs to.
//
//   guild_id 1 (Tichondrius) → "MDGA 1"
//   guild_id 7 (Thrall)      → "MDGA 2"
//   guild_id 6 (Illidan)     → "MDGA 3"
//   any other Horde guild    → "MDGA"   (generic federation flag)
//   any Alliance guild       → "MEGA"
//   no guild link            → null     (caller renders nothing)
//
// Numbers are pre-assigned to the three flagship realms (rapazzini ask) —
// not a guild-id range — so we hard-code the mapping rather than infer
// from joined-order, which would silently re-number if a guild gets
// archived/restored. Update HORDE_NUMBERED_FLAGS if a new flagship realm
// is added.

const HORDE_NUMBERED_FLAGS = {
  1: 'MDGA 1', // Tichondrius
  7: 'MDGA 2', // Thrall
  6: 'MDGA 3', // Illidan
};

export function guildFlag(guildId, faction) {
  if (!guildId) return null;
  const fac = String(faction || '').toUpperCase();
  if (fac === 'ALLIANCE') return 'MEGA';
  return HORDE_NUMBERED_FLAGS[guildId] || 'MDGA';
}

// Class name suffix: callers can do `${styles.flag} ${styles[`flag--${variant}`]}`
// to tint Horde vs. Alliance differently. Returns 'horde' / 'alliance' / null.
export function guildFlagVariant(faction) {
  const fac = String(faction || '').toUpperCase();
  if (fac === 'ALLIANCE') return 'alliance';
  if (fac === 'HORDE') return 'horde';
  return null;
}
