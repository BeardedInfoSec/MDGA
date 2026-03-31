export function timeAgo(dateStr) {
  const date = new Date(dateStr);
  const now = new Date();
  const seconds = Math.floor((now - date) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return date.toLocaleDateString();
}

export function armoryUrl(realmSlug, characterName) {
  return `https://worldofwarcraft.blizzard.com/en-us/character/us/${realmSlug}/${characterName.toLowerCase()}`;
}

export function formatNumber(num) {
  return (num || 0).toLocaleString();
}
