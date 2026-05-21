// ================================================
// In-memory pub/sub for Server-Sent Events.
// The /api/notifications/stream route registers a response object per
// connected user; the notification service publishes events as they're
// inserted. No persistence — clients reconnect automatically on drop,
// and the 30s heartbeat poll covers anything an outage misses.
//
// Per-process state: works fine for a single-node deploy (current
// setup). If we scale to multiple Node processes later, swap this for
// Redis pub/sub or a shared bus.
// ================================================

// Map: userId (number) → Set<res>
const subscribers = new Map();

function subscribe(userId, res) {
  if (!userId || !res) return () => {};
  const uid = Number(userId);
  if (!subscribers.has(uid)) subscribers.set(uid, new Set());
  subscribers.get(uid).add(res);
  return () => unsubscribe(uid, res);
}

function unsubscribe(userId, res) {
  const uid = Number(userId);
  const set = subscribers.get(uid);
  if (!set) return;
  set.delete(res);
  if (set.size === 0) subscribers.delete(uid);
}

function writeEvent(res, event, data) {
  try {
    if (event) res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  } catch {
    // Connection dead — caller's req.on('close') will clean it up.
  }
}

// Publish a notification event to a single user (mention, reply).
function publishToUser(userId, payload) {
  const set = subscribers.get(Number(userId));
  if (!set || set.size === 0) return 0;
  for (const res of set) writeEvent(res, 'notification', payload);
  return set.size;
}

// Publish a broadcast to every currently-connected user (event,
// giveaway_kickoff). The notification rows are already in the DB at
// this point — this is just the real-time nudge.
function publishToAll(payload) {
  let count = 0;
  for (const [, set] of subscribers) {
    for (const res of set) {
      writeEvent(res, 'notification', payload);
      count++;
    }
  }
  return count;
}

// Heartbeat ping — SSE intermediate proxies sometimes close connections
// that go silent for too long. Emit a comment line every 25s.
function startHeartbeat() {
  return setInterval(() => {
    for (const [, set] of subscribers) {
      for (const res of set) {
        try { res.write(':\n\n'); } catch { /* dead conn */ }
      }
    }
  }, 25 * 1000).unref();
}

module.exports = { subscribe, unsubscribe, publishToUser, publishToAll, startHeartbeat };
