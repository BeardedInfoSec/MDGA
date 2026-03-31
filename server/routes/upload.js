const express = require('express');
const { uploadSingleImage, saveValidatedImage } = require('../middleware/upload');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// POST /api/upload
router.post('/', requireAuth, uploadSingleImage.single('image'), async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No image file provided' });
    }

    const filename = await saveValidatedImage(req.file);
    const imageUrl = `/uploads/${filename}`;
    return res.json({ imageUrl });
  } catch (err) {
    return next(err);
  }
});

// Multer error handling
router.use((err, req, res, next) => {
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({ error: 'File too large. Maximum 15MB.' });
  }
  if (err.message && (
    err.message.includes('JPEG') ||
    err.message.includes('image') ||
    err.message.includes('File type')
  )) {
    return res.status(400).json({ error: err.message });
  }
  return res.status(400).json({ error: 'Image upload failed' });
});

module.exports = router;
