const fs = require('fs/promises');
const multer = require('multer');
const path = require('path');
const crypto = require('crypto');
const sharp = require('sharp');

const UPLOAD_DIR = path.join(__dirname, '..', '..', 'uploads');
const MAX_FILE_SIZE = 15 * 1024 * 1024; // 15MB raw upload limit (server compresses to WebP)
const MAX_WIDTH = 1920;
const WEBP_QUALITY = 80;
// Hard cap on decoded pixels (width × height × frames) to defend against
// decompression bombs — a small file can declare a huge canvas. ~32 MP is
// generous for any real screenshot/banner while far below sharp's ~268 MP
// default. Applied to the sharp path AND validated for GIFs (which we store
// as-is and therefore must check explicitly).
const MAX_INPUT_PIXELS = 32 * 1000 * 1000;

const MIME_TO_EXT = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/avif': 'avif',
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

  // AVIF: ISOBMFF box, bytes 4-7 = "ftyp", brand at 8-11 in {avif, avis, mif1}.
  // Some encoders use "mif1" as the major brand for still images even when
  // the file is functionally AVIF — sharp handles all three the same way.
  if (
    buffer[4] === 0x66 && buffer[5] === 0x74 && buffer[6] === 0x79 && buffer[7] === 0x70
  ) {
    const brand = buffer.slice(8, 12).toString('ascii');
    if (brand === 'avif' || brand === 'avis' || brand === 'mif1') {
      return 'avif';
    }
  }

  return null;
}

function fileFilter(req, file, cb) {
  if (ALLOWED_MIME_TYPES.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Only JPEG, PNG, GIF, WebP, and AVIF images are allowed'), false);
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
    // GIFs are stored byte-for-byte (to preserve animation), so they never
    // pass through sharp's resize/limit. Validate dimensions × frames here so
    // a crafted GIF can't be a decompression bomb served to every visitor.
    const meta = await sharp(file.buffer, { animated: true }).metadata();
    const frames = meta.pages || 1;
    const totalPixels = (meta.width || 0) * (meta.pageHeight || meta.height || 0) * frames;
    if (!totalPixels || totalPixels > MAX_INPUT_PIXELS) {
      throw new Error('Image dimensions are too large');
    }
    outputBuffer = file.buffer;
    outputExt = 'gif';
  } else {
    outputBuffer = await sharp(file.buffer, { limitInputPixels: MAX_INPUT_PIXELS })
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

// Validate a client-supplied image URL. We only allow server-local upload
// paths (what saveValidatedImage produces) plus the static /images mount —
// NOT arbitrary external URLs (off-site hotlink / tracking-pixel that leaks
// visitor IPs) or data:/javascript: URIs. Returns the trimmed path or null.
function sanitizeLocalImageUrl(raw) {
  const s = String(raw || '').trim();
  if (!s) return null;
  // Must be a root-relative path into our own upload/image mounts. Reject
  // protocol-relative (//host), absolute URLs, and any scheme.
  if (/^\/(uploads|images)\/[A-Za-z0-9._\-/]+$/.test(s) && !s.includes('..')) {
    return s;
  }
  return null;
}

module.exports = {
  uploadSingleImage,
  saveValidatedImage,
  sanitizeLocalImageUrl,
  MAX_FILE_SIZE,
};
