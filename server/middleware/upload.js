const fs = require('fs/promises');
const multer = require('multer');
const path = require('path');
const crypto = require('crypto');
const sharp = require('sharp');

const UPLOAD_DIR = path.join(__dirname, '..', '..', 'uploads');
const MAX_FILE_SIZE = 15 * 1024 * 1024; // 15MB raw upload limit (server compresses to WebP)
const MAX_WIDTH = 1920;
const WEBP_QUALITY = 80;

const MIME_TO_EXT = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/webp': 'webp',
};
const ALLOWED_MIME_TYPES = Object.keys(MIME_TO_EXT);

function detectImageExtension(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 12) return null;

  // JPEG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'jpg';

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47 &&
    buffer[4] === 0x0d && buffer[5] === 0x0a && buffer[6] === 0x1a && buffer[7] === 0x0a
  ) {
    return 'png';
  }

  // GIF: GIF87a or GIF89a
  if (
    buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46 &&
    buffer[3] === 0x38 && (buffer[4] === 0x37 || buffer[4] === 0x39) && buffer[5] === 0x61
  ) {
    return 'gif';
  }

  // WebP: RIFF....WEBP
  if (
    buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46 &&
    buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50
  ) {
    return 'webp';
  }

  return null;
}

function fileFilter(req, file, cb) {
  if (ALLOWED_MIME_TYPES.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Only JPEG, PNG, GIF, and WebP images are allowed'), false);
  }
}

const uploadSingleImage = multer({
  storage: multer.memoryStorage(),
  fileFilter,
  limits: { fileSize: MAX_FILE_SIZE },
});

async function saveValidatedImage(file) {
  if (!file || !Buffer.isBuffer(file.buffer)) {
    throw new Error('No image file provided');
  }

  const detectedExt = detectImageExtension(file.buffer);
  if (!detectedExt) {
    throw new Error('Uploaded file is not a valid image');
  }

  const expectedExt = MIME_TO_EXT[file.mimetype];
  if (!expectedExt || expectedExt !== detectedExt) {
    throw new Error('File type does not match uploaded content');
  }

  await fs.mkdir(UPLOAD_DIR, { recursive: true });

  // Compress and convert to WebP (skip animated GIFs — store as-is)
  let outputBuffer;
  let outputExt;

  if (detectedExt === 'gif') {
    outputBuffer = file.buffer;
    outputExt = 'gif';
  } else {
    outputBuffer = await sharp(file.buffer)
      .resize({ width: MAX_WIDTH, withoutEnlargement: true })
      .webp({ quality: WEBP_QUALITY })
      .toBuffer();
    outputExt = 'webp';
  }

  const filename = `${Date.now()}-${crypto.randomBytes(8).toString('hex')}.${outputExt}`;
  const filePath = path.join(UPLOAD_DIR, filename);
  await fs.writeFile(filePath, outputBuffer, { flag: 'wx' });

  return filename;
}

module.exports = {
  uploadSingleImage,
  saveValidatedImage,
  MAX_FILE_SIZE,
};
