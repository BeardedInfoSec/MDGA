const express = require('express');
const fetch = require('node-fetch');
const pool = require('../db');
const { requireAuth, requirePermission } = require('../middleware/auth');
const { sendApprovalEmail } = require('../services/email');

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

    // Forward to Discord webhook (fire and forget)
    const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
    if (webhookUrl && webhookUrl !== 'YOUR_WEBHOOK_URL_HERE') {
      const payload = {
        embeds: [{
          title: 'New Guild Application',
          color: 0xB91C1C,
          fields: [
            { name: 'Character Name', value: characterName, inline: true },
            { name: 'Server', value: server, inline: true },
            { name: 'Class & Spec', value: classSpec, inline: true },
            { name: 'Discord', value: discord, inline: true },
            { name: 'PvP Experience', value: experience || 'Not provided', inline: false },
            { name: 'Why MDGA?', value: whyJoin || 'Not provided', inline: false },
          ],
          footer: { text: `App #${result.insertId} | MDGA Website` },
          timestamp: new Date().toISOString(),
        }],
      };
      fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }).catch(err => console.error('Discord webhook error:', err));
    }

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
