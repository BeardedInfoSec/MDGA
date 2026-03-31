/**
 * One-time migration script: converts existing day-of-week + time events
 * to calendar-based events with UTC starts_at / ends_at.
 *
 * Run after migration-029 SQL has been applied:
 *   node db/migrate-events-to-calendar.js
 */
require('dotenv').config();
const { DateTime } = require('luxon');
const mysql = require('mysql2/promise');

const TIMEZONE = 'America/New_York'; // Guild's default timezone

const DAY_INDEX = {
  Monday: 1, Tuesday: 2, Wednesday: 3, Thursday: 4,
  Friday: 5, Saturday: 6, Sunday: 7,
};

function parseTimeStr(timeStr) {
  // Match patterns like "8:00 PM" or "8:30 PM"
  const matches = [...timeStr.matchAll(/(\d{1,2}):(\d{2})\s*(AM|PM)/gi)];
  if (matches.length === 0) return null;

  const parse12h = (m) => {
    let hour = parseInt(m[1], 10);
    const min = parseInt(m[2], 10);
    const period = m[3].toUpperCase();
    if (period === 'PM' && hour !== 12) hour += 12;
    if (period === 'AM' && hour === 12) hour = 0;
    return { hour, minute: min };
  };

  const start = parse12h(matches[0]);
  const end = matches.length > 1 ? parse12h(matches[1]) : null;
  return { start, end };
}

function getNextWeekday(dayName) {
  const targetDay = DAY_INDEX[dayName];
  if (!targetDay) return null;

  const now = DateTime.now().setZone(TIMEZONE);
  const currentDay = now.weekday; // 1=Mon, 7=Sun
  let daysAhead = targetDay - currentDay;
  if (daysAhead <= 0) daysAhead += 7;
  return now.plus({ days: daysAhead });
}

async function migrate() {
  const pool = await mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  });

  try {
    const [events] = await pool.execute('SELECT id, day, time FROM events WHERE starts_at IS NULL');
    console.log(`Found ${events.length} events to migrate`);

    for (const event of events) {
      if (!DAY_INDEX[event.day]) {
        console.log(`  Skipping event ${event.id} "${event.day}" (On Call / Special Event — admin must assign date)`);
        continue;
      }

      const parsed = parseTimeStr(event.time);
      if (!parsed) {
        console.log(`  Skipping event ${event.id} — could not parse time "${event.time}"`);
        continue;
      }

      const nextDate = getNextWeekday(event.day);
      const startsLocal = nextDate.set({ hour: parsed.start.hour, minute: parsed.start.minute, second: 0 });
      const startsUtc = startsLocal.toUTC().toFormat('yyyy-MM-dd HH:mm:ss');

      let endsUtc = null;
      if (parsed.end) {
        let endsLocal = nextDate.set({ hour: parsed.end.hour, minute: parsed.end.minute, second: 0 });
        // Handle overnight events (end time before start time)
        if (endsLocal < startsLocal) endsLocal = endsLocal.plus({ days: 1 });
        endsUtc = endsLocal.toUTC().toFormat('yyyy-MM-dd HH:mm:ss');
      }

      await pool.execute(
        'UPDATE events SET starts_at = ?, ends_at = ?, timezone = ? WHERE id = ?',
        [startsUtc, endsUtc, TIMEZONE, event.id]
      );
      console.log(`  Migrated event ${event.id}: ${event.day} ${event.time} → ${startsUtc} UTC`);
    }

    console.log('Migration complete');
  } finally {
    await pool.end();
  }
}

migrate().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
