const express = require('express');
const pool = require('../db');
const { requireAuth, requirePermission } = require('../middleware/auth');
const { sendApprovalEmail } = require('../services/email');
const { sendApplicationAlert } = require('../bot');

const router = express.Router();

// POST /api/applications
router.post('/', async (req, res) => {
  try {
    const { characterName, server, classSpec, discord, experience, whyJoin } = req.body;

    if (!characterName || !server || !classSpec || !discord) {
      return res.status(400).json({ error: 'Required fields: characterName, server, classSpec, discord' });
    }

    const [result] = await pool.execute(
      'INSERT INTO applications (character_name, server, class_spec, discord_tag, experience, why_join) VALUES (?, ?, ?, ?, ?, ?)',
      [characterName, server, classSpec, discord, experience || '', whyJoin || '']
    );

    // Officer-channel notification via the Discord bot. Previously used
    // DISCORD_WEBHOOK_URL but that env var was silently empty in prod,
    // dropping every application notification on the floor. The bot path
    // reuses the OFFICER_CHANNEL_ID that's already configured for
    // approval/rank-change alerts. Fire-and-forget — failures log.
    sendApplicationAlert({
      id: result.insertId,
      characterName, server, classSpec, discord, experience, whyJoin,
    }).catch((err) => console.error('Application alert dispatch failed:', err));

    res.status(201).json({ message: 'Application submitted', id: result.insertId });
  } catch (err) {
    console.error('Application error:', err);
    res.status(500).json({ error: 'Failed to submit application' });
  }
});

// GET /api/applications
router.get('/', requireAuth, requirePermission('admin.manage_applications'), async (req, res) => {
  try {
    const status = req.query.status || 'pending';
    const [rows] = await pool.execute(
      'SELECT * FROM applications WHERE status = ? ORDER BY submitted_at DESC',
      [status]
    );
    res.json({ applications: rows });
  } catch (err) {
    console.error('Get applications error:', err);
    res.status(500).json({ error: 'Failed to fetch applications' });
  }
});

// PUT /api/applications/:id
router.put('/:id', requireAuth, requirePermission('admin.manage_applications'), async (req, res) => {
  try {
    const { status } = req.body;
    if (!['approved', 'denied'].includes(status)) {
      return res.status(400).json({ error: 'Status must be approved or denied' });
    }
    const [result] = await pool.execute(
      'UPDATE applications SET status = ?, reviewed_by = ?, reviewed_at = NOW() WHERE id = ?',
      [status, req.user.id, req.params.id]
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Application not found' });
    }

    // Send approval email if the application is linked to a user account
    let emailSent = false;
    if (status === 'approved') {
      const [apps] = await pool.execute('SELECT user_id FROM applications WHERE id = ?', [req.params.id]);
      if (apps[0]?.user_id) {
        const [users] = await pool.execute('SELECT email, display_name, username FROM users WHERE id = ?', [apps[0].user_id]);
        if (users[0]?.email) {
          // Also activate the user account
          await pool.execute('UPDATE users SET status = ? WHERE id = ? AND status != ?', ['active', apps[0].user_id, 'active']);
          emailSent = await sendApprovalEmail(users[0].email, users[0].display_name || users[0].username);
        }
      }
    }

    res.json({ message: `Application ${status}`, emailSent });
  } catch (err) {
    console.error('Review application error:', err);
    res.status(500).json({ error: 'Failed to review application' });
  }
});

module.exports = router;
