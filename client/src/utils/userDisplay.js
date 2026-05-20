// Site-wide helper for rendering "who is this person" in the UI.
// Rapazzini forum #34: prefer the main WoW character's name, append the
// discord name in parens when it differs. Falls back through the legacy
// display_name / username chain so older endpoints that don't yet include
// main_character_name still render something sensible.
//
// Accepts both camelCase (from /auth/me) and snake_case (from forum/dashboard
// API responses) so it can be dropped in everywhere without normalizing.

function pick(row, ...keys) {
  for (const k of keys) {
    if (row && row[k]) return row[k];
  }
  return null;
}

export function primaryName(row) {
  if (!row) return 'Member';
  return (
    pick(row, 'mainCharacterName', 'main_character_name', 'characterName', 'character_name', 'displayName', 'display_name', 'username') ||
    'Member'
  );
}

export function secondaryName(row) {
  if (!row) return null;
  const main = pick(row, 'mainCharacterName', 'main_character_name', 'characterName', 'character_name');
  const discord = pick(row, 'discordUsername', 'discord_username', 'displayName', 'display_name');
  // Only show parens when we actually have a distinct discord-side label.
  if (!main || !discord) return null;
  if (String(discord).toLowerCase() === String(main).toLowerCase()) return null;
  return discord;
}

// Convenience: returns "Maincharacter (DiscordTag)" or just the primary
// when no secondary is available.
export function fullDisplayName(row) {
  const main = primaryName(row);
  const sec = secondaryName(row);
  return sec ? `${main} (${sec})` : main;
}
