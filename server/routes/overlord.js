const express = require('express');
const pool = require('../db');
const { requireAuth, requireOfficer } = require('../middleware/auth');
const { uploadSingleImage, saveValidatedImage, sanitizeLocalImageUrl } = require('../middleware/upload');

const router = express.Router();

// Newest issue first. COALESCE so issues without an explicit issue_date
// fall back to upload time; id breaks ties within the same day.
const LIST_QUERY = `
  SELECT n.id, n.image_url, n.title, n.issue_date, n.created_at,
         u.display_name, u.username
  FROM overlord_newsletters n
  LEFT JOIN users u ON u.id = n.created_by
  ORDER BY COALESCE(n.issue_date, DATE(n.created_at)) DESC, n.id DESC
`;

// GET /api/overlord — public, no auth. Powers the hidden /overlord page.
router.get('/', async (req, res) => {
  try {
    const [rows] = await pool.execute(LIST_QUERY);
    res.json({ newsletters: rows });
  } catch (err) {
    console.error('Overlord fetch error:', err);
    res.status(500).json({ error: 'Failed to fetch newsletters' });
  }
});

// POST /api/overlord — officer+, upload an image file (or provide a URL).
router.post('/', requireAuth, requireOfficer, uploadSingleImage.single('image'), async (req, res) => {
  try {
    let imageUrl = sanitizeLocalImageUrl(req.body.imageUrl) || '';

    if (req.file) {
      const filename = await saveValidatedImage(req.file);
      imageUrl = `/uploads/${filename}`;
    }

    if (!imageUrl) {
      return res.status(400).json({ error: 'Provide an image file or imageUrl' });
    }

    const title = (req.body.title || '').trim() || null;
    // Accept YYYY-MM-DD; anything else is stored as NULL and falls back to
    // created_at for ordering/display.
    const rawDate = (req.body.issueDate || '').trim();
    const issueDate = /^\d{4}-\d{2}-\d{2}$/.test(rawDate) ? rawDate : null;

    const [result] = await pool.execute(
      'INSERT INTO overlord_newsletters (image_url, title, issue_date, created_by) VALUES (?, ?, ?, ?)',
      [imageUrl, title, issueDate, req.user.id]
    );

    res.status(201).json({
      id: result.insertId,
      image_url: imageUrl,
      title,
      issue_date: issueDate,
    });
  } catch (err) {
    console.error('Overlord add error:', err);
    res.status(500).json({ error: 'Failed to add newsletter' });
  }
});

// PUT /api/overlord/:id — officer+, edit title / issue date.
router.put('/:id', requireAuth, requireOfficer, async (req, res) => {
  try {
    const [rows] = await pool.execute('SELECT id FROM overlord_newsletters WHERE id = ?', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Newsletter not found' });

    const title = req.body.title !== undefined ? ((req.body.title || '').trim() || null) : undefined;
    const rawDate = req.body.issueDate !== undefined ? (req.body.issueDate || '').trim() : undefined;
    const issueDate = rawDate === undefined
      ? undefined
      : (/^\d{4}-\d{2}-\d{2}$/.test(rawDate) ? rawDate : null);

    await pool.execute(
      `UPDATE overlord_newsletters
       SET title = COALESCE(?, title), issue_date = COALESCE(?, issue_date)
       WHERE id = ?`,
      [title === undefined ? null : title, issueDate === undefined ? null : issueDate, req.params.id]
    );
    res.json({ message: 'Newsletter updated' });
  } catch (err) {
    console.error('Overlord update error:', err);
    res.status(500).json({ error: 'Failed to update newsletter' });
  }
});

// DELETE /api/overlord/:id — officer+
router.delete('/:id', requireAuth, requireOfficer, async (req, res) => {
  try {
    const [result] = await pool.execute('DELETE FROM overlord_newsletters WHERE id = ?', [req.params.id]);
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Newsletter not found' });
    res.json({ message: 'Newsletter deleted' });
  } catch (err) {
    console.error('Overlord delete error:', err);
    res.status(500).json({ error: 'Failed to delete newsletter' });
  }
});

// Multer error handling (mirrors the carousel route).
router.use((err, req, res, next) => {
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({ error: 'File too large. Maximum 15MB.' });
  }
  if (err.message && (err.message.includes('JPEG') || err.message.includes('image') || err.message.includes('File type'))) {
    return res.status(400).json({ error: err.message });
  }
  return res.status(400).json({ error: 'Image upload failed' });
});

module.exports = router;
