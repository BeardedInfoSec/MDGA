import { useEffect, useState } from 'react';
import styles from './DropCountdown.module.css';

// Live countdown banner shown above a scheduled forum post until its
// publish_at moment lands. Used primarily by giveaways during the
// warning window so members watching the post see real-time pressure.
//
// Props:
//   targetIso   — ISO string of the drop time
//   label       — small caption above the timer (default "Drop incoming")
//   onElapsed   — optional callback fired when the timer hits zero
//                 (parent typically refetches the post so the live
//                 version replaces the preview)

function formatRemaining(ms) {
  if (ms <= 0) return { h: 0, m: 0, s: 0, total: 0 };
  const total = Math.floor(ms / 1000);
  return {
    h: Math.floor(total / 3600),
    m: Math.floor((total % 3600) / 60),
    s: total % 60,
    total,
  };
}

export default function DropCountdown({ targetIso, label = 'Drop incoming', onElapsed }) {
  const targetMs = targetIso ? new Date(targetIso).getTime() : 0;
  const [remaining, setRemaining] = useState(() => formatRemaining(targetMs - Date.now()));

  useEffect(() => {
    if (!targetMs) return undefined;
    const tick = () => {
      const r = formatRemaining(targetMs - Date.now());
      setRemaining(r);
      if (r.total <= 0 && onElapsed) onElapsed();
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [targetMs, onElapsed]);

  if (!targetMs) return null;

  if (remaining.total <= 0) {
    return (
      <div className={`${styles.banner} ${styles.bannerLive}`}>
        <span className={styles.label}>Drop is live</span>
        <span className={styles.live}>Replies open — first / Nth wins</span>
      </div>
    );
  }

  const pad = (n) => String(n).padStart(2, '0');
  return (
    <div className={styles.banner}>
      <span className={styles.label}>{label}</span>
      <span className={styles.timer}>
        {remaining.h > 0 && <><span className={styles.digit}>{remaining.h}</span><span className={styles.unit}>h</span></>}
        <span className={styles.digit}>{pad(remaining.m)}</span><span className={styles.unit}>m</span>
        <span className={styles.digit}>{pad(remaining.s)}</span><span className={styles.unit}>s</span>
      </span>
    </div>
  );
}
