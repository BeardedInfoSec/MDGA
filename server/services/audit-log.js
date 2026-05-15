// Tiny wrapper around the admin_actions table. Fire-and-forget by design —
// audit logging must never block the user-facing action it records, so any
// DB error gets logged to console and swallowed. If audit accuracy ever
// becomes critical, switch to awaiting the insert at the call sites.
const pool = require('../db');

/**
 * @param {object} args
 * @param {number} args.adminUserId — id of the user performing the action
 * @param {string} args.actionType — short, snake_case verb (e.g. "post.delete")
 * @param {string} [args.targetType] — entity type the action affected
 * @param {number|string} [args.targetId] — entity id
 * @param {string} [args.summary] — human-readable one-liner
 * @param {object} [args.metadata] — JSON-serializable extra context
 */
async function logAdminAction({ adminUserId, actionType, targetType, targetId, summary, metadata }) {
  if (!adminUserId || !actionType) return;
  try {
    await pool.execute(
      `INSERT INTO admin_actions
         (admin_user_id, action_type, target_type, target_id, summary, metadata)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        adminUserId,
        String(actionType).slice(0, 60),
        targetType ? String(targetType).slice(0, 40) : null,
        targetId != null ? targetId : null,
        summary ? String(summary).slice(0, 500) : null,
        metadata ? JSON.stringify(metadata) : null,
      ]
    );
  } catch (err) {
    console.error('[audit-log] insert failed:', err.message);
  }
}

module.exports = { logAdminAction };
