// Build the human-friendly post URL: /forum/post/<id>-<slug>
// The slug is purely cosmetic — the server parses the leading numeric id
// and ignores everything after the first hyphen. Falls back to just the id
// when there's no title to slugify.

function slugifyTitle(title) {
  return String(title || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')   // drop punctuation
    .replace(/\s+/g, '-')           // spaces -> hyphens
    .replace(/-+/g, '-')            // collapse runs
    .replace(/^-+|-+$/g, '')        // trim leading/trailing hyphens
    .slice(0, 80);                  // keep URLs reasonable
}

export function postUrl(post) {
  if (!post || !post.id) return '/forum';
  const slug = slugifyTitle(post.title);
  return slug ? `/forum/post/${post.id}-${slug}` : `/forum/post/${post.id}`;
}

// For callers that only have id + title separately (legacy code paths).
export function postUrlFromParts(id, title) {
  if (!id) return '/forum';
  const slug = slugifyTitle(title);
  return slug ? `/forum/post/${id}-${slug}` : `/forum/post/${id}`;
}
