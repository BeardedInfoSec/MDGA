import { useEffect, useState } from 'react';

// Shared background image for the whole site. Home renders it at full strength
// behind its dashboard; every other page picks it up via a fixed pseudo-layer
// (see global.css :root + body::before block) at low opacity so the rooms
// share atmosphere without competing with content.
//
// The fetched URL is mirrored into localStorage so subsequent hard refreshes
// hydrate instantly with the *current* image and avoid a flash of the previous
// one. Used to live in Home.jsx — extracted here so navigation between pages
// doesn't unmount/remount the bg setup.
const DEFAULT_BG = '/images/Screenshot_2026-02-06_18-21-39.png';
const CACHE_KEY = 'mdga.homeBackgroundUrl';

export default function useSiteBackground() {
  const [url, setUrl] = useState(() => {
    try { return localStorage.getItem(CACHE_KEY) || DEFAULT_BG; } catch { return DEFAULT_BG; }
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/carousel');
        if (!res.ok) return;
        const data = await res.json();
        const next = data.backgroundImageUrl || DEFAULT_BG;
        if (cancelled) return;
        setUrl(next);
        try { localStorage.setItem(CACHE_KEY, next); } catch { /* private mode / quota */ }
      } catch { /* silent */ }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const safe = (url || DEFAULT_BG).replace(/"/g, '%22');
    document.documentElement.style.setProperty('--site-bg-image', `url("${safe}")`);
    // Keep the legacy --home-bg-image variable populated too — Home.jsx and
    // Admin.jsx still reference it directly.
    document.documentElement.style.setProperty('--home-bg-image', `url("${safe}")`);
  }, [url]);

  return url;
}

useSiteBackground.DEFAULT_BG = DEFAULT_BG;
useSiteBackground.CACHE_KEY = CACHE_KEY;
