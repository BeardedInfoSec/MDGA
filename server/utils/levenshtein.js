// Levenshtein distance — iterative two-row DP, case-insensitive.
// Used by the reconciliation report to detect spelling near-matches
// between guild_members.character_name and user_characters.character_name.

function levenshtein(a, b) {
  const s = String(a || '').toLowerCase();
  const t = String(b || '').toLowerCase();
  if (s === t) return 0;
  if (!s.length) return t.length;
  if (!t.length) return s.length;

  let prev = new Array(t.length + 1);
  let curr = new Array(t.length + 1);
  for (let j = 0; j <= t.length; j++) prev[j] = j;

  for (let i = 1; i <= s.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= t.length; j++) {
      const cost = s.charCodeAt(i - 1) === t.charCodeAt(j - 1) ? 0 : 1;
      curr[j] = Math.min(
        curr[j - 1] + 1,      // insertion
        prev[j] + 1,          // deletion
        prev[j - 1] + cost    // substitution
      );
    }
    [prev, curr] = [curr, prev];
  }
  return prev[t.length];
}

// Find the best match (lowest distance) for `needle` in `haystack` entries,
// where each entry is { value, ...meta }. Returns { entry, distance } or null.
// Skips exact matches (distance 0) — those aren't near-misses, they're matches.
function bestNearMatch(needle, haystack, maxDistance = 2) {
  let best = null;
  for (const entry of haystack) {
    const d = levenshtein(needle, entry.value);
    if (d === 0) return null;            // exact match → not a near-miss
    if (d <= maxDistance && (!best || d < best.distance)) {
      best = { entry, distance: d };
    }
  }
  return best;
}

module.exports = { levenshtein, bestNearMatch };
