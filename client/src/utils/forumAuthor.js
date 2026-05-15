// Helpers for resolving how a forum post/comment author is displayed.
// Prefers the user's main WoW character (uc.is_main), falling back through
// users.character_name → display_name → username. If the user is no longer
// active (left the guild, banned, etc.), returns a "[former member]"
// placeholder and signals callers to skip the profile link.

const FORMER_LABEL = '[former member]';

export function isFormerMember(authorRow) {
  // Backward-compat: rows without user_status (older endpoints) are assumed active.
  return authorRow?.user_status && authorRow.user_status !== 'active';
}

export function authorDisplayName(authorRow) {
  if (!authorRow) return FORMER_LABEL;
  if (isFormerMember(authorRow)) return FORMER_LABEL;
  return (
    authorRow.main_character_name ||
    authorRow.character_name ||
    authorRow.display_name ||
    authorRow.username ||
    'Member'
  );
}

// Discord display name shown as a small subtitle under the main character —
// only when it differs from the visible primary name and the user is active.
export function authorSecondaryName(authorRow) {
  if (!authorRow || isFormerMember(authorRow)) return null;
  const primary = authorDisplayName(authorRow);
  const secondary = authorRow.display_name || authorRow.username;
  if (!secondary) return null;
  if (secondary === primary) return null;
  return secondary;
}

export function authorRealmSlug(authorRow) {
  if (!authorRow) return null;
  return authorRow.main_realm_slug || (authorRow.realm ? String(authorRow.realm).toLowerCase() : null);
}

export function authorProfileLink(authorRow) {
  if (!authorRow || isFormerMember(authorRow) || !authorRow.user_id) return null;
  return `/profile?id=${authorRow.user_id}`;
}
