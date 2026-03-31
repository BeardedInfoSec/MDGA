const express = require('express');
const pool = require('../db');
const { requireAuth, requireOfficer } = require('../middleware/auth');
const { uploadSingleImage, saveValidatedImage } = require('../middleware/upload');

const router = express.Router();
const DEFAULT_HOME_BACKGROUND_IMAGE = '/images/Screenshot_2026-02-06_18-21-39.png';

// GET /api/carousel — public, no auth
router.get('/', async (req, res) => {
  try {
    const [rows] = await pool.execute(
      'SELECT id, image_url, alt_text, sort_order FROM carousel_images ORDER BY sort_order ASC, id ASC'
    );
    const [settingRows] = await pool.execute(
      'SELECT setting_value FROM site_settings WHERE setting_key = ? LIMIT 1',
      ['home_background_image_url']
    );
    const backgroundImageUrl = settingRows[0]?.setting_value || DEFAULT_HOME_BACKGROUND_IMAGE;
    res.json({ images: rows, backgroundImageUrl });
  } catch (err) {
    console.error('Carousel fetch error:', err);
    res.status(500).json({ error: 'Failed to fetch carousel images' });
  }
});

// POST /api/carousel — officer+, upload file or provide URL
router.post('/', requireAuth, requireOfficer, uploadSingleImage.single('image'), async (req, res) => {
  try {
    let imageUrl = req.body.imageUrl || '';
    const altText = req.body.altText || '';

    // If a file was uploaded, save it and use the upload path
    if (req.file) {
      const filename = await saveValidatedImage(req.file);
      imageUrl = `/uploads/${filename}`;
    }

    if (!imageUrl) {
      return res.status(400).json({ error: 'Provide an image file or imageUrl' });
    }

    const requestedOrder = req.body.sortOrder !== undefined ? parseInt(req.body.sortOrder, 10) : null;
    let finalOrder;

    if (requestedOrder !== null && !isNaN(requestedOrder)) {
      // Shift existing images at this position and above up by 1
      await pool.execute(
        'UPDATE carousel_images SET sort_order = sort_order + 1 WHERE sort_order >= ?',
        [requestedOrder]
      );
      finalOrder = requestedOrder;
    } else {
      // Append to end
      const [[{ maxOrder }]] = await pool.execute(
        'SELECT COALESCE(MAX(sort_order), 0) AS maxOrder FROM carousel_images'
      );
      finalOrder = maxOrder + 1;
    }

    const [result] = await pool.execute(
      'INSERT INTO carousel_images (image_url, alt_text, sort_order) VALUES (?, ?, ?)',
      [imageUrl, altText, finalOrder]
    );

    res.status(201).json({
      id: result.insertId,
      image_url: imageUrl,
      alt_text: altText,
      sort_order: finalOrder,
    });
  } catch (err) {
    console.error('Carousel add error:', err);
    res.status(500).json({ error: 'Failed to add carousel image' });
  }
});

// GET /api/carousel/settings — officer+
router.get('/settings', requireAuth, requireOfficer, async (req, res) => {
  try {
    const [settingRows] = await pool.execute(
      'SELECT setting_value FROM site_settings WHERE setting_key = ? LIMIT 1',
      ['home_background_image_url']
    );
    const backgroundImageUrl = settingRows[0]?.setting_value || DEFAULT_HOME_BACKGROUND_IMAGE;
    res.json({ backgroundImageUrl });
  } catch (err) {
    console.error('Carousel settings fetch error:', err);
    res.status(500).json({ error: 'Failed to fetch image settings' });
  }
});

// PUT /api/carousel/settings/background — officer+
router.put('/settings/background', requireAuth, requireOfficer, uploadSingleImage.single('image'), async (req, res) => {
  try {
    let imageUrl = req.body.imageUrl || '';

    if (req.file) {
      const filename = await saveValidatedImage(req.file);
      imageUrl = `/uploads/${filename}`;
    }

    if (!imageUrl) {
      return res.status(400).json({ error: 'Provide an image file or imageUrl' });
    }

    await pool.execute(`
      INSERT INTO site_settings (setting_key, setting_value)
      VALUES (?, ?)
      ON DUPLICATE KEY UPDATE
        setting_value = VALUES(setting_value),
        updated_at = CURRENT_TIMESTAMP
    `, ['home_background_image_url', imageUrl]);

    return res.json({ message: 'Background image updated', backgroundImageUrl: imageUrl });
  } catch (err) {
    console.error('Carousel background update error:', err);
    return res.status(500).json({ error: 'Failed to update background image' });
  }
});

// PUT /api/carousel/:id — officer+, update alt_text / sort_order
router.put('/:id', requireAuth, requireOfficer, async (req, res) => {
  try {
    const { altText, sortOrder } = req.body;
    const [rows] = await pool.execute('SELECT id, sort_order FROM carousel_images WHERE id = ?', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Image not found' });

    const currentOrder = rows[0].sort_order;
    const newOrder = sortOrder !== undefined ? parseInt(sortOrder, 10) : null;

    // If sort_order is changing, shift other images to make room
    if (newOrder !== null && !isNaN(newOrder) && newOrder !== currentOrder) {
      // Shift images at the target position and above up by 1 (excluding the current image)
      await pool.execute(
        'UPDATE carousel_images SET sort_order = sort_order + 1 WHERE sort_order >= ? AND id != ?',
        [newOrder, req.params.id]
      );
    }

    await pool.execute(
      'UPDATE carousel_images SET alt_text = COALESCE(?, alt_text), sort_order = COALESCE(?, sort_order) WHERE id = ?',
      [altText !== undefined ? altText : null, newOrder !== null && !isNaN(newOrder) ? newOrder : null, req.params.id]
    );
    res.json({ message: 'Carousel image updated' });
  } catch (err) {
    console.error('Carousel update error:', err);
    res.status(500).json({ error: 'Failed to update carousel image' });
  }
});

// DELETE /api/carousel/:id — officer+
router.delete('/:id', requireAuth, requireOfficer, async (req, res) => {
  try {
    const [rows] = await pool.execute('SELECT id FROM carousel_images WHERE id = ?', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Image not found' });

    await pool.execute('DELETE FROM carousel_images WHERE id = ?', [req.params.id]);

    // Re-index remaining images sequentially (1, 2, 3, ...)
    const [remaining] = await pool.execute('SELECT id FROM carousel_images ORDER BY sort_order ASC, id ASC');
    for (let i = 0; i < remaining.length; i++) {
      await pool.execute('UPDATE carousel_images SET sort_order = ? WHERE id = ?', [i + 1, remaining[i].id]);
    }

    res.json({ message: 'Carousel image deleted' });
  } catch (err) {
    console.error('Carousel delete error:', err);
    res.status(500).json({ error: 'Failed to delete carousel image' });
  }
});

// Multer error handling
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
